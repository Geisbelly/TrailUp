"""Respostas em código, numérica e expressão, com o gabarito fora de `questoes` (spec B, PR 1)

Spec: `docs/superpowers/specs/2026-11-08-respostas-codigo-formula-e-pre-avaliacao-design.md`.
Plano: `docs/superpowers/plans/2026-11-10-respostas-codigo-formula-plano.md`, PR 1.

## O que entra

| `questoes.tipo` | `atividades.tipo` | Quem corrige |
|---|---|---|
| `codigo` | `code` | a IA, na edge da dissertativa (PR 3) |
| `numerica` | `numeric` | a edge `questao-conferir-resposta`, sem IA (PR 2) |
| `expressao` | `expression` | a edge `questao-conferir-resposta`, sem IA (PR 2) |

- **`questoes.config_resposta jsonb`**: só o que o aluno precisa para responder (linguagem do
  código, variáveis da expressão, dimensão da numérica). O aluno lê.
- **`questao_gabarito.criterios jsonb`**: tolerância, domínio, critérios do código. O aluno não lê
  (a única policy da tabela é a do professor).
- **`questao_responder` recusa os três tipos** com `questao_corrigida_no_servidor`, antes de
  `fn_questao_confere`. Sem isso, `10,0 m/s` cairia na comparação de texto e daria errado contra
  `10 m/s`.
- **`fn_questao_corrigida_por_ia`**: dissertativa ou `codigo`. Troca `fn_questao_e_dissertativa` em
  todo lugar que decide se a esperada pode sair: o contexto e o registro da IA passam a aceitar
  código, e `fn_questao_registrar_resposta`, `questao_revelar_gabarito` e
  `questao_gabarito_do_aluno` nunca devolvem o código de referência.
- **RPCs novas, só `service_role`:** `questao_conferencia_contexto` (passa por `fn_questao_acesso`,
  que confere matrícula e prazo, e devolve tipo, esperada, critérios e config) e
  `questao_registrar_correcao_servidor` (100 ou 0 para `fn_questao_registrar_resposta`: a regra de
  pontuação continua uma só).
- **As três cópias** levam `config_resposta` e a linha de `questao_gabarito`.
- **`notas_fila`** reconhece `code` e lê o gabarito de `questao_gabarito`.

## O que a medição de 10/11 mudou (produção, `BEGIN READ ONLY`, sem `SET`)

- `atividades_tipo_conhecido` existe, fora do Alembic:
  `tipo IS NULL OR tipo IN ('quiz','true_false','fill_blank','essay','missao')`. Sem trocá-lo,
  salvar a atividade nova dá `23514`. Passa a ser versionado aqui.
- `questao_gabarito` (`questao_id`, `resposta_correta`, `atualizado_em`) é espelho de `questoes`
  por `trg_questoes_espelha_gabarito` (`AFTER INSERT OR UPDATE`, upsert incondicional), também fora
  do Alembic. RLS ligada, só a policy `questao_gabarito_professor`. `authenticated` tem GRANT por
  tabela, então `criterios` já nasce coberta pela mesma policy.
- `authenticated` **ainda lê `questoes.resposta_correta`**: a fase 3 do gabarito não entrou.
- `questoes` não tem nenhuma linha com os tipos novos, e nenhuma atividade tem tipo fora da lista.
- `questao_gabarito_do_aluno` (fora do Alembic, EXECUTE para `authenticated`, ninguém chama)
  devolve a esperada depois de dois erros, sem olhar o tipo. Numa questão de código, entregaria o
  código de referência. Hoje já entrega a esperada da dissertativa. Passa a ser versionada aqui,
  com o corpo de produção e a mesma regra de `fn_questao_registrar_resposta`.
- Os corpos de `20261108_01` (`REGISTRAR`), `20261108_03` (as cópias) e `20261018_05`
  (`notas_fila`) foram comparados com `pg_get_functiondef` e são iguais (fora a interpolação das
  listas de tipo). Por isso esta migration parte do texto daquelas, com trocas exatas que falham no
  import se o texto de origem mudar, como a `20261108_03`.

## Por que o gabarito sai de `questoes`

Enquanto o aluno ler `questoes.resposta_correta`, qualquer esperada gravada ali é dele. Os tipos
novos nascem **sem** passar por essa coluna: o console grava direto em `questao_gabarito`, que a
policy do professor já cobre. O CHECK `questoes_gabarito_fora_dos_tipos_novos` impede o caminho
antigo, e o espelho pula esses tipos (senão cada save da questão apagaria a esperada com `NULL`).
Assim o spec B não espera a fase 3. O tipo vale de `questoes.tipo`, **exato**, sem os apelidos de
`TIPOS_DISSERTATIVA`: é a coluna que o CHECK e o espelho enxergam.

## Por que os tipos novos ficam fora da recorreção

`fn_alteracao_questao_objetiva` (`20261101_12`) recorrige comparando texto normalizado. Numa
numérica, isso daria `10,0 m/s` errado contra `10 m/s`, e o banco não tem mathjs. A mudança da
esperada continua registrada (`trg_questao_gabarito_alteracao_professor`), e quem decide é o
professor, como em qualquer tipo não objetivo. Mudança só em `criterios` não dispara o gatilho
(`UPDATE OF resposta_correta`): fica como está, e é dívida.

## Gabarito liberado

Numérica e expressão seguem a objetiva: acertou, ou modo diferente de `pensante` (decisão da
Geisbelly, 10/11). Código, nunca, como a dissertativa.

## Cópias

O `INSERT … SELECT` das questões não devolve o par id velho → id novo, e sem ele não há como copiar
a linha de `questao_gabarito`. Vira um laço: insere a questão, guarda o id, e copia a linha. Para
os tipos de antes, o espelho já gravou a resposta (canônica, pelo gatilho de alternativas), e a
cópia só acrescenta os critérios (`ON CONFLICT … DO UPDATE SET criterios`), sem tocar em
`resposta_correta`, e por isso sem disparar o gatilho de alteração.

## Downgrade

Volta as funções ao texto de origem (antes de as colunas sumirem), devolve o espelho e
`questao_gabarito_do_aluno` ao corpo de produção, apaga as funções novas, volta o CHECK de
`atividades` e tira as colunas. **Não** devolve gabarito a `questoes`: a esperada dos tipos novos
fica em `questao_gabarito.resposta_correta`, e o espelho antigo a apagaria no próximo save da
questão. O CHECK antigo é validado: com atividade `code`/`numeric`/`expression` gravada, o downgrade
falha com `23514`, de propósito. Essas atividades precisam ser tratadas antes.

Revision ID: 20261110_02
Revises: 20261110_01
Create Date: 2026-11-10
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261110_02"
down_revision = "20261110_01"
branch_labels = None
depends_on = None

TIPOS_SERVIDOR = "'codigo', 'numerica', 'expressao'"
TIPOS_CONFERIDOS = "'numerica', 'expressao'"
TIPOS_ATIVIDADE_ANTES = "'quiz', 'true_false', 'fill_blank', 'essay', 'missao'"
TIPOS_ATIVIDADE = f"{TIPOS_ATIVIDADE_ANTES}, 'code', 'numeric', 'expression'"


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


def _funcao(sql: str, nome: str) -> str:
    """O texto exato de uma função dentro de um bloco, do CREATE até o delimitador final."""
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    delimitador = re.search(r"AS (\$\w*\$)", sql[inicio:]).group(1)
    fim = sql.index(f"{delimitador};", sql.index(delimitador, inicio) + len(delimitador))
    return sql[inicio : fim + len(delimitador) + 1]


def _insert_de_questoes(sql: str) -> str:
    """O `INSERT INTO public.questoes (…) SELECT …;` de uma cópia."""
    inicio = sql.index("  INSERT INTO public.questoes (")
    return sql[inicio : sql.index(";\n", inicio) + 2]


REGISTRAR_ANTES = _modulo("20261108_01_questao_corrigida_no_banco.py").REGISTRAR
_TEXTO_RICO = _modulo("20261108_03_texto_rico.py")
CLASSE_ANTES = _TEXTO_RICO.CLASSE
TOPICO_ANTES = _TEXTO_RICO.TOPICO
ATIVIDADE_ANTES = _TEXTO_RICO.ATIVIDADE
_NOTAS = _modulo("20261018_05_notas_fila_aceita_apelidos_de_dissertativa.py")
NOTAS_FILA_ANTES = _NOTAS._sql(_NOTAS.FILTRO_NOVO)

COLUNAS = f"""
ALTER TABLE public.questoes ADD COLUMN IF NOT EXISTS config_resposta jsonb;
COMMENT ON COLUMN public.questoes.config_resposta IS
  'Público: o que o aluno precisa para responder (linguagem, variáveis, dimensão). Ver 20261110_02.';
