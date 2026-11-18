"""Missão pode guardar um desafio, com gabarito que o aluno não lê

Segunda das quatro migrations dos desafios de lógica e cruzadinha como missão
(`docs/superpowers/specs/2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "O desenho >
Banco" e "Achados" 3 e 6). Aqui ficam o lugar do desafio, o gabarito, as tentativas, os prêmios e as
travas. Quem cria e quem corrige são as RPCs das duas migrations seguintes.

## `missoes`: três colunas

- `desafio jsonb`: o que o aluno vê, **sem a resposta**. `NULL` é missão comum.
- `conteudo_id bigint REFERENCES conteudos(id) ON DELETE CASCADE`: de onde o desafio saiu.
- `desafio_grupo uuid`: o mesmo quebra-cabeça nas linhas de cada perfil.

CHECKs:

- `missoes_desafio_de_aluno`: desafio só em missão `escopo = 'aluno'`, com conteúdo e grupo.
- `missoes_desafio_colunas_juntas`: conteúdo e grupo só existem com desafio. Sem isso, um professor
  poderia pôr o grupo de um desafio alheio na própria missão comum e, pela policy do gabarito (que
  procura o grupo nas missões dele), ler a resposta.
- `missoes_desafio_forma`: objeto com `tipo` `logica` ou `cruzadinha`. Lógica com enunciado e
  `formato` `multipla` (com pelo menos 2 alternativas) ou `curta`. Cruzadinha com 4 a 10 palavras.
  Nenhuma chave de resposta em nível nenhum (`resposta`, `respostas`, `aceitas`, `gabarito`,
  `palavra`): é a última barreira contra a RPC gravar a resposta no lugar que o aluno lê.

`missoes` tem SELECT por tabela para `authenticated`, não por coluna (cadeia: `20261021_02`; medido em
produção em 17/11, `role_table_grants` = `INSERT,SELECT,UPDATE,DELETE`). As colunas novas chegam ao
aluno sem GRANT próprio, e o e2e confere com o papel de verdade.

## Gabarito e tentativas

**`missao_desafio_gabarito`** (`desafio_grupo` PK, `resposta`, `atualizado_em`): uma linha por
quebra-cabeça. Sem FK para `missoes`, porque o grupo tem uma linha por perfil. O gatilho
`trg_missoes_desafio_gabarito` (AFTER DELETE em `missoes`) apaga o gabarito quando o grupo fica sem
linha. Apagar o conteúdo leva as missões em cascata, e com elas o gabarito.

- Só o professor dono lê (`missao_desafio_gabarito_professor_sel`): o grupo precisa estar numa missão
  de turma dele (`app_classes_do_professor()`).
- O aluno não tem policy. Ninguém tem policy de escrita: quem escreve é a RPC (`SECURITY DEFINER`).

**`missao_desafio_tentativa`**, só de acréscimo: a métrica de engajamento e a base do limite por hora.

- O aluno lê as próprias (`aluno_id = auth.uid()`), e o professor as das missões das turmas dele.
- Nenhuma policy de escrita: só a RPC grava.
- `missao_id` com `ON DELETE CASCADE`: a tentativa de uma missão apagada não tem mais turma, e a
  policy do professor deixaria de alcançá-la.

Retenção: `missao_desafio_tentativa` entra em `retencao_politica` como `vida_da_conta` (sai com a
conta, pela FK de `alunos`), como `diagnostico_topico`. O gabarito não tem dado de pessoa.

As duas tabelas: `REVOKE ALL` de `PUBLIC`, `anon` e `authenticated`, e `GRANT SELECT` só para
`authenticated`. A RLS decide o resto.

## Prêmios: 10 pontos e 2 moedas

`desafio_logica` e `desafio_cruzadinha` entram em `eventos_pontuacao` com **10 pontos e 2 moedas**,
os valores de `missao_diaria_concluida`. A spec pedia os de `missao_concluida`, mas em produção (17/11)
`missao_concluida` paga 0 ponto e 0 moeda, e um desafio que não paga nada contradiz a própria spec
("paga moedas e pontos no rank"). Decisão do executor do plano, registrada no ledger. `ON CONFLICT
(tipo) DO NOTHING`: se alguém já tiver criado a linha, o valor dela fica.

## Guarda de `missoes` (`fn_missoes_guarda`)

O texto é o da `20261103_06` (a última que a define; o `prosrc` de produção bate com ele, md5 medido em
17/11), trocado por âncora. A importação falha se uma âncora sumir.

- **Só a RPC grava `desafio`.** No INSERT, `desafio` preenchido exige o sinal
  `app.desafio_gravando = 'on'` **e** `current_user` fora de `authenticated`/`anon`; senão, `42501`.
  O `current_user` é a chave de verdade, no padrão da `20261117_01`: o PostgREST não expõe
  `set_config`, mas, se expusesse, o cliente continuaria recusado. Quem ligar o sinal o devolve a vazio
  logo depois da escrita, também no `EXCEPTION` (`set_config(..., true)` vale até o fim da transação).
- **No UPDATE, sem o sinal:** `desafio`, `desafio_grupo` e `conteudo_id` mantêm o valor antigo, em
  silêncio, como o resto da guarda. Na missão-desafio, também `criterio`, `escopo` e `classe_id`.
  - `classe_id` vai além do brief: o desafio sai de um conteúdo de uma turma, e movê-lo daria a outra
    turma um desafio sobre conteúdo que ela não tem.
  - `perfil_alvo`, `ativa`, título e janela continuam editáveis.
- **A métrica `desafio`** passa na validação de `criterio`, e só vale junto com o desafio (`22023`):
  missão comum com ela nunca fecharia, e desafio com outra métrica seria avaliado pelo laço se não
  fosse o item abaixo.
- **`recompensa_tipo` só da lista de prêmio** (`TIPOS_DE_PREMIO`, importada da `20261117_01`), no
  INSERT e no UPDATE que muda o valor (`22023`). A recusa de `eventos_aluno` da `20261117_01` protege só
  essa lista. Uma missão que pagasse outro tipo teria um prêmio que o próprio aluno conseguiria gravar.
  Em produção (17/11) só há `missao_concluida` (9) e `missao_diaria_concluida` (291). Missão antiga com
  outro tipo continua editável enquanto o tipo não mudar.

## Avaliador

`AND m.desafio IS NULL` nos SELECTs de missão:

- **Laço individual de `trg_eventos_aluno_after_iud`:** troca no corpo vivo (`pg_get_functiondef`),
  como a `20261117_01`, idempotente pela marca `20261117_02`. A âncora é o fim da lista do SELECT que a
  `20261117_01` deixa (`m.classe_id`) e o `FROM`/`WHERE` seguintes. Medido em produção em 17/11, antes da
  `_01`: o mesmo trecho com `m.recompensa_tipo` no lugar de `m.classe_id` aparece uma vez.
- **`trg_missao_item_concluido` (`item_no_dia`):** troca no texto que a `20261117_01` deixa (`ITEM`).

O de `minutos_no_dia` e o da guilda ficam como estão. O primeiro só lê `minutos_no_dia`, e o desafio só
tem a métrica `desafio`. O segundo só lê `escopo = 'guilda'`, e o CHECK proíbe desafio fora de
`escopo = 'aluno'`. O de item também filtra a métrica: a troca nele é defesa contra `criterio` editado
por fora da guarda, como a spec pede ("Achado" 6).

## Índices

- `missoes (classe_id, conteudo_id) WHERE desafio IS NOT NULL`: os desafios de um conteúdo.
- `missoes (desafio_grupo) WHERE desafio_grupo IS NOT NULL`: a policy do gabarito e o gatilho de
  limpeza procuram pelo grupo.
- `missao_desafio_tentativa (aluno_id, desafio_grupo, criado_em)`: o limite por hora da RPC.

## Para a Tarefa 4

A extensão `unaccent` **não** está instalada em produção (17/11). A normalização da resposta usa
`translate`.

## Downgrade

Devolve o laço e o gatilho de item ao texto da `20261117_01` e a guarda ao da `20261103_06`. Apaga as
missões com desafio (sem a coluna, virariam missões que nunca fecham), as duas tabelas, o gatilho, os
índices, os CHECKs e as colunas. As linhas de prêmio saem só se nenhum evento, override por turma ou
missão as usar.

Revision ID: 20261117_02
Revises: 20261117_01
Create Date: 2026-11-17
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261117_02"
down_revision = "20261117_01"
branch_labels = None
depends_on = None

MARCA = "20261117_02"


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_17_02", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M06 = _modulo("20261103_06_missao_com_turma_e_perfil.py")
M17_01 = _modulo("20261117_01_premio_de_missao_na_turma.py")

TIPOS_DE_PREMIO = M17_01.TIPOS_DE_PREMIO


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


def _lista(valores) -> str:
    return ", ".join(f"'{v}'" for v in valores)


# ---------------------------------------------------------------------------------------- colunas
COLUNAS = """
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS desafio jsonb,
  ADD COLUMN IF NOT EXISTS conteudo_id bigint REFERENCES public.conteudos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS desafio_grupo uuid;

ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_de_aluno;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_desafio_de_aluno
  CHECK (desafio IS NULL OR (escopo = 'aluno' AND conteudo_id IS NOT NULL AND desafio_grupo IS NOT NULL));

