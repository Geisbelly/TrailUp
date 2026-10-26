"""URLs do Storage dentro de texto livre + versao minima do app nativo (#195)

## URLs dentro de texto

Markdown de conteudo, enunciado de questao, descricao de card, material
personalizado, item da bolsa... podem ter a URL PUBLICA de um dos buckets que
a 09/10 fecham (`conteudo_aluno`, `conteudos`, `perfil_fotos`,
`banners_fotos`) no MEIO do texto (`![fig](https://.../object/public/...)`).
Com o bucket fechado ela da' 400. A 09/10 so' reescrevem campo que e'
INTEIRO a URL.

`trailup_reescrever_urls_nos_textos(p_fechar)` troca, dentro dessas colunas,
`/storage/v1/object/public/<bucket privado>/` por
`/storage/v1/object/authenticated/<bucket privado>/` (e o inverso com
`p_fechar = false`). A forma `authenticated` e' a referencia de caminho que os
clientes ja' assinam na leitura (app: `resolveSupabaseStorageUrl`; console:
`urlsDoStorageNoTexto`; API/worker: `objeto_do_storage`). Nao vira URL do
gateway porque o gateway so' serve o que esta' em `vw_material_storage_paths`,
e imagem embutida em texto nao esta'. So' mexe na linha que tem a forma de
origem: rodar de novo nao muda nada.

`trailup_fechar_buckets_privados()` chama a reescrita depois de fechar os
buckets (resultado ganha `urls_em_textos`); `trailup_reabrir_buckets_publicos()`
desfaz (`urls_em_textos_revertidas`).

Os dois wrappers DESLIGAM, so' durante a propria transacao, os gatilhos
`trg_*_class_delta_job`: trocar a forma da URL (aqui e na 09/10) nao e'
mudanca de conteudo, e sem isso cada linha reescrita enfileirava regeracao da
personalizacao da turma inteira. Gatilho que ja' estava desligado continua
desligado. `ALTER TABLE ... DISABLE TRIGGER` pede dono da tabela: rodar no SQL
Editor (postgres), como ja' diz o roteiro.

## Arquivo de `conteudos` citado em texto

`trailup_turmas_que_usam_conteudo` (10) passa a contar tambem o arquivo de
`conteudos` CITADO dentro dos textos da turma (conteudo, questao, card,
atividade, material personalizado, cards personalizados, blocos gerados).
A bolsa (`bag_itens`) fica de fora: o aluno escreve nela, e citar um caminho
ali nao pode abrir o arquivo para a turma. Sem isso a imagem embutida reescrita acima nao assinava para o aluno
(o RLS so' via campo inteiro) e o worker de retencao a tratava como orfa.
Varredura por `strpos` - tabelas pequenas hoje; indice de trigrama fica para
quando crescer.

## Versao minima do app

Linhas `app_versao_minima` e `app_atualizacao_url` em `app_config`, publicas
(o anon le pela politica `app_config_sel`; ninguem do cliente grava) e VAZIAS
= desligado. O app nativo le no inicio e, se a versao dele for menor, mostra a
tela de atualizar com o link. Ligar ANTES de rodar
`trailup_fechar_buckets_privados()`, com a versao do build que ja' assina as
URLs dos buckets privados.

Revision ID: 20261024_11
Revises: 20261024_10
Create Date: 2026-10-25
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261024_11"
down_revision = "20261024_10"
branch_labels = None
depends_on = None


BUCKETS_PRIVADOS = ("conteudo_aluno", "conteudos", "perfil_fotos", "banners_fotos")

# Colunas de texto livre / json que podem ter URL do Storage no meio. Coluna que
# nao existe (ou de outro tipo) e' pulada.
COLUNAS_DE_TEXTO = (
    "conteudos.conteudo",
    "conteudos.metadata",
    "topicos.descricao",
    "atividades.descricao",
    "atividades.metadata",
    "questoes.enunciado",
    "questoes.alternativas",
    "questoes.resposta_correta",
    "cards.descricao",
    "cards_personalizados.descricao",
    "cards_personalizados.metadata",
    "conteudo_personalizado.plano",
    "conteudo_personalizado.materiais",
    "conteudo_personalizado.ai_patch",
    "personalizacao_blocos_gerados.markdown",
    "personalizacao_blocos_gerados.enriched_payload",
    "personalizacao_blocos_gerados.slides",
    "materiais_gerados.payload",
    "materiais_gerados.metadata",
    "materiais_gerados.arquivo_url",
    "bag_itens.conteudo",
    "bag_itens.frente",
    "bag_itens.verso",
    "bag_itens.metadata",
    "midias.metadata",
    "fontes_personalizacao.descricao",
    "fontes_personalizacao.metadata",
    "fontes_personalizacao.arquivo_url",
)

GATILHOS_DE_REGERACAO = (
    "trg_conteudos_class_delta_job",
    "trg_topicos_class_delta_job",
    "trg_atividades_class_delta_job",
    "trg_questoes_class_delta_job",
    "trg_cards_class_delta_job",
)

CHAVES_DE_VERSAO = (
    (
        "app_versao_minima",
        "Versao minima do app nativo (ex.: 1.0.5). Vazio = desligado. Ligar ANTES de "
        "trailup_fechar_buckets_privados(), com a versao que ja assina as URLs dos buckets privados (#195).",
    ),
    (
        "app_atualizacao_url",
        "Link (https) da loja ou do download do app, mostrado na tela de atualizar. Vazio = sem botao.",
    ),
)


def _lista_sql(itens) -> str:
    return "ARRAY[" + ", ".join(f"'{i}'" for i in itens) + "]::text[]"


_BUCKETS_RE = "|".join(BUCKETS_PRIVADOS)

REESCRITA_SQL = (
    r"""
