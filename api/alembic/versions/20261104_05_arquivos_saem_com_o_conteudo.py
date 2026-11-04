"""Arquivo do conteúdo sai do Storage e do R2 junto com a linha (#632).

Decisão de 04/11: conteúdo apagado pelo console **ou direto no banco** leva os arquivos dele, no
bucket do Supabase e no R2. Não há como manter arquivo sem uso.

Até aqui, só a conta do professor apagada (`trailup_apagar_turma_inteira`, `20261024_07`) e três
tabelas (`materiais_gerados`, `fontes_personalizacao` do aluno, `rag_openai_files`) punham
arquivo na `retencao_fila_externa`. Apagar um conteúdo, uma mídia, uma questão, um card ou uma
personalização deixava o arquivo para trás. O console limpava só o bucket `conteudos` do Supabase,
só ao apagar a turma ou o tópico, e nunca o R2 — onde está toda escrita nova.

O que entra: um gatilho por COMANDO (tabela de transição) em cada uma das cinco tabelas que
guardam caminho de arquivo:

| tabela | de onde sai o caminho | bucket no Storage |
|---|---|---|
| `conteudos` | `conteudo` (caminho puro, URL, ou imagem citada no texto), `metadata.files[].path`, `metadata.media_storage_path` | `conteudos` |
| `midias` | `url` | `conteudos` |
| `questoes` | `midia_url` | `conteudos` |
| `cards` | `imagem_url` | `conteudos` |
| `conteudo_personalizado` | `materiais.<tipo>.storage_path` e `materiais.<tipo>.partes[].storage_path` | `conteudo_aluno` |

- **DELETE** enfileira todo caminho da linha apagada. Vale também na cascata (turma → tópico →
  conteúdo → mídia/card), porque o gatilho é da tabela, não do console.
- **UPDATE** enfileira só o caminho que **deixou de ser citado** (trocar a imagem do card, a mídia,
  regerar a personalização com outro arquivo). Gatilho de UPDATE com tabela de transição não aceita
  lista de colunas, então ele roda em todo UPDATE e compara velho × novo.

Quem decide se apaga continua sendo o worker (`retencao_externa.py`): antes de apagar, ele confere
se OUTRA linha ainda aponta para o arquivo — turma, tópico e atividade duplicados apontam para os
mesmos caminhos (`duplicar_*`, `20261011_*`), e o texto de outra turma pode citar a imagem. O
gatilho é generoso de propósito; a conferência é que é estrita.

**Fila reaberta.** `retencao_fila_externa` é única por `(destino, bucket, caminho)`, e os gatilhos
antigos fazem `ON CONFLICT DO NOTHING`. Com arquivo compartilhado isso perde a exclusão: a primeira
turma apagada marca o item como `ainda_referenciado` (processado), e quando a cópia é apagada o
pedido novo bate no item velho e some. Aqui, o conflito com item JÁ PROCESSADO reabre o item (zera
`processado_em`, tentativas e a idade mínima); item ainda pendente fica como está.

Caminho que já é URL de fora (`http...` que não é do nosso Storage nem do gateway) não entra:
`trailup_caminho_arquivo` devolve NULL para ele.

Revision ID: 20261104_05
Revises: 20261104_04
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op

revision = "20261104_05"
down_revision = "20261104_04"
branch_labels = None
depends_on = None

# Sem "(?:" nos regex: o `text()` do SQLAlchemy leria ":nome" como parâmetro. Grupos de captura e
# o índice certo no `regexp_matches` resolvem.
FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.trailup_caminhos_do_conteudo(p_conteudo text, p_metadata jsonb)
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT DISTINCT c
    FROM (
      SELECT public.trailup_caminho_arquivo(p_conteudo)
      UNION ALL
      SELECT m[2] FROM regexp_matches(coalesce(p_conteudo, ''),
        'storage-redirect[?]([^#\s"''()<>]*&)?path=([^&#\s"''()<>]+)', 'g') AS m
      UNION ALL
      SELECT m[2] FROM regexp_matches(coalesce(p_conteudo, ''),
        '/storage/v1/object/(public|sign|authenticated)/conteudos/([^?#\s"''()<>]+)', 'g') AS m
      UNION ALL
      SELECT public.trailup_caminho_arquivo(f ->> 'path')
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_metadata -> 'files') = 'array'
                                       THEN p_metadata -> 'files' ELSE '[]'::jsonb END) AS f
      UNION ALL
      SELECT public.trailup_caminho_arquivo(p_metadata ->> 'media_storage_path')
    ) AS s (c)
   WHERE c IS NOT NULL AND c !~* '^https?://';
$f$;

CREATE OR REPLACE FUNCTION public.trailup_caminhos_da_personalizacao(p_materiais jsonb)
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT DISTINCT c
    FROM (
      SELECT e.v ->> 'storage_path'
        FROM jsonb_each(CASE WHEN jsonb_typeof(p_materiais) = 'object' THEN p_materiais ELSE '{}'::jsonb END)
             AS e (k, v)
       WHERE jsonb_typeof(e.v) = 'object'
      UNION ALL
      SELECT parte ->> 'storage_path'
        FROM jsonb_each(CASE WHEN jsonb_typeof(p_materiais) = 'object' THEN p_materiais ELSE '{}'::jsonb END)
             AS e (k, v),
             LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                                               THEN e.v -> 'partes' ELSE '[]'::jsonb END) AS parte
    ) AS s (c)
   WHERE c IS NOT NULL AND btrim(c) <> '' AND c !~* '^https?://';
$f$;

-- Põe cada caminho na fila do Storage e do R2 (mesma chave). Item já processado volta a valer:
-- ver "Fila reaberta" no docstring da migration.
CREATE OR REPLACE FUNCTION public.trailup_enfileirar_arquivos(p_caminhos text[], p_bucket text, p_tabela text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT d.destino, CASE WHEN d.destino = 'storage' THEN p_bucket ELSE '' END, c.caminho,
         jsonb_build_object('tabela', p_tabela, 'motivo', 'conteudo_apagado')
    FROM (SELECT DISTINCT btrim(x) AS caminho FROM unnest(p_caminhos) AS x
           WHERE x IS NOT NULL AND length(btrim(x)) BETWEEN 1 AND 1024) AS c
   CROSS JOIN (VALUES ('storage'), ('r2')) AS d (destino)
  ON CONFLICT (destino, bucket, caminho) DO UPDATE
     SET processado_em = NULL, resultado = NULL, ultimo_erro = NULL, tentativas = 0,
         criado_em = now(), proxima_tentativa_em = now(), ref = EXCLUDED.ref
   WHERE public.retencao_fila_externa.processado_em IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$f$;

CREATE OR REPLACE FUNCTION public.trg_arquivos_do_conteudo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_caminhos text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(c) INTO v_caminhos
      FROM velhas v, LATERAL public.trailup_caminhos_do_conteudo(v.conteudo, v.metadata) AS c;
  ELSE
    SELECT array_agg(c) INTO v_caminhos
      FROM (SELECT c FROM velhas v, LATERAL public.trailup_caminhos_do_conteudo(v.conteudo, v.metadata) AS c
            EXCEPT
            SELECT c FROM novas n, LATERAL public.trailup_caminhos_do_conteudo(n.conteudo, n.metadata) AS c) AS s;
  END IF;
  IF v_caminhos IS NOT NULL THEN
    PERFORM public.trailup_enfileirar_arquivos(v_caminhos, 'conteudos', TG_TABLE_NAME);
  END IF;
  RETURN NULL;
END;
$f$;

-- midias.url, questoes.midia_url, cards.imagem_url: uma coluna de caminho, bucket `conteudos`.
-- A coluna vem em TG_ARGV[0]; o caminho sai de `trailup_caminho_arquivo`.
CREATE OR REPLACE FUNCTION public.trg_arquivos_da_coluna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_caminhos text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    EXECUTE format(
      'SELECT array_agg(DISTINCT public.trailup_caminho_arquivo(v.%1$I)) FROM velhas v', TG_ARGV[0])
      INTO v_caminhos;
  ELSE
    EXECUTE format(
      'SELECT array_agg(c) FROM (SELECT public.trailup_caminho_arquivo(v.%1$I) AS c FROM velhas v'
      ' EXCEPT SELECT public.trailup_caminho_arquivo(n.%1$I) FROM novas n) AS s', TG_ARGV[0])
      INTO v_caminhos;
  END IF;
  v_caminhos := array_remove(v_caminhos, NULL);
  IF cardinality(v_caminhos) > 0 THEN
    PERFORM public.trailup_enfileirar_arquivos(v_caminhos, 'conteudos', TG_TABLE_NAME);
  END IF;
  RETURN NULL;
END;
$f$;

CREATE OR REPLACE FUNCTION public.trg_arquivos_da_personalizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_caminhos text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(c) INTO v_caminhos
      FROM velhas v, LATERAL public.trailup_caminhos_da_personalizacao(v.materiais) AS c;
  ELSE
    SELECT array_agg(c) INTO v_caminhos
      FROM (SELECT c FROM velhas v, LATERAL public.trailup_caminhos_da_personalizacao(v.materiais) AS c
            EXCEPT
            SELECT c FROM novas n, LATERAL public.trailup_caminhos_da_personalizacao(n.materiais) AS c) AS s;
  END IF;
  IF v_caminhos IS NOT NULL THEN
    PERFORM public.trailup_enfileirar_arquivos(v_caminhos, 'conteudo_aluno', TG_TABLE_NAME);
  END IF;
  RETURN NULL;
END;
$f$;
"""

