"""Pesquisa: o aluno de teste do avaliador já nasce cadastrado e matriculado na turma

Até aqui, `pesquisa-acesso` criava o aluno de teste só em `auth.users`. A linha em `alunos` e a
matrícula (`trg_pesquisa_matricula_aluno_teste`, 20261123_01) esperavam o primeiro cadastro no app.
O avaliador da rodada não entra no app com o aluno de teste, então a turma de demonstração ficava
com 0 matrículas: a aba Turmas dizia "Alunos 0" e a janela de Matrículas, "Nenhum aluno com acesso
liberado".

## `fn_pesquisa_cadastrar_aluno_teste(p_avaliador bigint)`

Para o avaliador dado, se o aluno de teste existe em `auth.users`:

- grava a linha em `alunos` (nome "Aluno de teste", o e-mail do aluno de teste). Sem
  `aluno_perfil`: pela regra do vetor, aluno sem linha ali conta como `mastermind`. O
  `trg_alunos_after_insert` o liga a todos os professores sem acesso, como faz com todo aluno;
- libera o acesso só ao professor avaliador (`professor_aluno.has_acesso = true`);
- matricula na turma de demonstração. O INSERT em `classe_aluno` dispara os mesmos gatilhos da
  matrícula pelo console (o job de personalização do aluno, `fn_enqueue_student_enrollment_job`).

Não sobrescreve nada: aluno que já tem linha em `alunos` fica como está, e matrícula repetida não
entra. Se o avaliador um dia entrar no app com o aluno de teste, `concluir_cadastro_aluno` grava o
cadastro por cima (`ON CONFLICT (id) DO UPDATE`) e o questionário grava o perfil.

Falhar aqui não desfaz a conta: o erro vira `WARNING`, como nos exemplos da turma (20261124_01).

## Quando roda

- `trg_pesquisa_avaliador_aluno_teste`, AFTER INSERT em `pesquisa_avaliador`: a preparação
  (`pesquisa_preparar_avaliador`) grava o avaliador depois de copiar a turma, e o aluno de teste já
  existe em `auth.users` (a edge function o cria antes de chamar a RPC);
- o `upgrade` cadastra os avaliadores que já existem.

`EXECUTE` só para o `service_role`: o cliente não cria aluno.
"""

from __future__ import annotations

from alembic import op

revision = "20261124_05"
down_revision = "20261124_04"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_pesquisa_cadastrar_aluno_teste(p_avaliador bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  r record;
  v_matriculou integer;
BEGIN
  SELECT pa.aluno_teste_id, pa.aluno_teste_email, pa.professor_id, pa.classe_id
    INTO r
    FROM public.pesquisa_avaliador pa
   WHERE pa.id = p_avaliador;
  IF r.aluno_teste_id IS NULL OR r.classe_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.aluno_teste_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.alunos (id, nome, email, apelido, descricao)
  VALUES (r.aluno_teste_id, 'Aluno de teste',
          coalesce(nullif(lower(btrim(r.aluno_teste_email)), ''),
                   (SELECT lower(u.email) FROM auth.users u WHERE u.id = r.aluno_teste_id)),
          'Teste', 'Aluno de teste da pesquisa com professores')
  ON CONFLICT (id) DO NOTHING;

  IF r.professor_id IS NOT NULL THEN
    INSERT INTO public.professor_aluno (professor_id, aluno_id, has_acesso)
    VALUES (r.professor_id, r.aluno_teste_id, true)
    ON CONFLICT (professor_id, aluno_id) DO UPDATE SET has_acesso = true;
  END IF;

  INSERT INTO public.classe_aluno (classe_id, aluno_id)
  SELECT r.classe_id, r.aluno_teste_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = r.classe_id AND ca.aluno_id = r.aluno_teste_id
   );
  GET DIAGNOSTICS v_matriculou = ROW_COUNT;
  RETURN v_matriculou > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_cadastrar_aluno_teste(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_cadastrar_aluno_teste(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_pesquisa_avaliador_aluno_teste()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_pesquisa_cadastrar_aluno_teste(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- O aluno de teste é conveniência da pesquisa: falhar aqui não desfaz a conta do avaliador.
    RAISE WARNING 'pesquisa: não cadastrou o aluno de teste do avaliador %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_pesquisa_avaliador_aluno_teste() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pesquisa_avaliador_aluno_teste ON public.pesquisa_avaliador;
CREATE TRIGGER trg_pesquisa_avaliador_aluno_teste
  AFTER INSERT ON public.pesquisa_avaliador
  FOR EACH ROW EXECUTE FUNCTION public.trg_pesquisa_avaliador_aluno_teste();

-- Quem já foi preparado: cadastra e matricula uma vez. A API roda esta migration ao subir, e um erro
-- solto aqui a derrubaria: avisa e segue.
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.pesquisa_avaliador ORDER BY id LOOP
    BEGIN
      PERFORM public.fn_pesquisa_cadastrar_aluno_teste(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pesquisa: não cadastrou o aluno de teste do avaliador %: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$do$;
"""


DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_pesquisa_avaliador_aluno_teste ON public.pesquisa_avaliador;
DROP FUNCTION IF EXISTS public.trg_pesquisa_avaliador_aluno_teste();
DROP FUNCTION IF EXISTS public.fn_pesquisa_cadastrar_aluno_teste(bigint);
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