ALTER TABLE public.questao_gabarito ADD COLUMN IF NOT EXISTS criterios jsonb;
COMMENT ON COLUMN public.questao_gabarito.criterios IS
  'Só servidor e professor: tolerância, domínio, critérios do código. Ver 20261110_02.';

ALTER TABLE public.atividades DROP CONSTRAINT IF EXISTS atividades_tipo_conhecido;
ALTER TABLE public.atividades ADD CONSTRAINT atividades_tipo_conhecido CHECK (tipo IS NULL OR tipo IN ({TIPOS_ATIVIDADE}));

-- A esperada dos tipos corrigidos no servidor mora só em questao_gabarito: o aluno lê questoes.
ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_gabarito_fora_dos_tipos_novos;
ALTER TABLE public.questoes ADD CONSTRAINT questoes_gabarito_fora_dos_tipos_novos CHECK (tipo IS NULL OR tipo NOT IN ({TIPOS_SERVIDOR}) OR resposta_correta IS NULL);
"""

# Corpo de produção lido em 10/11 (`pg_get_functiondef`). Só existia lá.
ESPELHO_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_questoes_espelha_gabarito()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.questao_gabarito (questao_id, resposta_correta)
  VALUES (NEW.id, NEW.resposta_correta)
  ON CONFLICT (questao_id) DO UPDATE
    SET resposta_correta = EXCLUDED.resposta_correta, atualizado_em = now();
  RETURN NEW;
END $function$;
"""

