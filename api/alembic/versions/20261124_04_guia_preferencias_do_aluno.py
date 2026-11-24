"""O que o Guia aprende sobre o aluno para ensinar com o que ele gosta (`aluno_preferencias_guia`)

O Guia explica com analogia e ponte, mas não lembrava do que o aluno gosta nem de que jeito de
conversar funciona com ele. Esta tabela guarda isso, uma linha por aluno:

- `gostos`: até 8 temas de um **catálogo fixo** (games, futebol, música…), para a analogia sair do
  mundo do aluno. Valor fora do catálogo não entra (CHECK), e a API filtra antes;
- `resumo`: até 400 caracteres livres sobre como ele gosta de aprender e do que gosta, escritos
  pelo modelo **na mesma chamada que responde** (nenhuma chamada a mais) e passados pelo mascarador
  do chat (`app/services/mascaramento_chat.py`): nome, e-mail, telefone, documento e link saem
  antes de gravar. O prompt proíbe dado sensível (saúde, religião, política, sexualidade, origem,
  família, endereço);
- `postura`: a postura que está funcionando com ele (`instigar`, `acolher` ou `pragmatico`);
- `coleta_ligada`: o aluno pode desligar. Desligada, a API não grava nem lê.

**Quem escreve é a API** (`service_role`), porque é saída do modelo; o UPSERT dela só toca a linha
com `coleta_ligada`. **Quem lê é só o próprio aluno** (policy de SELECT), na tela de Perfil. O
professor **não lê, de propósito**: é o que o aluno conta ao Guia sobre a vida dele, não dado da
turma. O aluno apaga e liga ou desliga a coleta por duas RPCs `SECURITY DEFINER`
(`guia_preferencias_apagar`, `guia_preferencias_coleta`); sem INSERT, UPDATE nem DELETE direto.

**Retenção:** a linha sai com a conta (FK) e, parada, aos 395 dias de `atualizado_em`, o prazo da
telemetria derivada.

Nada aqui foi aplicado em produção.

Revision ID: 20261124_04
Revises: 20261124_03
Create Date: 2026-11-24
"""

from __future__ import annotations

from alembic import op

revision = "20261124_04"
down_revision = "20261124_03"
branch_labels = None
depends_on = None

# A mesma lista de `app/services/preferencias_do_guia.py` (GOSTOS) e do app; o teste confere.
GOSTOS = (
    "games",
    "futebol",
    "outros_esportes",
    "musica",
    "filmes_series",
    "anime_quadrinhos",
    "tecnologia",
    "ciencia_espaco",
    "natureza_animais",
    "culinaria",
    "arte_desenho",
    "moda",
    "viagens",
    "historia_mitologia",
    "carros_motos",
    "livros",
)
POSTURAS = ("instigar", "acolher", "pragmatico")
MAX_GOSTOS = 8
MAX_RESUMO = 400
DIAS = 395


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


TABELA = f"""
CREATE TABLE IF NOT EXISTS public.aluno_preferencias_guia (
  aluno_id      uuid PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  gostos        text[] NOT NULL DEFAULT '{{}}'
                CHECK (cardinality(gostos) <= {MAX_GOSTOS} AND gostos <@ ARRAY[{_lista(GOSTOS)}]),
  resumo        text CHECK (resumo IS NULL OR char_length(resumo) BETWEEN 1 AND {MAX_RESUMO}),
  postura       text CHECK (postura IS NULL OR postura IN ({_lista(POSTURAS)})),
  coleta_ligada boolean NOT NULL DEFAULT true,
  versao        text NOT NULL DEFAULT 'v1',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.aluno_preferencias_guia IS
  'Gostos (catalogo), resumo livre mascarado e postura que funciona com o aluno, aprendidos pelo Guia '
  '(20261124_04). Grava so a API; le so o proprio aluno; o professor nao le, de proposito.';
COMMENT ON COLUMN public.aluno_preferencias_guia.resumo IS
  'Escrito pelo modelo e passado pelo mascarador da API. Sem dado sensivel nem dado de contato.';
"""

RLS = """
ALTER TABLE public.aluno_preferencias_guia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aluno_preferencias_guia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.aluno_preferencias_guia TO authenticated;
GRANT ALL ON TABLE public.aluno_preferencias_guia TO service_role;

DROP POLICY IF EXISTS aluno_preferencias_guia_sel ON public.aluno_preferencias_guia;
CREATE POLICY aluno_preferencias_guia_sel ON public.aluno_preferencias_guia
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());
"""

FUNCOES = """
CREATE OR REPLACE FUNCTION public.guia_preferencias_apagar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  UPDATE public.aluno_preferencias_guia
     SET gostos = '{}', resumo = NULL, postura = NULL, atualizado_em = now()
   WHERE aluno_id = auth.uid();
END;
$fn$;

COMMENT ON FUNCTION public.guia_preferencias_apagar() IS
  'Apaga o que o Guia guardou sobre o aluno logado. A coleta continua como estava (20261124_04).';

CREATE OR REPLACE FUNCTION public.guia_preferencias_coleta(p_ligada boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_ligada IS NULL THEN
    RAISE EXCEPTION 'p_ligada_obrigatorio' USING ERRCODE = '22023';
  END IF;
  -- So aluno tem linha: a FK recusa outra conta.
  INSERT INTO public.aluno_preferencias_guia (aluno_id, coleta_ligada)
  VALUES (auth.uid(), p_ligada)
  ON CONFLICT (aluno_id) DO UPDATE
     SET coleta_ligada = EXCLUDED.coleta_ligada,
         atualizado_em = now();
  -- Desligar tambem apaga: guardar o que o aluno pediu para nao guardar nao faz sentido.
  IF NOT p_ligada THEN
    UPDATE public.aluno_preferencias_guia
       SET gostos = '{}', resumo = NULL, postura = NULL
     WHERE aluno_id = auth.uid();
  END IF;
  RETURN p_ligada;
END;
$fn$;

COMMENT ON FUNCTION public.guia_preferencias_coleta(boolean) IS
  'Liga ou desliga a coleta de preferencias pelo Guia do aluno logado; desligar apaga (20261124_04).';

REVOKE ALL ON FUNCTION public.guia_preferencias_apagar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guia_preferencias_coleta(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guia_preferencias_apagar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guia_preferencias_coleta(boolean) TO authenticated;
"""

RETENCAO = f"""
INSERT INTO public.retencao_politica
  (tabela, acao, coluna_aluno, coluna_tempo, dias, dias_pesquisa, ordem, categoria, motivo)
VALUES
  ('aluno_preferencias_guia', 'apagar', 'aluno_id', 'atualizado_em', {DIAS}, NULL, 89, 'chat_derivado',
   'gostos e postura que o Guia aprendeu sobre o aluno; sai parada pelo prazo da telemetria derivada')
ON CONFLICT (tabela, acao) DO NOTHING;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)
    op.execute(FUNCOES)
    op.execute(RETENCAO)


def downgrade() -> None:
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'aluno_preferencias_guia'")
    op.execute("DROP FUNCTION IF EXISTS public.guia_preferencias_coleta(boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.guia_preferencias_apagar()")
    op.execute("DROP TABLE IF EXISTS public.aluno_preferencias_guia")