CREATE OR REPLACE FUNCTION public.trailup_reescrever_urls_nos_textos(p_fechar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_padrao text := '/storage/v1/object/' || CASE WHEN p_fechar THEN 'public' ELSE 'authenticated' END
                   || '/(__BUCKETS__)/';
  v_troca text := '/storage/v1/object/' || CASE WHEN p_fechar THEN 'authenticated' ELSE 'public' END || '/\1/';
  v_alvo text;
  v_tabela text;
  v_coluna text;
  v_tipo text;
  v_n int;
  v_total jsonb := '{}'::jsonb;
BEGIN
  FOREACH v_alvo IN ARRAY __COLUNAS__ LOOP
    v_tabela := split_part(v_alvo, '.', 1);
    v_coluna := split_part(v_alvo, '.', 2);
    SELECT data_type INTO v_tipo
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_tabela AND column_name = v_coluna;
    IF v_tipo IS NULL OR v_tipo NOT IN ('text', 'character varying', 'json', 'jsonb') THEN
      CONTINUE;
    END IF;
    -- jsonb/json: troca no texto serializado e volta ao tipo. A troca nao cria
    -- aspas nem barra invertida, entao o json continua valido.
    EXECUTE format(
      'UPDATE public.%I SET %I = regexp_replace(%I::text, $1, $2, ''g'')::%s WHERE %I::text ~ $1',
      v_tabela, v_coluna, v_coluna,
      CASE v_tipo WHEN 'jsonb' THEN 'jsonb' WHEN 'json' THEN 'json' ELSE 'text' END,
      v_coluna)
      USING v_padrao, v_troca;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_total := v_total || jsonb_build_object(v_alvo, v_n);
    END IF;
  END LOOP;
  RETURN v_total;
END;
$f$;
REVOKE ALL ON FUNCTION public.trailup_reescrever_urls_nos_textos(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_reescrever_urls_nos_textos(boolean) TO service_role;

-- Liga/desliga os gatilhos de regeracao. Desligar devolve SO' os que estavam
-- ligados; religar recebe essa lista (gatilho que ja estava desligado fica).
CREATE OR REPLACE FUNCTION public.trailup_gatilhos_de_regeracao(p_ligar boolean, p_quais text[] DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  r record;
  v_mexidos text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT c.relname, t.tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relnamespace = 'public'::regnamespace
       AND NOT t.tgisinternal
       AND t.tgname = ANY (coalesce(p_quais, __GATILHOS__))
       AND (CASE WHEN p_ligar THEN t.tgenabled = 'D' ELSE t.tgenabled <> 'D' END)
  LOOP
    EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',
                   r.relname, CASE WHEN p_ligar THEN 'ENABLE' ELSE 'DISABLE' END, r.tgname);
    v_mexidos := v_mexidos || r.tgname::text;
  END LOOP;
  RETURN v_mexidos;
END;
$f$;
REVOKE ALL ON FUNCTION public.trailup_gatilhos_de_regeracao(boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_gatilhos_de_regeracao(boolean, text[]) TO service_role;
""".replace("__BUCKETS__", _BUCKETS_RE)
    .replace("__COLUNAS__", _lista_sql(COLUNAS_DE_TEXTO))
    .replace("__GATILHOS__", _lista_sql(GATILHOS_DE_REGERACAO))
)

WRAPPERS_SQL = r"""
CREATE OR REPLACE FUNCTION public.trailup_fechar_buckets_privados()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_gatilhos text[] := public.trailup_gatilhos_de_regeracao(false);
  v_aluno jsonb := public.trailup_fechar_buckets_do_aluno();
  v_prof jsonb := public.trailup_fechar_bucket_conteudos();
  v_textos jsonb := public.trailup_reescrever_urls_nos_textos(true);
BEGIN
  PERFORM public.trailup_gatilhos_de_regeracao(true, v_gatilhos);
  RETURN v_aluno || jsonb_build_object(
    'buckets_fechados', (v_aluno ->> 'buckets_fechados')::int + (v_prof ->> 'bucket_fechado')::int,
    'conteudos_professor', v_prof - 'bucket_fechado',
    'urls_em_textos', v_textos);
END;
$f$;

CREATE OR REPLACE FUNCTION public.trailup_reabrir_buckets_publicos(p_base_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_gatilhos text[] := public.trailup_gatilhos_de_regeracao(false);
  v_aluno jsonb := public.trailup_reabrir_buckets_do_aluno(p_base_url);
  v_prof int := 0;
  v_textos jsonb;
BEGIN
  -- Os caminhos puros de `conteudos` servem com o bucket publico ou privado.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets SET public = true WHERE id = 'conteudos' AND NOT public;
    GET DIAGNOSTICS v_prof = ROW_COUNT;
  END IF;
  v_textos := public.trailup_reescrever_urls_nos_textos(false);
  PERFORM public.trailup_gatilhos_de_regeracao(true, v_gatilhos);
  RETURN v_aluno || jsonb_build_object(
    'buckets_reabertos', (v_aluno ->> 'buckets_reabertos')::int + v_prof,
    'urls_em_textos_revertidas', v_textos);
END;
$f$;
REVOKE ALL ON FUNCTION public.trailup_fechar_buckets_privados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_reabrir_buckets_publicos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_fechar_buckets_privados() TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_reabrir_buckets_publicos(text) TO service_role;
"""

# A da 10 com mais um ramo: arquivo de `conteudos` CITADO dentro dos textos da turma.
_CITA = "public.trailup_texto_cita_conteudo"
TURMAS_QUE_USAM_SQL = r"""
-- O texto cita o objeto `p_nome` de `conteudos` (URL publica, assinada ou
-- autenticada, com ou sem os espacos codificados)?
CREATE OR REPLACE FUNCTION public.trailup_texto_cita_conteudo(p_texto text, p_nome text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT p_texto IS NOT NULL AND p_nome IS NOT NULL AND p_nome <> ''
     AND (strpos(p_texto, '/conteudos/' || p_nome) > 0
          OR strpos(p_texto, '/conteudos/' || replace(p_nome, ' ', '%20')) > 0)
$f$;
REVOKE ALL ON FUNCTION public.trailup_texto_cita_conteudo(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_texto_cita_conteudo(text, text) TO authenticated, service_role;

__ANTIGA__
""".replace("__ANTIGA__", "{ANTIGA}")


def _constante_da_10(nome: str) -> str:
    caminho = Path(__file__).with_name("20261024_10_bucket_conteudos_privado.py")
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError("nao achei a 20261024_10")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return str(getattr(modulo, nome))


def turmas_que_usam_da_10() -> str:
    """O `CREATE ... trailup_turmas_que_usam_conteudo` exatamente como a 10 emite."""
    achado = re.search(
        r"CREATE OR REPLACE FUNCTION public\.trailup_turmas_que_usam_conteudo\(p_nome text\).*?\n\$f\$;\n",
        _constante_da_10("FUNCOES_SQL"),
        re.S,
    )
    if not achado:
        raise RuntimeError("trailup_turmas_que_usam_conteudo nao encontrada na 20261024_10")
    return achado.group(0)


_RAMOS_DE_TEXTO = f"""
  UNION ALL
  SELECT t.classe_id, true
    FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
   WHERE {_CITA}(c.conteudo, p_nome) OR {_CITA}(c.metadata::text, p_nome)
  UNION ALL
  SELECT t.classe_id, true
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE {_CITA}(a.descricao, p_nome) OR {_CITA}(a.metadata::text, p_nome)
  UNION ALL
  SELECT t.classe_id, true
    FROM public.questoes q
    JOIN public.atividades a ON a.id = q.atividade_id
    JOIN public.topicos t ON t.id = a.topico_id
   WHERE {_CITA}(q.enunciado, p_nome) OR {_CITA}(q.alternativas::text, p_nome)
  UNION ALL
  SELECT t.classe_id, true
    FROM public.cards k
    JOIN public.conteudos c ON c.id = k.conteudo_id
    JOIN public.topicos t ON t.id = c.topico_id
   WHERE {_CITA}(k.descricao, p_nome)
  UNION ALL
  SELECT cp.classe_id, true
    FROM public.conteudo_personalizado cp
   WHERE {_CITA}(cp.plano::text, p_nome) OR {_CITA}(cp.materiais::text, p_nome)
      OR {_CITA}(cp.ai_patch::text, p_nome)
  UNION ALL
  SELECT kp.classe_id, true
    FROM public.cards_personalizados kp
   WHERE {_CITA}(kp.descricao, p_nome) OR {_CITA}(kp.metadata::text, p_nome)
  UNION ALL
  SELECT j.classe_id, true
    FROM public.personalizacao_blocos_gerados b
    JOIN public.personalizacao_jobs j ON j.id = b.job_id
   WHERE {_CITA}(b.markdown, p_nome) OR {_CITA}(b.enriched_payload::text, p_nome)
      OR {_CITA}(b.slides::text, p_nome)
"""


def turmas_que_usam_com_textos() -> str:
    antiga = turmas_que_usam_da_10()
    # O ultimo SELECT da 10 termina na linha do `bucket`; os ramos novos entram antes do `$f$;`.
    nova = antiga.replace("\n$f$;\n", _RAMOS_DE_TEXTO.rstrip("\n") + "\n$f$;\n", 1)
    if nova == antiga:
        raise RuntimeError("nao consegui estender trailup_turmas_que_usam_conteudo")
    return TURMAS_QUE_USAM_SQL.replace("{ANTIGA}", nova)


def _versao_sql() -> str:
    linhas = ",\n  ".join(
        "('{}', '', '{}', true)".format(chave, descricao.replace("'", "''")) for chave, descricao in CHAVES_DE_VERSAO
    )
    return (
        "INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES\n  "
        + linhas
        + "\nON CONFLICT (chave) DO NOTHING;"
    )


def _wrappers_da_10() -> str:
    """Os wrappers como a 10 os deixa (para o downgrade)."""
    sql = _constante_da_10("FUNCOES_SQL")
    inicio = sql.index("CREATE FUNCTION public.trailup_fechar_buckets_privados()")
    fim = sql.index("REVOKE ALL ON FUNCTION public.trailup_fechar_bucket_conteudos()")
    return sql[inicio:fim].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")


def upgrade() -> None:
    op.execute(REESCRITA_SQL)
    op.execute(turmas_que_usam_com_textos())
    op.execute(WRAPPERS_SQL)
    op.execute(_versao_sql())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_wrappers_da_10())
    op.execute(turmas_que_usam_da_10())
    op.execute("DROP FUNCTION IF EXISTS public.trailup_texto_cita_conteudo(text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_gatilhos_de_regeracao(boolean, text[])")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_reescrever_urls_nos_textos(boolean)")
    # So' as linhas ainda desligadas: a que alguem ligou fica (apagar desligaria o portao do app).
    chaves = ", ".join(f"'{c}'" for c, _ in CHAVES_DE_VERSAO)
    op.execute(f"DELETE FROM public.app_config WHERE chave IN ({chaves}) AND valor = ''")
    op.execute("NOTIFY pgrst, 'reload schema'")