ESPELHO = (
    _trocar(
        ESPELHO_PRODUCAO,
        [
            (
                "BEGIN\n  INSERT INTO public.questao_gabarito",
                "BEGIN\n"
                "  -- Código, numérica e expressão (`20261110_02`): a esperada mora só em questao_gabarito,\n"
                "  -- gravada pelo console. Aqui ela vem NULL (CHECK), e espelhar a apagaria.\n"
                f"  IF NEW.tipo IN ({TIPOS_SERVIDOR}) THEN RETURN NEW; END IF;\n"
                "  INSERT INTO public.questao_gabarito",
                1,
            )
        ],
    )
    + """
REVOKE ALL ON FUNCTION public.fn_questoes_espelha_gabarito() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_questoes_espelha_gabarito ON public.questoes;
CREATE TRIGGER trg_questoes_espelha_gabarito AFTER INSERT OR UPDATE ON public.questoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_questoes_espelha_gabarito();
"""
)

AJUDANTE = """
-- Dissertativa ou código: a IA corrige, e a esperada nunca sai para o aluno.
CREATE OR REPLACE FUNCTION public.fn_questao_corrigida_por_ia(p_questao_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.fn_questao_e_dissertativa(p_questao_id)
      OR EXISTS (SELECT 1 FROM public.questoes q WHERE q.id = p_questao_id AND q.tipo = 'codigo');
$$;

REVOKE ALL ON FUNCTION public.fn_questao_corrigida_por_ia(bigint) FROM PUBLIC, anon, authenticated;
"""

_CONTEXTO_IA_ANTES = _funcao(REGISTRAR_ANTES, "questao_correcao_ia_contexto")