-- Grupo e conteudo so' com desafio: o gabarito e' lido pelo grupo das missoes do professor.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_colunas_juntas;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_desafio_colunas_juntas
  CHECK (desafio IS NOT NULL OR (conteudo_id IS NULL AND desafio_grupo IS NULL));

-- A forma. Os CASE aninhados existem porque `AND` nao garante a ordem: `jsonb_array_length` de um
-- escalar levantaria erro em vez de reprovar o CHECK.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_forma;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_desafio_forma
  CHECK (desafio IS NULL OR CASE
    WHEN jsonb_typeof(desafio) <> 'object' THEN false
    WHEN NOT (desafio->>'tipo' IN ('logica','cruzadinha')) THEN false
    -- Nenhuma chave de resposta, em nivel nenhum: o aluno le esta coluna.
    WHEN jsonb_path_exists(desafio, '$.** ? (exists (@.resposta) || exists (@.respostas)
           || exists (@.aceitas) || exists (@.gabarito) || exists (@.palavra))') THEN false
    WHEN desafio->>'tipo' = 'logica' THEN
      CASE
        WHEN jsonb_typeof(desafio->'enunciado') IS DISTINCT FROM 'string' THEN false
        WHEN btrim(desafio->>'enunciado') = '' THEN false
        WHEN desafio->>'formato' = 'curta' THEN true
        WHEN desafio->>'formato' = 'multipla' THEN
          CASE WHEN jsonb_typeof(desafio->'alternativas') = 'array'
               THEN jsonb_array_length(desafio->'alternativas') >= 2
               ELSE false END
        ELSE false
      END
    ELSE
      CASE WHEN jsonb_typeof(desafio->'palavras') = 'array'
           THEN jsonb_array_length(desafio->'palavras') BETWEEN 4 AND 10
           ELSE false END
  END);

