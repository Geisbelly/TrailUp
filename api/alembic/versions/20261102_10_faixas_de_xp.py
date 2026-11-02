"""Faixas de XP com título, e a faixa do aluno com quanto falta para a próxima (#143)

O XP já existia: é a soma de `eventos_aluno.valor` do aluno na turma, a mesma conta do critério
`pontuacao` do rank e do XP do CSV do professor (`professor_notas_da_turma`, `20261101_06`). Faltava
a progressão legível: um título e a barra até a faixa seguinte.

## As faixas

`xp_faixa` guarda o piso de cada faixa e o título. O nível é a posição pelo piso, então incluir ou
tirar uma faixa não exige renumerar nada. Configuração, não constante: os limites e os títulos não
aparecem em nenhum outro lugar do código, nem no app.

| Nível | XP | Título |
|---|---|---|
| 1 | 0 a 49 | Ponto de partida |
| 2 | 50 a 149 | Primeiros passos |
| 3 | 150 a 249 | Trilha aberta |
| 4 | 250 a 399 | Ritmo de trilha |
| 5 | 400 a 549 | Meio da subida |
| 6 | 550 a 749 | Acima da mata |
| 7 | 750 a 999 | Vista do vale |
| 8 | 1000 a 1299 | Rumo ao cume |
| 9 | 1300 a 1699 | Cume |
| 10 | 1700 em diante | Lenda da trilha |

As cinco primeiras são as da Tabela 1 de O'Donovan et al.: curtas de propósito, para a primeira
subida custar pouco. Depois a largura cresce (200, 250, 300, 400). A escala cabe no que o app paga
hoje (medido em produção, 2026-11-02): conteúdo concluído 10, atividade concluída 15, acerto 5,
presença 10, conquistas de 10 a 50 (as 28 somam 845). Uma turma inteira fica na casa de 1000 a 2000
XP, então a última faixa é para quem fez quase tudo.

Os títulos são etapas da subida, não pessoas: "Andarilho" ou "Desbravador" teriam gênero, e a etapa
vale para qualquer aluno. Nenhum deles colide com nome que o app já usa (regra "um ícone, um
significado" do CLAUDE.md, que vale também para nome).

**Por turma, não global.** O XP é o da matrícula, como no rank e no CSV. Um aluno em duas turmas tem
uma faixa em cada.

## Leitura

- `xp_faixa`: RLS ligada, `SELECT` para `authenticated` (é parâmetro de interface, não teto
  anti-abuso), nada para `anon`. Escrita só pelo dono ou pelo `service_role`.
- `fn_faixa_xp(p_xp)`: a faixa de um valor de XP. Pura sobre a tabela; XP negativo (a ranqueada
  aceita perder ponto) conta como 0.
- `aluno_faixa_xp(p_classe_id)`: a faixa de quem chama, na turma. `SECURITY DEFINER` porque resolve
  a turma de eventos antigos por `fn_eventos_aluno_resolve_classe_id`, que lê tópico, conteúdo e
  atividade. Confere a matrícula antes (`42501`) e só soma os eventos do próprio `auth.uid()`.
  Devolve nenhuma linha se `xp_faixa` estiver vazia, e o app esconde o cartão.

Leitura pura, sem modelo de linguagem: banco (regra de fronteira). O app lê direto do Supabase.

**Fora daqui:** o peso do XP na nota final (terceiro item do aceite da #143). Ele muda
`trailup_recalcular_nota_classe_aluno`, e o número (2,9% da nota no estudo, §5.3.1) é para combinar
com o professor do piloto.

Revision ID: 20261102_10
Revises: 20261102_09
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_10"
down_revision = "20261102_09"
branch_labels = None
depends_on = None

FAIXAS = (
    (0, "Ponto de partida"),
    (50, "Primeiros passos"),
    (150, "Trilha aberta"),
    (250, "Ritmo de trilha"),
    (400, "Meio da subida"),
    (550, "Acima da mata"),
    (750, "Vista do vale"),
    (1000, "Rumo ao cume"),
    (1300, "Cume"),
    (1700, "Lenda da trilha"),
)

TABELA = r"""
CREATE TABLE IF NOT EXISTS public.xp_faixa (
  xp_minimo integer PRIMARY KEY CHECK (xp_minimo >= 0),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 40),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xp_faixa IS
  'Faixas de XP (#143): piso e título. O nível é a posição pelo piso. Lida pelo app via aluno_faixa_xp.';