REGISTRAR = _trocar(
    REGISTRAR_ANTES,
    [
        (
            "  v_correta := public.fn_questao_confere(p_questao_id, p_resposta);\n",
            "  -- Código, numérica e expressão (`20261110_02`): a esperada não é texto para comparar, e a\n"
            "  -- conferência é do servidor (edge functions). Antes de fn_questao_confere.\n"
            "  IF EXISTS (SELECT 1 FROM public.questoes q\n"
            f"              WHERE q.id = p_questao_id AND q.tipo IN ({TIPOS_SERVIDOR})) THEN\n"
            "    RAISE EXCEPTION 'questao_corrigida_no_servidor' USING ERRCODE = '22023';\n"
            "  END IF;\n"
            "  v_correta := public.fn_questao_confere(p_questao_id, p_resposta);\n",
            1,
        ),
        (
            _CONTEXTO_IA_ANTES,
            """CREATE OR REPLACE FUNCTION public.questao_correcao_ia_contexto(p_aluno uuid, p_questao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.questoes%ROWTYPE;
  v_gabarito text;
  v_criterios jsonb;
BEGIN
  v_q := public.fn_questao_acesso(p_aluno, p_questao_id);
  IF NOT public.fn_questao_corrigida_por_ia(p_questao_id) THEN
    RAISE EXCEPTION 'questao_nao_dissertativa' USING ERRCODE = '22023';
  END IF;
  SELECT g.resposta_correta, g.criterios INTO v_gabarito, v_criterios
    FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
  -- Código (`20261110_02`): a linguagem vem de config_resposta, e os critérios do professor.
  RETURN jsonb_build_object(
    'tipo', v_q.tipo,
    'enunciado', v_q.enunciado,
    'nota_estabelecida', v_q.nota_estabelecida,
    'resposta_esperada', v_gabarito,
    'config_resposta', v_q.config_resposta,
    'criterios', v_criterios);
END;
$$;""",
            1,
        ),
        # Registrar, revelar e registro da IA (o contexto já veio acima): o código entra com a
        # dissertativa.
        ("public.fn_questao_e_dissertativa(p_questao_id)", "public.fn_questao_corrigida_por_ia(p_questao_id)", 3),
    ],
)

SERVIDOR = f"""
-- Edge `questao-conferir-resposta`, pela chave de serviço: o que ela precisa para conferir.
CREATE OR REPLACE FUNCTION public.questao_conferencia_contexto(p_aluno uuid, p_questao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.questoes%ROWTYPE;
  v_gabarito text;
  v_criterios jsonb;
BEGIN
  -- Matrícula e prazo antes de ler a esperada.
  v_q := public.fn_questao_acesso(p_aluno, p_questao_id);
  IF v_q.tipo IS NULL OR v_q.tipo NOT IN ({TIPOS_CONFERIDOS}) THEN
    RAISE EXCEPTION 'questao_nao_conferida_no_servidor' USING ERRCODE = '22023';
  END IF;
  SELECT g.resposta_correta, g.criterios INTO v_gabarito, v_criterios
    FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
  RETURN jsonb_build_object(
    'tipo', v_q.tipo,
    'resposta_esperada', v_gabarito,
    'criterios', v_criterios,
    'config_resposta', v_q.config_resposta);
END;
$$;

-- Grava o que a edge conferiu. A pontuação é a de fn_questao_registrar_resposta (gabarito visto,
-- repetida, nova tentativa), com a nota-base da objetiva: 100 ou 0.
CREATE OR REPLACE FUNCTION public.questao_registrar_correcao_servidor(
  p_aluno uuid, p_questao_id bigint, p_resposta text, p_correta boolean,
  p_tempo_gasto_seg integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.questoes q
                  WHERE q.id = p_questao_id AND q.tipo IN ({TIPOS_CONFERIDOS})) THEN
    RAISE EXCEPTION 'questao_nao_conferida_no_servidor' USING ERRCODE = '22023';
  END IF;
  RETURN public.fn_questao_registrar_resposta(
    p_aluno, p_questao_id, p_resposta, COALESCE(p_correta, false),
    CASE WHEN COALESCE(p_correta, false) THEN 100 ELSE 0 END, p_tempo_gasto_seg);
END;
$$;

-- Recebem o aluno no parâmetro: só a chave de serviço chama.
REVOKE ALL ON FUNCTION public.questao_conferencia_contexto(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questao_conferencia_contexto(uuid, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.questao_registrar_correcao_servidor(uuid, bigint, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questao_registrar_correcao_servidor(uuid, bigint, text, boolean, integer) TO service_role;
"""