CREATE INDEX IF NOT EXISTS missoes_desafio_por_conteudo_idx
  ON public.missoes (classe_id, conteudo_id) WHERE desafio IS NOT NULL;
CREATE INDEX IF NOT EXISTS missoes_desafio_grupo_idx
  ON public.missoes (desafio_grupo) WHERE desafio_grupo IS NOT NULL;
"""

# --------------------------------------------------------------------------- gabarito e tentativas
TABELAS = """
-- So' o professor dono le; escrita so' pela RPC (SECURITY DEFINER), sem policy de escrita.
CREATE TABLE IF NOT EXISTS public.missao_desafio_gabarito (
  desafio_grupo uuid PRIMARY KEY,
  resposta      jsonb NOT NULL CHECK (jsonb_typeof(resposta) = 'object'),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.missao_desafio_gabarito ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missao_desafio_gabarito_professor_sel ON public.missao_desafio_gabarito;
CREATE POLICY missao_desafio_gabarito_professor_sel ON public.missao_desafio_gabarito
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.missoes m
     WHERE m.desafio_grupo = missao_desafio_gabarito.desafio_grupo
       AND m.classe_id IN (SELECT public.app_classes_do_professor())
  ));
REVOKE ALL ON public.missao_desafio_gabarito FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.missao_desafio_gabarito TO authenticated;

