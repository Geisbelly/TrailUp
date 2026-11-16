"""Cobertura do material: quanto do texto, do áudio e dos slides o aluno percorreu

Tempo ativo diz quanto o aluno ficou com o material aberto, não quanto dele percorreu. Dez minutos
num áudio de dois e dez minutos num áudio de quarenta são o mesmo número hoje. Guo et al. medem o
tempo relativo à duração; esta migration traz o dado que falta para isso
(`docs/analises/2026-11-15-metricas-de-uso-mercado-e-literatura.md`, P6).

## O que entra

Seis colunas **opcionais** em `telemetria_time_metric_entries`, preenchidas só no escopo `material`
e só por build novo do app:

| coluna | o que é |
|---|---|
| `conteudo_altura_px`, `janela_altura_px` | altura do conteúdo rolável e da janela visível (texto) |
| `midia_duracao_seg`, `midia_posicao_max_seg` | duração e maior posição alcançada tocando (áudio) |
| `slides_vistos`, `slides_total` | slides distintos abertos e total do deck nativo (apresentação) |

E a view `vw_metricas_cobertura_material` (`security_invoker`): uma linha por aluno × material, com a
fração percorrida.

## Regras

- **Nenhum CHECK.** Valor estranho não pode custar o lote: o app manda o que mediu, e a view limita a
  fração a [0, 1]. Linha antiga, ou de build antigo, fica com as seis colunas nulas, e a fração sai
  nula, nunca zero.
- **Texto:** `max(max_depth_px) ÷ (conteúdo − janela)`, só sobre os lotes que trouxeram as alturas.
  Conteúdo que cabe na janela conta como percorrido inteiro.
- **Áudio:** `maior posição ÷ duração`.
- **Apresentação:** `slides vistos ÷ total`, só no deck nativo (`apresentacao-slides`). O deck em HTML
  do BrainHexPDF não informa o slide atual ao app; a fração dele fica nula até o deck mandar isso.
- **Cada lote leva o acumulado do componente** (posição máxima, slides vistos desde que abriu), e a
  view usa o máximo entre os lotes. Por isso a soma entre lotes não se aplica aqui, ao contrário do
  tempo.

## Quem lê

A view herda a RLS da tabela: o aluno lê a própria linha e o professor lê os alunos das turmas dele.
`anon` não tem GRANT.

## Downgrade

Derruba a view, remove a chave do catálogo e as seis colunas.

Revision ID: 20261116_01
Revises: 20261115_06
Create Date: 2026-11-16
"""

from alembic import op

revision = "20261116_01"
down_revision = "20261115_06"
branch_labels = None
depends_on = None

COLUNAS = (
    ("conteudo_altura_px", "numeric"),
    ("janela_altura_px", "numeric"),
    ("midia_duracao_seg", "numeric"),
    ("midia_posicao_max_seg", "numeric"),
    ("slides_vistos", "integer"),
    ("slides_total", "integer"),
)

ADICIONA = "\n".join(
    f"ALTER TABLE public.telemetria_time_metric_entries ADD COLUMN IF NOT EXISTS {nome} {tipo} NULL;"
    for nome, tipo in COLUNAS
) + """
COMMENT ON COLUMN public.telemetria_time_metric_entries.conteudo_altura_px IS
  'Escopo material, texto: altura do conteudo rolavel. Nulo em build anterior a 20261116_01.';
COMMENT ON COLUMN public.telemetria_time_metric_entries.janela_altura_px IS
  'Escopo material, texto: altura da janela visivel.';
COMMENT ON COLUMN public.telemetria_time_metric_entries.midia_duracao_seg IS
  'Escopo material, audio: duracao da faixa.';
COMMENT ON COLUMN public.telemetria_time_metric_entries.midia_posicao_max_seg IS
  'Escopo material, audio: maior posicao alcancada com a faixa tocando, acumulada desde que o player abriu.';
COMMENT ON COLUMN public.telemetria_time_metric_entries.slides_vistos IS
  'Escopo material, deck nativo: slides distintos abertos desde que o deck abriu.';
COMMENT ON COLUMN public.telemetria_time_metric_entries.slides_total IS
  'Escopo material, deck nativo: total de slides.';
"""