FUNCOES_INTERNAS = (
    "public.trailup_caminhos_do_conteudo(text, jsonb)",
    "public.trailup_caminhos_da_personalizacao(jsonb)",
    "public.trailup_enfileirar_arquivos(text[], text, text)",
    "public.trg_arquivos_do_conteudo()",
    "public.trg_arquivos_da_coluna()",
    "public.trg_arquivos_da_personalizacao()",
)

# (tabela, função, argumento)
GATILHOS = (
    ("conteudos", "trg_arquivos_do_conteudo", ""),
    ("midias", "trg_arquivos_da_coluna", "'url'"),
    ("questoes", "trg_arquivos_da_coluna", "'midia_url'"),
    ("cards", "trg_arquivos_da_coluna", "'imagem_url'"),
    ("conteudo_personalizado", "trg_arquivos_da_personalizacao", ""),
)


def _gatilhos() -> list[str]:
    sql = []
    for tabela, funcao, arg in GATILHOS:
        for op_, ref in (
            ("DELETE", "REFERENCING OLD TABLE AS velhas"),
            ("UPDATE", "REFERENCING OLD TABLE AS velhas NEW TABLE AS novas"),
        ):
            nome = f"trg_{tabela}_arquivos_{op_.lower()}"
            sql.append(f"DROP TRIGGER IF EXISTS {nome} ON public.{tabela}")
            sql.append(
                f"CREATE TRIGGER {nome} AFTER {op_} ON public.{tabela} {ref}"
                f" FOR EACH STATEMENT EXECUTE FUNCTION public.{funcao}({arg})"
            )
    return sql


def upgrade() -> None:
    op.execute(FUNCOES)
    for assinatura in FUNCOES_INTERNAS:
        op.execute(f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated")
    for sql in _gatilhos():
        op.execute(sql)


def downgrade() -> None:
    for tabela, _funcao, _arg in GATILHOS:
        for op_ in ("delete", "update"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{tabela}_arquivos_{op_} ON public.{tabela}")
    for assinatura in reversed(FUNCOES_INTERNAS):
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