-- So' de acrescimo. O aluno le as proprias, o professor as das turmas dele; so' a RPC grava.
CREATE TABLE IF NOT EXISTS public.missao_desafio_tentativa (
  id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  missao_id       bigint REFERENCES public.missoes(id) ON DELETE CASCADE,
  desafio_grupo   uuid NOT NULL,
  aluno_id        uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  acertou         boolean NOT NULL,
  palavras_certas smallint,
  palavras_total  smallint,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missao_desafio_tentativa_palavras
    CHECK ((palavras_certas IS NULL) = (palavras_total IS NULL)
           AND (palavras_total IS NULL OR (palavras_certas BETWEEN 0 AND palavras_total)))
);

CREATE INDEX IF NOT EXISTS missao_desafio_tentativa_aluno_grupo_idx
  ON public.missao_desafio_tentativa (aluno_id, desafio_grupo, criado_em);

ALTER TABLE public.missao_desafio_tentativa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missao_desafio_tentativa_aluno_sel ON public.missao_desafio_tentativa;
CREATE POLICY missao_desafio_tentativa_aluno_sel ON public.missao_desafio_tentativa
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());
DROP POLICY IF EXISTS missao_desafio_tentativa_professor_sel ON public.missao_desafio_tentativa;
CREATE POLICY missao_desafio_tentativa_professor_sel ON public.missao_desafio_tentativa
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.missoes m
     WHERE m.id = missao_desafio_tentativa.missao_id
       AND m.classe_id IN (SELECT public.app_classes_do_professor())
  ));
REVOKE ALL ON public.missao_desafio_tentativa FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.missao_desafio_tentativa TO authenticated;

-- O gabarito nao tem FK para `missoes` (uma linha por perfil). Sai quando o grupo fica sem missao.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_gabarito_orfao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.desafio_grupo = OLD.desafio_grupo) THEN
    DELETE FROM public.missao_desafio_gabarito g WHERE g.desafio_grupo = OLD.desafio_grupo;
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_gabarito_orfao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_missoes_desafio_gabarito ON public.missoes;
CREATE TRIGGER trg_missoes_desafio_gabarito
  AFTER DELETE ON public.missoes
  FOR EACH ROW
  WHEN (OLD.desafio_grupo IS NOT NULL)
  EXECUTE FUNCTION public.fn_missao_desafio_gabarito_orfao();
"""

# Ruling de 17/11: os valores de `missao_diaria_concluida` (10/2), porque `missao_concluida` paga 0/0.
PREMIOS = """
INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas, descricao) VALUES
  ('desafio_logica', 10, 2, 'Resolveu um desafio de lógica de missão.'),
  ('desafio_cruzadinha', 10, 2, 'Resolveu uma cruzadinha de missão.')