# Corpo de produção lido em 10/11 (`pg_get_functiondef`). Só existia lá. O GRANT para
# `authenticated` também é de lá: CREATE OR REPLACE mantém o ACL, e esta migration não o mexe.
GABARITO_DO_ALUNO_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.questao_gabarito_do_aluno(p_questao_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me       uuid := auth.uid();
  v_at       bigint;
  v_erros    integer;
  v_acertou  boolean;
  v_liberado boolean;
  v_gabarito text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'questao_sem_sessao';
  END IF;

  SELECT q.atividade_id INTO v_at FROM public.questoes q WHERE q.id = p_questao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'questao_inexistente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
      JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
     WHERE a.id = v_at AND ca.aluno_id = v_me
  ) THEN
    RAISE EXCEPTION 'questao_sem_permissao';
  END IF;

  SELECT count(*) FILTER (WHERE qa.correta IS FALSE),
         COALESCE(bool_or(qa.correta), false)
    INTO v_erros, v_acertou
    FROM public.questao_aluno qa
   WHERE qa.aluno_id = v_me AND qa.questao_id = p_questao_id;

  v_liberado := v_acertou OR COALESCE(v_erros, 0) >= 2;

  IF v_liberado THEN
    SELECT g.resposta_correta INTO v_gabarito
      FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
  END IF;

  RETURN jsonb_build_object(
    'correta', v_acertou,
    'erros', COALESCE(v_erros, 0),
    'gabarito_liberado', v_liberado,
    'resposta_correta', v_gabarito
  );
END
$function$;
"""

GABARITO_DO_ALUNO = _trocar(
    GABARITO_DO_ALUNO_PRODUCAO,
    [
        (
            "  v_liberado := v_acertou OR COALESCE(v_erros, 0) >= 2;\n",
            "  -- Dissertativa e código (`20261110_02`): a esperada nunca sai, como em\n"
            "  -- fn_questao_registrar_resposta. Sem isto, dois erros entregavam o código de referência.\n"
            "  v_liberado := NOT public.fn_questao_corrigida_por_ia(p_questao_id)\n"
            "                AND (v_acertou OR COALESCE(v_erros, 0) >= 2);\n",
            1,
        )
    ],
)

_DECLARAR_QUESTAO = "  v_questao   record;\n  v_nova_questao bigint;\n"


def _copia_de_questoes(destino: str, filtro: str, ordem: str) -> str:
    return f"""  -- Questão por questão (`20261110_02`): a linha de questao_gabarito precisa do id novo.
  FOR v_questao IN
    SELECT q.*, g.questao_id IS NOT NULL AS tem_gabarito, g.resposta_correta AS gabarito, g.criterios
      FROM public.questoes q
      LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
     WHERE {filtro}
     ORDER BY {ordem}
  LOOP
    INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida, formato_texto, config_resposta)
    VALUES ({destino}, v_questao.enunciado, v_questao.tipo, v_questao.alternativas, v_questao.resposta_correta,
            v_questao.midia_url, v_questao.nota_estabelecida, v_questao.formato_texto, v_questao.config_resposta)
    RETURNING id INTO v_nova_questao;
    -- Tipos de antes: o espelho já gravou a resposta; aqui entram só os critérios. Tipos novos: a
    -- linha inteira, que o espelho não cria.
    IF v_questao.tem_gabarito THEN
      INSERT INTO public.questao_gabarito (questao_id, resposta_correta, criterios)
      VALUES (v_nova_questao, v_questao.gabarito, v_questao.criterios)
      ON CONFLICT (questao_id) DO UPDATE SET criterios = EXCLUDED.criterios;
    END IF;
  END LOOP;
