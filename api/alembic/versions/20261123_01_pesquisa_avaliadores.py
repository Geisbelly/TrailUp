"""Avaliadores da pesquisa com professores: conta, turma de demonstração e aluno de teste

A pesquisa de avaliação do TrailUp com professores (cartilha em `/pesquisa/professores`) dá a cada
avaliador aprovado um acesso de professor, um aluno de teste e uma turma de demonstração só dele.
Quem aprova é a equipe, numa planilha do Google ligada ao formulário de inscrição
(`scripts/apps-script-formulario-professores/Planilha.gs`); quem cria as contas é a edge function
`pesquisa-acesso`, com `service_role`. Nenhuma das duas passa pela API: não há modelo de linguagem
no meio (regra de fronteira do CLAUDE.md).

**Uma turma por avaliador, copiada de uma turma-modelo.** A turma não é compartilhada: numa turma
comum, quem chegasse depois encontraria a entrega já corrigida e a sugestão já decidida (tarefas
T5 e T6 do roteiro), e veria o conteúdo que os outros puseram. A posse continua sendo
`classe.professor_id`; nada aqui cria coprofessor.

`pesquisa_preparar_avaliador()` (só `service_role`):
- grava `professor` já com `liberado = true` num INSERT. Não pode ser UPDATE: o gatilho
  `professor_block_self_approve` recusa mudar `liberado` sem o e-mail do dono no JWT;
- copia a turma-modelo (`app_config.pesquisa_classe_modelo_id`, `publico = false`) com
  `duplicar_classe`. Essa função confere a posse por `auth.uid()`, e a chamada vem do
  `service_role`, sem `sub`. Por isso as claims passam a ser as do DONO DA TURMA-MODELO só durante a
  cópia (`set_config(..., true)`, local à transação, nunca `SET` de sessão: ver o pooler), e voltam
  ao valor anterior logo depois. Em seguida a cópia passa para o avaliador;
- registra a linha em `pesquisa_avaliador`, com o aluno de teste já ligado.

**Matrícula do aluno de teste pelo banco.** O aluno só existe em `alunos` depois de fazer o
cadastro no app (perfil BrainHex, data de nascimento), então a matrícula não pode ser feita na
criação da conta. `trg_pesquisa_matricula_aluno_teste` é um CONSTRAINT TRIGGER adiado: roda no
COMMIT do cadastro, depois que `concluir_cadastro_aluno` gravou `aluno_perfil`. Se rodasse logo
depois do INSERT em `alunos`, o job de matrícula (`fn_enqueue_student_enrollment_job`) nasceria sem
perfil dominante. Falhar ao matricular não desfaz o cadastro.

**Aba do console.** `pesquisa_meu_acesso()` devolve o link do formulário de avaliação
(`app_config.pesquisa_link_avaliacao`, `publico = false`) só para o avaliador e o dono, e NULL para
os outros professores. O link fica fora do bundle do site, que é público.

**Retenção.** `retencao_politica` ganha a linha `vida_da_conta`: `professor_id` é ON DELETE
CASCADE, então apagar a conta do avaliador leva junto nome e e-mail dele daqui. O dado da pesquisa
em si mora nos formulários do Google, não nesta tabela.

**RLS.** A tabela nasce com RLS ligada (o `ensure_rls` faria isso de qualquer jeito) e com a policy
no mesmo commit: o avaliador lê a própria linha (é o que mostra a aba "Avaliar o TrailUp" no
console) e o dono lê todas. Escrita é só do `service_role`: `anon` e `authenticated` perdem
INSERT/UPDATE/DELETE.

Revision ID: 20261123_01
Revises: 20261121_05
Create Date: 2026-11-23
"""

from alembic import op

revision = "20261123_01"
down_revision = "20261121_05"
branch_labels = None
depends_on = None