ON CONFLICT (tipo) DO NOTHING;
"""

# Tentativa tem aluno: prazo de retenção no mesmo arquivo (portão da #195, `test_retencao_politica`).
RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('missao_desafio_tentativa', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'tentativas de desafio de missao; sai com a conta ou com a missao pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

# --------------------------------------------------------------------------------------- guarda
_SINAL = (
    "COALESCE(current_setting('app.desafio_gravando', true), '') = 'on'\n"
    "                        AND current_user NOT IN ('authenticated', 'anon')"
)

TROCAS_GUARDA = (
    (
        "  v_diaria boolean;\nBEGIN\n",
        "  v_diaria boolean;\n"
        "  v_desafio_liberado boolean;\n"
        "  v_recompensa_mudou boolean;\n"
        "BEGIN\n"
        "  -- O desafio so' e' escrito pela RPC do desafio (20261117_02): ela e' SECURITY DEFINER e liga o\n"
        "  -- sinal em volta da escrita. `current_user` e' a chave; o sinal, a intencao.\n"
        f"  v_desafio_liberado := {_SINAL};\n"
        "\n",
    ),
    (
        "    NEW.texto_modelo         := NULL;\n  END IF;\n",
        "    NEW.texto_modelo         := NULL;\n"
        "\n"
        "    -- Sem o gabarito ao lado e sem a grade conferida, o desafio nao vale (20261117_02).\n"
        "    IF NEW.desafio IS NOT NULL AND NOT v_desafio_liberado THEN\n"
        "      RAISE EXCEPTION 'Desafio só é criado pela função missao_desafio_criar.'\n"
        "        USING ERRCODE = '42501';\n"
        "    END IF;\n"
        "  END IF;\n",
    ),
    (
        "    NEW.criado_em   := OLD.criado_em;\n",
        "    NEW.criado_em   := OLD.criado_em;\n"
        "\n"
        "    -- O desafio (20261117_02): fora da RPC, ninguem o poe, troca ou tira. Na missao-desafio\n"
        "    -- tambem ficam o criterio, o escopo e a turma (o desafio e' de um conteudo daquela turma);\n"
        "    -- perfil, `ativa`, texto e janela continuam do professor.\n"
        "    IF NOT v_desafio_liberado THEN\n"
        "      NEW.desafio := OLD.desafio;\n"
        "      NEW.desafio_grupo := OLD.desafio_grupo;\n"
        "      NEW.conteudo_id := OLD.conteudo_id;\n"
        "      IF OLD.desafio IS NOT NULL THEN\n"
        "        NEW.criterio := OLD.criterio;\n"
        "        NEW.escopo := OLD.escopo;\n"
        "        NEW.classe_id := OLD.classe_id;\n"
        "      END IF;\n"
        "    END IF;\n",
    ),
    (
        "  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia', 'item_no_dia')\n",
        "  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia', 'item_no_dia', 'desafio')\n",
    ),
    (
        "  IF v_metrica = 'atividade_especifica'\n",
        "  -- `desafio` so' fecha pela RPC: missao comum com ela nunca fecharia, e desafio com outra\n"
        "  -- metrica cairia no laco do avaliador (20261117_02).\n"
        "  IF (v_metrica = 'desafio') <> (NEW.desafio IS NOT NULL) THEN\n"
        "    RAISE EXCEPTION 'A métrica desafio é só da missão com desafio, e a missão com desafio usa só ela.'\n"
        "      USING ERRCODE = '22023';\n"
        "  END IF;\n"
        "  IF v_metrica = 'atividade_especifica'\n",
    ),
    (
        "  -- Recompensa e chave de `eventos_pontuacao`, nao numero.",
        "  -- So' os tipos que a recusa de `eventos_aluno` protege (TIPOS_DE_PREMIO, 20261117_01): outro\n"
        "  -- tipo seria premio que o proprio aluno conseguiria gravar. Missao antiga com outro tipo\n"
        "  -- continua editavel enquanto o tipo nao mudar (20261117_02).\n"
        "  IF TG_OP = 'INSERT' THEN\n"
        "    v_recompensa_mudou := true;\n"
        "  ELSE\n"
        "    v_recompensa_mudou := NEW.recompensa_tipo IS DISTINCT FROM OLD.recompensa_tipo;\n"
        "  END IF;\n"
        "  IF v_recompensa_mudou AND NEW.recompensa_tipo NOT IN (" + _lista(TIPOS_DE_PREMIO) + ") THEN\n"
        "    RAISE EXCEPTION 'recompensa_tipo % não é prêmio de missão; use um de: "
        + ", ".join(TIPOS_DE_PREMIO)
        + ".', NEW.recompensa_tipo\n"
        "      USING ERRCODE = '22023';\n"
        "  END IF;\n"
        "\n"
        "  -- Recompensa e chave de `eventos_pontuacao`, nao numero.",
    ),
)


def guarda() -> str:
    """A guarda da `20261103_06` com as trocas daqui."""
    texto = M06.guarda()
    for antes, depois in TROCAS_GUARDA:
        texto = _trocar(texto, antes, depois)
    return texto


# ------------------------------------------------------------------------------------ avaliador
_LACO_ANTES = "             m.classe_id\n        FROM public.missoes m\n       WHERE m.ativa\n"
TROCAS_GATILHO = (
    (
        _LACO_ANTES,
        _LACO_ANTES
        + "         -- Missao-desafio so' fecha pela RPC do desafio, nunca por evento (20261117_02).\n"
        + "         AND m.desafio IS NULL\n",
    ),
)

_ITEM_ANTES = "         AND m.criterio ->> 'metrica' = 'item_no_dia'\n"
ITEM = _trocar(
    M17_01.ITEM,
    _ITEM_ANTES,
    _ITEM_ANTES + "         -- Missao-desafio so' fecha pela RPC do desafio (20261117_02).\n         AND m.desafio IS NULL\n",
)


def gatilho_depois_da_17_01() -> str:
    """O gatilho de eventos como a cadeia o deixa depois da `20261117_01`."""
    texto = M17_01.gatilho_de_eventos_do_git()
    for antes, depois in M17_01.TROCAS_GATILHO:
        texto = _trocar(texto, antes, depois)
    return texto


def _trocas_no_banco(funcao: str, assinatura: str, trocas, aplicar: bool) -> str:
    """O padrão da `20261117_01`, com a marca daqui: troca cada `antes` por `depois` no corpo vivo da
    função, tudo num EXECUTE só. Idempotente pela marca; recusa âncora ausente ou repetida."""
    pares = [(a, d) if aplicar else (d, a) for a, d in trocas]
    if not aplicar:
        pares.reverse()
    ja_feito = "> 0" if aplicar else "= 0"
    passos = "".join(
        f"""
  IF (length(v_def) - length(replace(v_def, $a${origem}$a$, ''))) / length($a${origem}$a$) <> 1 THEN
    RAISE EXCEPTION 'ancora {n} ausente ou repetida em {funcao}';
  END IF;
  v_def := replace(v_def, $a${origem}$a$, $r${destino}$r$);
