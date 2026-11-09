"""Marca de texto rico e a conferência que ela muda (spec A)

Spec: `docs/superpowers/specs/2026-11-08-texto-rico-formulas-e-codigo-design.md`. Plano:
`docs/superpowers/plans/2026-11-08-texto-rico-plano.md`, PR 1.

## O que entra

- **`formato_texto`** (`'texto'` | `'rico'`, padrão `'texto'`) em `questoes`, `atividades` e
  `cards`. Só o `'rico'` passa a ser lido como markdown com fórmula e código. Tudo o que já existe
  fica `'texto'` e não muda de aparência.
- **As três cópias** (`duplicar_classe`, `duplicar_topico`, `duplicar_atividade`) levam a coluna.
  Sem isso, a cópia de uma questão rica voltaria a `'texto'` e o aluno veria LaTeX cru.
- **`fn_questao_confere`:** a múltipla escolha rica é conferida **pela posição**, e a lacuna rica,
  sem tirar símbolo e sem Levenshtein.

## Por que a posição (medido em produção em 08/11, só leitura)

`fn_texto_comparavel` tira acento, passa para minúsculas e corta as pontas. **Não tira símbolos**
(`\\(a+b\\)` e `\\(a-b\\)` continuam diferentes), mas empata o que só difere em maiúscula:
`\\ce{CO}` (monóxido de carbono) e `\\ce{Co}` (cobalto), `M` e `m`. Na múltipla, o aluno que
escolhesse `\\ce{Co}` com gabarito `\\ce{CO}` acertaria. Em questão rica, a resposta vira uma
posição (`fn_questao_posicao_rica`): texto exato depois de `btrim` (é o que o app 1.0.x manda),
letra (o que o build novo manda), índice e, por último, texto comparável **só se casar com uma
alternativa**. Gabarito e resposta são resolvidos do mesmo jeito, e vale a igualdade das posições.

Na lacuna, `fn_texto_estrito` tira **todo** símbolo: `a+b` vira `a b`, igual a `a-b`. Em questão
rica, a lacuna compara por `fn_texto_rico_comparavel`: sem espaço e sem os delimitadores
(`\\(`, `\\)`, `\\[`, `\\]`, `$`), **sem** minúsculas e sem Levenshtein. Em fórmula, um caractere
muda o sentido. Variantes aceitas continuam separadas por `|` no gabarito, como hoje (então uma
lacuna rica com valor absoluto, `|x|`, precisa vir como JSON).

A questão `'texto'` segue o caminho de antes, linha por linha.

## O gabarito já chegava errado ao banco (medido em 08/11)

O gatilho `trg_questoes_alternativas_canonicas` reescreve `questoes.resposta_correta` ao salvar,
por `fn_questao_gabarito_em_texto`, e esse texto vai para `questao_gabarito` pelo
`trg_questoes_espelha_gabarito`. A função devolvia a **primeira** alternativa igual pelo texto
comparável: com `["\\ce{Co}", "\\ce{CO}"]` e gabarito `\\ce{CO}`, gravava `\\ce{Co}`. E a ordem
das alternativas é sorteada pelo id (`fn_questao_alternativas_em_ordem`), então qual vinha
primeiro era sorte. Ela só existia em produção. Entra aqui com uma volta a mais, **antes** das
outras: a alternativa igual depois de `btrim`. Quem tem texto exato não muda; muda só o caso do
empate, que era o defeito. Vale para toda questão, rica ou não: com texto exato, não há o que
preservar.

## Como o SQL é montado

Os corpos de produção das quatro funções foram lidos em 08/11 (`pg_get_functiondef`, transação
`READ ONLY`) e são iguais aos das migrations de origem (`20261011_01`, `_03`, `_04` e
`20261108_01`, fora a interpolação das listas de tipo). Por isso esta migration parte do texto
daquelas migrations, carregado por arquivo como na `20261020_04`, com trocas exatas: cada troca
confere quantas vezes casou e falha no import se o texto de origem mudar. O downgrade reexecuta o
texto de origem sem troca nenhuma.

## Fora daqui

- O GRANT por coluna de `questoes` no corte da fase 3 do gabarito precisa incluir
  `formato_texto`: o app não sabe desenhar a questão sem ela.
- As cópias também não levam `questoes.dificuldade` (`20261021_10`). É dívida anterior, e fica
  para outro PR.

Revision ID: 20261108_03
Revises: 20261108_02
Create Date: 2026-11-08
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261108_03"
down_revision = "20261108_02"
branch_labels = None
depends_on = None

TABELAS = ("questoes", "atividades", "cards")


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _trocar(sql: str, trocas: list[tuple[str, str, int]]) -> str:
    for velho, novo, vezes in trocas:
        achou = sql.count(velho)
        if achou != vezes:
            raise RuntimeError(f"esperava {vezes} ocorrência(s), achei {achou}: {velho[:80]!r}")
        sql = sql.replace(velho, novo)
    return sql


CLASSE_ANTES = _modulo("20261011_01_duplicar_classe.py").SQL
TOPICO_ANTES = _modulo("20261011_03_duplicar_topico.py").SQL
ATIVIDADE_ANTES = _modulo("20261011_04_duplicar_atividade.py").SQL
CONFERE_ANTES = _modulo("20261108_01_questao_corrigida_no_banco.py").CONFERE

_COLUNAS_ATIVIDADE = (
    "INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata)",
    "INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata, formato_texto)",
    1,
)
_COLUNAS_QUESTAO = (
    "INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida)",
    "INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida, formato_texto)",
    1,
)
_VALORES_QUESTAO = ("q.midia_url, q.nota_estabelecida", "q.midia_url, q.nota_estabelecida, q.formato_texto", 1)
_COLUNAS_CARD = (
    "INSERT INTO public.cards (conteudo_id, titulo, descricao, imagem_url, cor, ordem, conteudo_origem_id)",
    "INSERT INTO public.cards (conteudo_id, titulo, descricao, imagem_url, cor, ordem, conteudo_origem_id, formato_texto)",
    1,
)
_VALORES_CARD = (
    "ELSE k.conteudo_origem_id END\n",
    "ELSE k.conteudo_origem_id END,\n         k.formato_texto\n",
    1,
)
_VALORES_ATIVIDADE_LACO = ("r.data_entrega, r.metadata)", "r.data_entrega, r.metadata, r.formato_texto)", 1)

CLASSE = _trocar(
    CLASSE_ANTES,
    [_COLUNAS_ATIVIDADE, _VALORES_ATIVIDADE_LACO, _COLUNAS_QUESTAO, _VALORES_QUESTAO, _COLUNAS_CARD, _VALORES_CARD],
)
TOPICO = _trocar(
    TOPICO_ANTES,
    [_COLUNAS_ATIVIDADE, _VALORES_ATIVIDADE_LACO, _COLUNAS_QUESTAO, _VALORES_QUESTAO, _COLUNAS_CARD, _VALORES_CARD],
)
ATIVIDADE = _trocar(
    ATIVIDADE_ANTES,
    [
        _COLUNAS_ATIVIDADE,
        ("v_origem.data_entrega, v_origem.metadata\n", "v_origem.data_entrega, v_origem.metadata, v_origem.formato_texto\n", 1),
        _COLUNAS_QUESTAO,
        _VALORES_QUESTAO,
    ],
)

COLUNAS = "\n".join(
    f"""