VIEW = """
CREATE VIEW public.vw_metricas_cobertura_material WITH (security_invoker = on) AS
WITH por_material AS (
  SELECT e.aluno_id,
         e.classe_id,
         e.topico_id,
         e.conteudo_id,
         e.material_key,
         e.material_tipo,
         min(e.captured_at) AS primeiro_lote_em,
         max(e.captured_at) AS ultimo_lote_em,
         sum(e.active_sec) AS tempo_ativo_seg,
         max(e.max_depth_px) FILTER (WHERE e.conteudo_altura_px IS NOT NULL) AS rolagem_max_px,
         max(e.conteudo_altura_px) AS conteudo_altura_px,
         max(e.janela_altura_px) AS janela_altura_px,
         max(e.midia_duracao_seg) AS midia_duracao_seg,
         max(e.midia_posicao_max_seg) AS midia_posicao_max_seg,
         max(e.slides_vistos) AS slides_vistos,
         max(e.slides_total) AS slides_total
    FROM public.telemetria_time_metric_entries e
   WHERE e.scope = 'material'
     AND e.material_key IS NOT NULL
   GROUP BY e.aluno_id, e.classe_id, e.topico_id, e.conteudo_id, e.material_key, e.material_tipo
),
com_fracao AS (
  SELECT p.*,
         CASE
           WHEN p.material_tipo IN ('markdown', 'texto') THEN 'texto'
           WHEN p.material_tipo = 'audio' THEN 'audio'
           WHEN p.material_tipo = 'apresentacao-slides' THEN 'apresentacao'
         END AS tipo_cobertura,
         CASE
           WHEN p.material_tipo IN ('markdown', 'texto')
                AND p.conteudo_altura_px > 0 AND p.janela_altura_px > 0 THEN
             CASE WHEN p.conteudo_altura_px <= p.janela_altura_px THEN 1
                  ELSE COALESCE(p.rolagem_max_px, 0) / (p.conteudo_altura_px - p.janela_altura_px) END
           WHEN p.material_tipo = 'audio' AND p.midia_duracao_seg > 0 THEN
             COALESCE(p.midia_posicao_max_seg, 0) / p.midia_duracao_seg
           WHEN p.material_tipo = 'apresentacao-slides' AND p.slides_total > 0 THEN
             COALESCE(p.slides_vistos, 0)::numeric / p.slides_total
         END AS fracao_bruta
    FROM por_material p
)
-- O limite só onde há fração: `GREATEST(0, NULL)` é 0, e "não mediu" viraria "percorreu nada".
SELECT f.aluno_id, f.classe_id, f.topico_id, f.conteudo_id, f.material_key, f.material_tipo,
       f.primeiro_lote_em, f.ultimo_lote_em, f.tempo_ativo_seg, f.rolagem_max_px,
       f.conteudo_altura_px, f.janela_altura_px, f.midia_duracao_seg, f.midia_posicao_max_seg,
       f.slides_vistos, f.slides_total, f.tipo_cobertura,
       CASE WHEN f.fracao_bruta IS NOT NULL
            THEN round(LEAST(1, GREATEST(0, f.fracao_bruta)), 4) END AS cobertura
  FROM com_fracao f;

COMMENT ON VIEW public.vw_metricas_cobertura_material IS
  'Fracao percorrida de cada material, por aluno: texto (rolagem), audio (posicao) e deck nativo (slides). Nula sem o dado do build novo. RLS da tabela de origem.';

REVOKE ALL ON public.vw_metricas_cobertura_material FROM anon;
GRANT SELECT ON public.vw_metricas_cobertura_material TO authenticated;
"""

CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('prof.cobertura_material', 'Cobertura do material',
   'Fração do material percorrida pelo aluno: rolagem do texto, posição do áudio e slides do deck nativo.',
   '{professor,dev}', 'fração de 0 a 1', 'todo o histórico do material', 'vw_metricas_cobertura_material',
   'build do app sem a coleta, deck em HTML ou tipo de material sem medida', 'nenhuma', '{}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""

DOWNGRADE = "DROP VIEW IF EXISTS public.vw_metricas_cobertura_material;\n" + """
DELETE FROM public.metricas_catalogo WHERE chave = 'prof.cobertura_material';
""" + "\n".join(
    f"ALTER TABLE public.telemetria_time_metric_entries DROP COLUMN IF EXISTS {nome};" for nome, _ in COLUNAS
)


def upgrade() -> None:
    op.execute(ADICIONA)
    op.execute("DROP VIEW IF EXISTS public.vw_metricas_cobertura_material;")
    op.execute(VIEW)
    op.execute(CATALOGO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