"""
        for n, (origem, destino) in enumerate(pares, start=1)
    )
    return f"""
DO $migracao$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.{funcao}({assinatura})'::regprocedure) INTO v_def;
  IF position($m${MARCA}$m$ IN v_def) {ja_feito} THEN
    RETURN;
  END IF;
{passos}
  EXECUTE v_def;
END;
$migracao$;
"""


def gatilho(aplicar: bool = True) -> str:
    return _trocas_no_banco("trg_eventos_aluno_after_iud", "", TROCAS_GATILHO, aplicar)


# Calculados na importação: âncora que sumir derruba a migration antes de ela tocar no banco.
GUARDA = guarda()
for _antes, _ in TROCAS_GATILHO:
    _trocar(gatilho_depois_da_17_01(), _antes, _antes)


# ------------------------------------------------------------------------------------- downgrade
SEM_DESAFIO = f"""
-- Sem a coluna, a missao-desafio viraria uma missao que nunca fecha.
DELETE FROM public.missoes WHERE desafio IS NOT NULL;

DROP TRIGGER IF EXISTS trg_missoes_desafio_gabarito ON public.missoes;
DROP FUNCTION IF EXISTS public.fn_missao_desafio_gabarito_orfao();
DROP TABLE IF EXISTS public.missao_desafio_tentativa;
DELETE FROM public.retencao_politica WHERE tabela = 'missao_desafio_tentativa';
DROP TABLE IF EXISTS public.missao_desafio_gabarito;

DROP INDEX IF EXISTS public.missoes_desafio_por_conteudo_idx;
DROP INDEX IF EXISTS public.missoes_desafio_grupo_idx;
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_forma;
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_colunas_juntas;
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_de_aluno;
ALTER TABLE public.missoes
  DROP COLUMN IF EXISTS desafio,
  DROP COLUMN IF EXISTS conteudo_id,
  DROP COLUMN IF EXISTS desafio_grupo;

-- O premio sai so' se nada o usar: o valor ja' gravado nao muda, mas o tipo sem linha valeria 0.
DELETE FROM public.eventos_pontuacao ep
 WHERE ep.tipo IN ({_lista(("desafio_logica", "desafio_cruzadinha"))})
   AND NOT EXISTS (SELECT 1 FROM public.eventos_aluno e WHERE e.tipo = ep.tipo)
   AND NOT EXISTS (SELECT 1 FROM public.eventos_pontuacao_classe pc WHERE pc.tipo = ep.tipo)
   AND NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.recompensa_tipo = ep.tipo);
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(PREMIOS)
    op.execute(GUARDA)
    op.execute(gatilho())
    op.execute(ITEM)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(M17_01.ITEM)
    op.execute(gatilho(aplicar=False))
    op.execute(M06.guarda())
    op.execute(SEM_DESAFIO)
    op.execute("NOTIFY pgrst, 'reload schema'")