ALTER TABLE public.xp_faixa ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.xp_faixa FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.xp_faixa FROM authenticated;
GRANT SELECT ON public.xp_faixa TO authenticated;
GRANT ALL ON public.xp_faixa TO service_role;

DROP POLICY IF EXISTS xp_faixa_sel ON public.xp_faixa;
CREATE POLICY xp_faixa_sel ON public.xp_faixa
  FOR SELECT TO authenticated
  USING (true);
"""

SEMENTE = (
    "INSERT INTO public.xp_faixa (xp_minimo, titulo) VALUES\n"
    + ",\n".join(f"  ({minimo}, '{titulo}')" for minimo, titulo in FAIXAS)
    + "\nON CONFLICT (xp_minimo) DO NOTHING;\n"
)

FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.fn_faixa_xp(p_xp numeric)
RETURNS TABLE (
  nivel integer,
  titulo text,
  xp_minimo integer,
  proximo_minimo integer,
  proximo_titulo text,
  total_niveis integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH faixas AS (
    SELECT row_number() OVER (ORDER BY f.xp_minimo)::integer AS nivel,
           f.titulo,
           f.xp_minimo,
           lead(f.xp_minimo) OVER (ORDER BY f.xp_minimo) AS proximo_minimo,
           lead(f.titulo) OVER (ORDER BY f.xp_minimo) AS proximo_titulo,
           count(*) OVER ()::integer AS total_niveis
      FROM public.xp_faixa f
  )
  -- A primeira faixa vale mesmo se o piso dela não for 0: ninguém fica sem faixa.
  SELECT fx.nivel, fx.titulo, fx.xp_minimo, fx.proximo_minimo, fx.proximo_titulo, fx.total_niveis
    FROM faixas fx
   WHERE fx.xp_minimo <= GREATEST(COALESCE(p_xp, 0), 0) OR fx.nivel = 1
   ORDER BY fx.xp_minimo DESC
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.fn_faixa_xp(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_faixa_xp(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aluno_faixa_xp(p_classe_id bigint)
RETURNS TABLE (
  classe_id bigint,
  xp numeric,
  nivel integer,
  titulo text,
  total_niveis integer,
  xp_minimo integer,
  proximo_minimo integer,
  proximo_titulo text,
  xp_na_faixa numeric,
  tamanho_faixa integer,
  xp_para_proxima numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
DECLARE
  v_aluno uuid := auth.uid();
  v_xp numeric;
BEGIN
  IF v_aluno IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno AND ca.classe_id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- A mesma conta do critério `pontuacao` do rank e do CSV do professor, sem janela de período.
  SELECT GREATEST(COALESCE(sum(ea.valor), 0), 0)
    INTO v_xp
    FROM public.eventos_aluno ea
   WHERE ea.aluno_id = v_aluno
     AND COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe_id;

  RETURN QUERY
  SELECT p_classe_id,
         v_xp,
         f.nivel,
         f.titulo,
         f.total_niveis,
         f.xp_minimo,
         f.proximo_minimo,
         f.proximo_titulo,
         GREATEST(v_xp - f.xp_minimo, 0),
         f.proximo_minimo - f.xp_minimo,
         CASE WHEN f.proximo_minimo IS NULL THEN NULL ELSE f.proximo_minimo - v_xp END
    FROM public.fn_faixa_xp(v_xp) f;
END;
$fn$;

REVOKE ALL ON FUNCTION public.aluno_faixa_xp(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aluno_faixa_xp(bigint) TO authenticated, service_role;
"""

DOWNGRADE = r"""
DROP FUNCTION IF EXISTS public.aluno_faixa_xp(bigint);
DROP FUNCTION IF EXISTS public.fn_faixa_xp(numeric);
DROP TABLE IF EXISTS public.xp_faixa;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(SEMENTE)
    op.execute(FUNCOES)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