ALTER TABLE public.{t} ADD COLUMN IF NOT EXISTS formato_texto text NOT NULL DEFAULT 'texto';
ALTER TABLE public.{t} DROP CONSTRAINT IF EXISTS {t}_formato_texto_check;
ALTER TABLE public.{t} ADD CONSTRAINT {t}_formato_texto_check CHECK (formato_texto IN ('texto', 'rico'));
COMMENT ON COLUMN public.{t}.formato_texto IS
  'texto: como sempre foi. rico: markdown com fórmula (\\( \\), $, \\ce{{}}) e código cercado. Ver 20261108_03.';
"""
    for t in TABELAS
)

AJUDANTES = r"""
-- A posição de uma resposta (ou do gabarito) entre as alternativas de uma questão rica.
-- Texto exato primeiro: é o que o app 1.0.x manda. Depois letra (o build novo) e índice. Por
-- último, o texto comparável de antes, mas só quando ele casa com UMA alternativa: com duas
-- (\ce{CO} e \ce{Co}), não decide, em vez de escolher a primeira.
CREATE OR REPLACE FUNCTION public.fn_questao_posicao_rica(p_alts jsonb, p_valor text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor text := btrim(COALESCE(p_valor, ''));
  v_n integer := CASE WHEN jsonb_typeof(p_alts) = 'array' THEN jsonb_array_length(p_alts) ELSE 0 END;
  v_achadas integer[];
  i integer;
BEGIN
  IF v_valor = '' OR v_n = 0 THEN RETURN NULL; END IF;
  FOR i IN 0 .. v_n - 1 LOOP
    IF btrim(p_alts ->> i) = v_valor THEN RETURN i; END IF;
  END LOOP;
  IF v_valor ~* '^[a-z]$' AND ascii(lower(v_valor)) - 97 < v_n THEN
    RETURN ascii(lower(v_valor)) - 97;
  END IF;
  IF v_valor ~ '^[0-9]+$' AND length(v_valor) <= 4 AND v_valor::integer < v_n THEN
    RETURN v_valor::integer;
  END IF;
  v_achadas := ARRAY(
    SELECT k - 1 FROM generate_series(1, v_n) AS k
     WHERE public.fn_texto_comparavel(p_alts ->> (k - 1)) = public.fn_texto_comparavel(v_valor)
  );
  IF cardinality(v_achadas) = 1 THEN RETURN v_achadas[1]; END IF;
  RETURN NULL;
END;
$$;

-- Comparação da lacuna rica: sem espaço e sem delimitador de fórmula, mantendo símbolo e
-- maiúscula. Nada de Levenshtein: em fórmula, um caractere muda o sentido.
CREATE OR REPLACE FUNCTION public.fn_texto_rico_comparavel(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(
    replace(replace(replace(replace(replace(COALESCE(p_texto, ''), '\(', ''), '\)', ''), '\[', ''), '\]', ''), '$', ''),
    '[[:space:]]+', '', 'g');
$$;

-- Ninguém de fora chama: só fn_questao_confere (SECURITY DEFINER, dona postgres).
REVOKE ALL ON FUNCTION public.fn_questao_posicao_rica(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_texto_rico_comparavel(text) FROM PUBLIC, anon, authenticated;
"""

# Corpo de produção lido em 08/11 (`pg_get_functiondef`). Só existia lá.
GABARITO_EM_TEXTO_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_questao_gabarito_em_texto(p_alts jsonb, p_resposta text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_resp text := btrim(COALESCE(p_resposta, '')); v_norm text; v_i integer;
BEGIN
  IF v_resp = '' OR p_alts IS NULL OR jsonb_typeof(p_alts) <> 'array' THEN RETURN p_resposta; END IF;
  v_norm := public.fn_texto_comparavel(v_resp);
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF public.fn_texto_comparavel(p_alts ->> v_i) = v_norm THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP
    IF v_norm = lower(chr(65 + v_i)) OR v_norm = v_i::text THEN RETURN p_alts ->> v_i; END IF;
  END LOOP;
  RETURN p_resposta;
END; $function$;
"""

GABARITO_EM_TEXTO = _trocar(
    GABARITO_EM_TEXTO_PRODUCAO,
    [
        (
            "  v_norm := public.fn_texto_comparavel(v_resp);\n",
            "  -- Texto exato antes do comparável (`20261108_03`): o comparável empata \\ce{CO} com\n"
            "  -- \\ce{Co}, e a primeira alternativa da ordem sorteada ganhava.\n"
            "  FOR v_i IN 0 .. jsonb_array_length(p_alts) - 1 LOOP\n"
            "    IF btrim(p_alts ->> v_i) = v_resp THEN RETURN p_alts ->> v_i; END IF;\n"
            "  END LOOP;\n"
            "  v_norm := public.fn_texto_comparavel(v_resp);\n",
            1,
        )
    ],
)

CONFERE = _trocar(
    CONFERE_ANTES,
    [
        (
            "v_i integer; v_texto text; v_aceitas text[]; v_dissertativa boolean;\n",
            "v_i integer; v_texto text; v_aceitas text[]; v_dissertativa boolean;\n"
            "  v_formato text; v_lacuna_rica boolean;\n",
            1,
        ),
        (
            "  SELECT g.resposta_correta, q.alternativas, q.tipo, lower(btrim(COALESCE(a.tipo::text, '')))\n"
            "    INTO v_gabarito, v_alts, v_tipo, v_tipo_atividade\n",
            "  SELECT g.resposta_correta, q.alternativas, q.tipo, lower(btrim(COALESCE(a.tipo::text, ''))),\n"
            "         q.formato_texto\n"
            "    INTO v_gabarito, v_alts, v_tipo, v_tipo_atividade, v_formato\n",
            1,
        ),
        (
            "  IF NOT FOUND THEN RETURN false; END IF;\n",
            "  IF NOT FOUND THEN RETURN false; END IF;\n"
            "\n"
            "  -- Múltipla escolha rica: pela posição (`20261108_03`). O texto comparável empata\n"
            "  -- \\ce{CO} com \\ce{Co}.\n"
            "  IF v_formato = 'rico' AND jsonb_typeof(v_alts) = 'array' AND jsonb_array_length(v_alts) > 0\n"
            "     AND (public.fn_texto_comparavel(COALESCE(v_tipo, '')) IN ('multipla', 'multipla_escolha', 'multipla escolha', 'quiz')\n"
            "          OR (v_tipo IS NULL AND v_tipo_atividade IN ('quiz', 'multipla', 'multipla_escolha'))) THEN\n"
            "    RETURN public.fn_questao_posicao_rica(v_alts, p_resposta) IS NOT NULL\n"
            "       AND public.fn_questao_posicao_rica(v_alts, p_resposta) = public.fn_questao_posicao_rica(v_alts, v_gabarito);\n"
            "  END IF;\n",
            1,
        ),
        (
            "    IF public.fn_texto_estrito(p_resposta) = '' THEN RETURN false; END IF;\n"
            "    v_aceitas := ARRAY(SELECT x FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x\n"
            "                        WHERE public.fn_texto_estrito(x) <> '');\n",
            "    -- Lacuna rica (`20261108_03`): fn_texto_estrito tira todo símbolo, e a+b viraria a-b.\n"
            "    v_lacuna_rica := v_formato = 'rico' AND NOT v_dissertativa;\n"
            "    IF v_lacuna_rica THEN\n"
            "      IF public.fn_texto_rico_comparavel(p_resposta) = '' THEN RETURN false; END IF;\n"
            "      RETURN EXISTS (SELECT 1 FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x\n"
            "                      WHERE public.fn_texto_rico_comparavel(x) <> ''\n"
            "                        AND public.fn_texto_rico_comparavel(x) = public.fn_texto_rico_comparavel(p_resposta));\n"
            "    END IF;\n"
            "    IF public.fn_texto_estrito(p_resposta) = '' THEN RETURN false; END IF;\n"
            "    v_aceitas := ARRAY(SELECT x FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x\n"
            "                        WHERE public.fn_texto_estrito(x) <> '');\n",
            1,
        ),
    ],
)


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(AJUDANTES)
    op.execute(GABARITO_EM_TEXTO)
    op.execute(CONFERE)
    op.execute(CLASSE)
    op.execute(TOPICO)
    op.execute(ATIVIDADE)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # As funções voltam antes de a coluna sumir: com o corpo novo, a cópia falharia sem ela.
    op.execute(CONFERE_ANTES)
    op.execute(GABARITO_EM_TEXTO_PRODUCAO)
    op.execute(CLASSE_ANTES)
    op.execute(TOPICO_ANTES)
    op.execute(ATIVIDADE_ANTES)
    op.execute(
        "DROP FUNCTION IF EXISTS public.fn_questao_posicao_rica(jsonb, text);\n"
        "DROP FUNCTION IF EXISTS public.fn_texto_rico_comparavel(text);"
    )
    for t in TABELAS:
        op.execute(
            f"ALTER TABLE public.{t} DROP CONSTRAINT IF EXISTS {t}_formato_texto_check;\n"
            f"ALTER TABLE public.{t} DROP COLUMN IF EXISTS formato_texto;"
        )
    op.execute("NOTIFY pgrst, 'reload schema'")