"""


_EM_LOTE = _copia_de_questoes(
    "(v_atividades ->> v_questao.atividade_id::text)::bigint", "v_atividades ? q.atividade_id::text", "q.atividade_id, q.id"
)

CLASSE = _trocar(
    CLASSE_ANTES,
    [
        ("  rc          record;\nBEGIN\n", "  rc          record;\n" + _DECLARAR_QUESTAO + "BEGIN\n", 1),
        (_insert_de_questoes(CLASSE_ANTES), _EM_LOTE, 1),
    ],
)
TOPICO = _trocar(
    TOPICO_ANTES,
    [
        ("  r           record;\nBEGIN\n", "  r           record;\n" + _DECLARAR_QUESTAO + "BEGIN\n", 1),
        (_insert_de_questoes(TOPICO_ANTES), _EM_LOTE, 1),
    ],
)
ATIVIDADE = _trocar(
    ATIVIDADE_ANTES,
    [
        ("  v_novo      bigint;\nBEGIN\n", "  v_novo      bigint;\n" + _DECLARAR_QUESTAO + "BEGIN\n", 1),
        (_insert_de_questoes(ATIVIDADE_ANTES), _copia_de_questoes("v_novo", "q.atividade_id = p_atividade_id", "q.id"), 1),
    ],
)

NOTAS_FILA = _trocar(
    NOTAS_FILA_ANTES,
    [
        (
            "IN ('essay', 'dissertativa', 'questao', 'texto')",
            "IN ('essay', 'dissertativa', 'questao', 'texto', 'code')",
            1,
        ),
        (
            "      SELECT q1.enunciado, q1.resposta_correta\n        FROM public.questoes q1\n",
            "      -- A esperada do código só existe em questao_gabarito (`20261110_02`).\n"
            "      SELECT q1.enunciado, COALESCE(g1.resposta_correta, q1.resposta_correta) AS resposta_correta\n"
            "        FROM public.questoes q1\n"
            "        LEFT JOIN public.questao_gabarito g1 ON g1.questao_id = q1.id\n",
            1,
        ),
    ],
)


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(ESPELHO)
    op.execute(AJUDANTE)
    op.execute(REGISTRAR)
    op.execute(SERVIDOR)
    op.execute(GABARITO_DO_ALUNO)
    op.execute(CLASSE)
    op.execute(TOPICO)
    op.execute(ATIVIDADE)
    op.execute(NOTAS_FILA)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # As funções voltam antes de as colunas e o ajudante sumirem: o corpo novo depende deles.
    op.execute(REGISTRAR_ANTES)
    op.execute(GABARITO_DO_ALUNO_PRODUCAO)
    op.execute(CLASSE_ANTES)
    op.execute(TOPICO_ANTES)
    op.execute(ATIVIDADE_ANTES)
    op.execute(NOTAS_FILA_ANTES)
    op.execute(ESPELHO_PRODUCAO)
    op.execute(
        "DROP FUNCTION IF EXISTS public.questao_registrar_correcao_servidor(uuid, bigint, text, boolean, integer);\n"
        "DROP FUNCTION IF EXISTS public.questao_conferencia_contexto(uuid, bigint);\n"
        "DROP FUNCTION IF EXISTS public.fn_questao_corrigida_por_ia(bigint);"
    )
    op.execute(
        "ALTER TABLE public.questoes DROP CONSTRAINT IF EXISTS questoes_gabarito_fora_dos_tipos_novos;\n"
        "ALTER TABLE public.atividades DROP CONSTRAINT IF EXISTS atividades_tipo_conhecido;\n"
        "ALTER TABLE public.atividades ADD CONSTRAINT atividades_tipo_conhecido "
        f"CHECK (tipo IS NULL OR tipo IN ({TIPOS_ATIVIDADE_ANTES}));\n"
        "ALTER TABLE public.questao_gabarito DROP COLUMN IF EXISTS criterios;\n"
        "ALTER TABLE public.questoes DROP COLUMN IF EXISTS config_resposta;"
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