SQL = r"""
CREATE TABLE IF NOT EXISTS public.pesquisa_avaliador (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  nome text NOT NULL,
  instituicao text,
  professor_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  aluno_teste_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  aluno_teste_email text,
  classe_id bigint REFERENCES public.classe(id) ON DELETE SET NULL,
  situacao text NOT NULL DEFAULT 'conta_criada',
  conta_criada_em timestamptz NOT NULL DEFAULT now(),
  confirmacao_enviada_em timestamptz,
  confirmado_em timestamptz,
  acesso_enviado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pesquisa_avaliador_situacao_check CHECK (
    situacao IN ('conta_criada', 'confirmacao_enviada', 'confirmado', 'acesso_enviado', 'encerrado')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pesquisa_avaliador_email_uq ON public.pesquisa_avaliador (lower(email));

COMMENT ON TABLE public.pesquisa_avaliador IS
  'Avaliadores da pesquisa com professores. Escrita só pelo service_role (edge function pesquisa-acesso); '
  'o avaliador lê a própria linha e o dono lê todas. Senha nunca é gravada aqui.';

-- Prazo de guarda (LGPD, #195): a linha vive enquanto a conta de professor existir e sai com ela
-- (professor_id ON DELETE CASCADE). Ao fim da pesquisa, os acessos são apagados (cartilha).
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo)
VALUES ('pesquisa_avaliador', 'vida_da_conta', 'professor_id', 'vida_da_conta',
        'acesso do avaliador da pesquisa com professores; sai com a conta, apagada ao fim da pesquisa')
ON CONFLICT (tabela, acao) DO NOTHING;

ALTER TABLE public.pesquisa_avaliador ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pesquisa_avaliador FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pesquisa_avaliador TO authenticated;
GRANT ALL ON public.pesquisa_avaliador TO service_role;

DROP POLICY IF EXISTS pesquisa_avaliador_sel ON public.pesquisa_avaliador;
CREATE POLICY pesquisa_avaliador_sel ON public.pesquisa_avaliador
  FOR SELECT TO authenticated
  USING (professor_id = auth.uid() OR public.app_e_dono());

CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador(
  p_email text,
  p_nome text,
  p_instituicao text,
  p_professor uuid,
  p_aluno uuid,
  p_aluno_email text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_existente public.pesquisa_avaliador%ROWTYPE;
  v_modelo_txt text;
  v_modelo bigint;
  v_dono uuid;
  v_claims text;
  v_sub text;
  v_nova bigint;
  v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_professor IS NULL OR p_aluno IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'E-mail, nome, professor e aluno de teste são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  -- Idempotente: a planilha pode mandar o mesmo avaliador de novo (gatilho e clique juntos).
  SELECT * INTO v_existente FROM public.pesquisa_avaliador WHERE lower(email) = lower(btrim(p_email));
  IF FOUND THEN
    RETURN jsonb_build_object('ja_existia', true, 'classe_id', v_existente.classe_id,
                              'situacao', v_existente.situacao);
  END IF;

  SELECT valor INTO v_modelo_txt FROM public.app_config WHERE chave = 'pesquisa_classe_modelo_id';
  IF v_modelo_txt IS NULL OR v_modelo_txt !~ '^[0-9]{1,18}$' THEN
    RAISE EXCEPTION 'Configure app_config.pesquisa_classe_modelo_id com o id da turma-modelo.'
      USING ERRCODE = '22023';
  END IF;
  v_modelo := v_modelo_txt::bigint;

  SELECT professor_id INTO v_dono FROM public.classe WHERE id = v_modelo;
  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'A turma-modelo % não existe ou não tem professor.', v_modelo USING ERRCODE = '22023';
  END IF;

  -- INSERT já liberado: um UPDATE de liberado esbarraria em professor_block_self_approve.
  INSERT INTO public.professor (id, nome, descricao, instituicao, liberado)
  VALUES (p_professor, v_nome, 'Avaliador(a) da pesquisa com professores',
          nullif(btrim(coalesce(p_instituicao, '')), ''), true);

  -- duplicar_classe confere a posse por auth.uid(): durante a cópia, as claims são as do dono da
  -- turma-modelo. Local à transação (is_local = true) e restauradas em seguida.
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_dono::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  v_nova := public.duplicar_classe(v_modelo);
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  UPDATE public.classe
     SET professor_id = p_professor,
         descricao = 'Turma de demonstração – ' || v_nome
   WHERE id = v_nova;

  INSERT INTO public.pesquisa_avaliador (email, nome, instituicao, professor_id, aluno_teste_id,
                                         aluno_teste_email, classe_id)
  VALUES (lower(btrim(p_email)), v_nome, nullif(btrim(coalesce(p_instituicao, '')), ''), p_professor,
          p_aluno, lower(btrim(p_aluno_email)), v_nova);

  RETURN jsonb_build_object('ja_existia', false, 'classe_id', v_nova, 'situacao', 'conta_criada');
END;
$function$;

REVOKE ALL ON FUNCTION public.pesquisa_preparar_avaliador(text, text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pesquisa_preparar_avaliador(text, text, text, uuid, uuid, text)
  TO service_role;

-- A aba "Avaliar o TrailUp" do console. O link do formulário de avaliação não vai no bundle do
-- site (que é público): fica em app_config, publico = false, e só sai para o avaliador e o dono.
-- NULL para qualquer outro professor: é o que esconde a aba.
CREATE OR REPLACE FUNCTION public.pesquisa_meu_acesso()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
  SELECT CASE
    WHEN pa.id IS NOT NULL OR public.app_e_dono() THEN jsonb_build_object(
      'avaliador', pa.id IS NOT NULL,
      'classe_id', pa.classe_id,
      'aluno_teste_email', pa.aluno_teste_email,
      'link_avaliacao', (SELECT nullif(btrim(valor), '') FROM public.app_config WHERE chave = 'pesquisa_link_avaliacao')
    )
  END
  FROM (SELECT 1) um
  LEFT JOIN public.pesquisa_avaliador pa ON pa.professor_id = auth.uid() AND auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.pesquisa_meu_acesso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pesquisa_meu_acesso() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_pesquisa_matricula_aluno_teste()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  BEGIN
    INSERT INTO public.classe_aluno (classe_id, aluno_id)
    SELECT pa.classe_id, NEW.id
      FROM public.pesquisa_avaliador pa
     WHERE pa.aluno_teste_id = NEW.id
       AND pa.classe_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = pa.classe_id AND ca.aluno_id = NEW.id
       );
  EXCEPTION WHEN OTHERS THEN
    -- Matrícula é conveniência da pesquisa: falhar aqui não pode desfazer o cadastro do aluno.
    RAISE WARNING 'pesquisa: não matriculou o aluno de teste %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_matricula_aluno_teste() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pesquisa_matricula_aluno_teste ON public.alunos;
CREATE CONSTRAINT TRIGGER trg_pesquisa_matricula_aluno_teste
  AFTER INSERT ON public.alunos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_pesquisa_matricula_aluno_teste();
"""


DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_pesquisa_matricula_aluno_teste ON public.alunos;
DROP FUNCTION IF EXISTS public.fn_pesquisa_matricula_aluno_teste();
DROP FUNCTION IF EXISTS public.pesquisa_meu_acesso();
DROP FUNCTION IF EXISTS public.pesquisa_preparar_avaliador(text, text, text, uuid, uuid, text);
DROP TABLE IF EXISTS public.pesquisa_avaliador;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
