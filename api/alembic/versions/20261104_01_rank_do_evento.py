"""Rank do evento: inscrição do aluno e um rank por critério na janela do evento (#155)

Fase 2 de `docs/superpowers/specs/2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md`, com
as decisões D3 a D7 aprovadas em 03/11. A fase 1 (`20261103_15`, duelo fora do XP) já está na main.
Só banco: nenhum cliente chama nada disto ainda (console e app são as fases 3 e 4).

## O que muda

- **`evento_inscricoes`**: quem entrou na disputa de um evento. Não é tabela de ranking (o aceite da
  #155 pede "nenhuma tabela nova de ranking"): o ranking continua sendo `ranks` + `rank_tipo` e a
  view de sempre.
- **Inscrição só por RPC.** `evento_classe_inscrever(evento)` e `evento_classe_sair(evento)`,
  `SECURITY DEFINER`, idempotentes. Conferem, antes de ler qualquer coisa do evento: sessão,
  matrícula do aluno na turma (`app_classes_do_aluno()`), evento `aberto`, `now() < fim` e a peça
  `arena`. O cliente não tem INSERT, UPDATE nem DELETE na tabela.
- **Leitura pela RLS**, no mesmo commit da tabela: o aluno lê a própria linha e o professor lê as
  linhas das turmas dele (`app_classes_do_professor()`).
- **`ranks.evento_id`** e **`eventos_classe.arena_criterios`** (`pontuacao`, `missoes`,
  `ranqueada`, os três critérios que respeitam a janela, D4). Os critérios congelam ao abrir, como
  as outras regras do evento (`fn_eventos_classe_guarda`).
- **Abrir cria os ranks** (`fn_evento_classe_abrir_agora`, a mesma transação, então vale para o
  clique e para o cron): um rank por critério, com `inicio`/`fim` do evento e o título como rótulo
  do período. Peça `arena` sem critério usa `ranqueada`. Critério sem linha em `rank_tipo` é pulado
  em vez de levantar: `fn_eventos_classe_varrer` engole exceção como `falhas`, e o evento agendado
  simplesmente não abriria.
- **Encerrar antes da hora encurta o rank** (`fn_evento_classe_encerrar_agora`), antes de apurar.
  O crédito dos pontos do evento nasce com `criado_em = now()` e a janela é `< fim`, então ele fica
  fora do rank do evento.
- **A view conta só inscritos** no rank de evento. E conta duelo ali (a exceção que a fase 1
  anunciou): o aluno escolheu entrar, e é o único lugar fora do `ranqueada` em que o duelo pesa.
  O corte do #134 (`vw_rank_posicoes_por_classe`) e a regra dos 8 participantes do
  `percentual_do_lider` valem por herança, porque os dois contam depois deste filtro.

## Armadilhas fechadas aqui

- `fn_ranks_guarda`: o cliente não cria rank com `evento_id`, não muda `evento_id` de rank nenhum e
  não edita nem exclui rank de evento. A exclusão em cascata (o evento ou a turma apagados) passa,
  como já passava para o histórico.
- `fn_rank_novo_periodo`: recusa rank de evento, e o nome de período de evento não bloqueia o
  "Novo período" da turma.
- `notificacoes_rank_varrer()`: ignora rank de evento. Senão avisaria amigos de quem nem entrou.
- `vw_ranks_info_por_classe` e o caminho de reserva do app (`rankMetadata.ts`) já filtram
  `fim IS NULL`, e o rank de evento nasce com `fim`: builds antigas não o listam.
- `ranks_um_periodo_aberto` só vale para `fim IS NULL`: o rank do evento não colide com ele.

**Por que nenhuma função nova na view.** Função chamada nela precisa de EXECUTE para o cliente: foi
o 42501 de 29/10. O filtro de inscritos é um `EXISTS` sobre a tabela, que a `_todas` lê como dona
(sem invoker, e sem GRANT para os papéis de cliente).

## Downgrade

Volta as funções e a view às versões de antes, apaga os ranks de evento, derruba as RPCs, a tabela,
as colunas e a linha de retenção.

Revision ID: 20261104_01
Revises: 20261103_15
Create Date: 2026-11-04
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261104_01"
down_revision = "20261103_15"
branch_labels = None
depends_on = None

CRITERIOS = ("pontuacao", "missoes", "ranqueada")
CRITERIO_PADRAO = "ranqueada"


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_04_01", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str, vezes: int = 1) -> str:
    if texto.count(antigo) != vezes:
        raise RuntimeError(f"{onde}: esperava {vezes} ocorrência(s), achei {texto.count(antigo)}")
    return texto.replace(antigo, novo)


def _funcao(texto: str, nome: str, origem: str) -> str:
    """Recorta `CREATE OR REPLACE FUNCTION public.<nome>(...)` até o fim do corpo, da origem."""
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{re.escape(nome)}\(.*?\$(function|fn)\$;",
        texto,
        re.S,
    )
    if m is None:
        raise RuntimeError(f"{nome} não encontrado em {origem}; revise a 20261104_01")
    return m.group(0)


_LISTA = ", ".join(f"'{c}'" for c in CRITERIOS)

TABELA = """
CREATE TABLE IF NOT EXISTS public.evento_inscricoes (
  evento_id uuid NOT NULL REFERENCES public.eventos_classe(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  inscrito_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS evento_inscricoes_aluno_idx ON public.evento_inscricoes (aluno_id);

COMMENT ON TABLE public.evento_inscricoes IS
  'Quem entrou no rank do evento (#155). Escrita só por evento_classe_inscrever/_sair. '
  'Não é ranking: o rank é ranks.evento_id + vw_rank_posicoes_por_classe_todas.';

ALTER TABLE public.evento_inscricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evento_inscricoes_sel ON public.evento_inscricoes;
CREATE POLICY evento_inscricoes_sel ON public.evento_inscricoes FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.eventos_classe e
       WHERE e.id = evento_inscricoes.evento_id
         AND e.classe_id IN (SELECT public.app_classes_do_professor())
    )
  );

REVOKE ALL ON public.evento_inscricoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.evento_inscricoes TO authenticated;
GRANT ALL ON public.evento_inscricoes TO service_role;

INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('evento_inscricoes', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'inscricao no rank de um evento; sai com a conta ou com o evento pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

COLUNAS = f"""
ALTER TABLE public.ranks
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.eventos_classe(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ranks_um_por_evento_e_tipo
  ON public.ranks (evento_id, tipo_id) WHERE evento_id IS NOT NULL;

COMMENT ON COLUMN public.ranks.evento_id IS
  'Rank do evento (#155): nasce quando o evento abre, com a janela dele, e conta só os inscritos. '
  'Nenhum cliente escreve: fn_ranks_guarda recusa.';

ALTER TABLE public.eventos_classe
  ADD COLUMN IF NOT EXISTS arena_criterios text[] NOT NULL DEFAULT '{{}}';

ALTER TABLE public.eventos_classe DROP CONSTRAINT IF EXISTS eventos_classe_arena_criterios;
ALTER TABLE public.eventos_classe ADD CONSTRAINT eventos_classe_arena_criterios
  CHECK (arena_criterios <@ ARRAY[{_LISTA}]::text[]);

COMMENT ON COLUMN public.eventos_classe.arena_criterios IS
  'Critérios do rank do evento (#155, D4): só os que respeitam a janela. Vazio com a peça arena '
  'vale {CRITERIO_PADRAO}. Congelam ao abrir.';
"""


# --- fn_eventos_classe_guarda: os critérios congelam ao abrir ------------------------------------


def guarda_evento_antiga() -> str:
    m = _load("20261017_09_evento_medalhas.py")
    return _funcao(m.SQL, "fn_eventos_classe_guarda", "20261017_09.SQL")


def guarda_evento_nova() -> str:
    return _troca(
        guarda_evento_antiga(),
        "    OR NEW.pecas IS DISTINCT FROM OLD.pecas OR NEW.pontos IS DISTINCT FROM OLD.pontos\n",
        "    OR NEW.pecas IS DISTINCT FROM OLD.pecas OR NEW.pontos IS DISTINCT FROM OLD.pontos\n"
        "    OR NEW.arena_criterios IS DISTINCT FROM OLD.arena_criterios\n",
        "fn_eventos_classe_guarda",
    )


# --- abrir e encerrar --------------------------------------------------------------------------


def miolos_antigos() -> str:
    return _load("20261025_04_evento_abre_e_encerra_no_horario.py").MIOLOS


ABRIR_ANTES = """  IF v_evento.modalidade_guilda THEN
    v_guildas := COALESCE(public.fn_guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id), 0);
  END IF;

  RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', v_guildas, 'novo', true);
"""

ABRIR_DEPOIS = f"""  IF v_evento.modalidade_guilda THEN
    v_guildas := COALESCE(public.fn_guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id), 0);
  END IF;

  -- Rank do evento (#155): um por critério, com a janela do evento. Critério sem linha em
  -- `rank_tipo` é pulado: levantar aqui faria a varredura contar `falhas` e o evento agendado não
  -- abriria. A flag deixa `fn_ranks_guarda` aceitar `evento_id`, `inicio` e `fim`.
  IF v_evento.pecas ? 'arena' THEN
    PERFORM set_config('app.rank_periodo', 'on', true);
    INSERT INTO public.ranks (tipo_id, classe_id, periodo, inicio, fim, evento_id)
    SELECT t.tipo_id, v_evento.classe_id, btrim(left(btrim(v_evento.titulo), 40)),
           v_evento.inicio, v_evento.fim, v_evento.id
      FROM (
        SELECT (SELECT min(rt.id) FROM public.rank_tipo rt WHERE rt.criterio = c.criterio) AS tipo_id
          FROM unnest(CASE WHEN cardinality(v_evento.arena_criterios) = 0
                           THEN ARRAY['{CRITERIO_PADRAO}']::text[]
                           ELSE v_evento.arena_criterios END) AS c(criterio)
      ) t
     WHERE t.tipo_id IS NOT NULL
    ON CONFLICT (evento_id, tipo_id) WHERE evento_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_ranks = ROW_COUNT;
    PERFORM set_config('app.rank_periodo', '', true);
  END IF;

  RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', v_guildas, 'ranks', v_ranks,
                            'novo', true);
"""

ENCERRAR_ANTES = """  UPDATE public.eventos_classe SET status = 'encerrado', encerrado_em = now() WHERE id = p_evento_id;
  v_participantes := public.fn_evento_classe_apurar(p_evento_id);
"""

ENCERRAR_DEPOIS = """  UPDATE public.eventos_classe SET status = 'encerrado', encerrado_em = now() WHERE id = p_evento_id;

  -- Encerrado antes da hora, o rank do evento para agora, ANTES da apuração: o crédito dos pontos
  -- do evento nasce com `criado_em = now()` e a janela da view é `< fim`, então fica de fora.
  -- `GREATEST` com o inicio: encerrar antes de começar não viola `ranks_janela`.
  PERFORM set_config('app.rank_periodo', 'on', true);
  UPDATE public.ranks
     SET fim = GREATEST(inicio, now())
   WHERE evento_id = p_evento_id AND fim > now();
  PERFORM set_config('app.rank_periodo', '', true);

  v_participantes := public.fn_evento_classe_apurar(p_evento_id);
"""


def miolos_novos() -> str:
    sql = _troca(
        miolos_antigos(),
        "  v_guildas integer := 0;\n",
        "  v_guildas integer := 0;\n  v_ranks integer := 0;\n",
        "declaração de fn_evento_classe_abrir_agora",
    )
    sql = _troca(sql, ABRIR_ANTES, ABRIR_DEPOIS, "fim de fn_evento_classe_abrir_agora")
    return _troca(sql, ENCERRAR_ANTES, ENCERRAR_DEPOIS, "fn_evento_classe_encerrar_agora")


# --- ranks: guarda e novo período ----------------------------------------------------------------


def _m16():
    return _load("20261021_16_rank_periodo_manual.py")


def guarda_ranks_antiga() -> str:
    return _m16().GUARDA


def guarda_ranks_nova() -> str:
    sql = _troca(
        guarda_ranks_antiga(),
        "  IF TG_OP = 'DELETE' THEN\n",
        "  IF TG_OP = 'DELETE' THEN\n"
        "    -- Rank de evento só sai com o evento (cascata) ou pela transição.\n"
        "    IF OLD.evento_id IS NOT NULL\n"
        "       AND pg_trigger_depth() <= 1\n"
        "       AND COALESCE(current_setting('app.rank_periodo', true), '') <> 'on' THEN\n"
        "      RAISE EXCEPTION 'O rank do evento acompanha o evento e não pode ser excluído.' USING ERRCODE = '42501';\n"
        "    END IF;\n",
        "DELETE de fn_ranks_guarda",
    )
    sql = _troca(
        sql,
        "  IF TG_OP = 'INSERT' THEN\n"
        "    -- Ranking criado pelo console nasce aberto, agora.\n",
        "  IF TG_OP = 'INSERT' THEN\n"
        "    IF NEW.evento_id IS NOT NULL THEN\n"
        "      RAISE EXCEPTION 'O rank do evento nasce quando o evento abre.' USING ERRCODE = '42501';\n"
        "    END IF;\n"
        "    -- Ranking criado pelo console nasce aberto, agora.\n",
        "INSERT de fn_ranks_guarda",
    )
    return _troca(
        sql,
        "  IF OLD.fim IS NOT NULL THEN\n"
        "    RAISE EXCEPTION 'Este período já foi encerrado",
        "  IF OLD.evento_id IS NOT NULL OR NEW.evento_id IS NOT NULL THEN\n"
        "    RAISE EXCEPTION 'O rank do evento só muda quando o evento abre ou encerra.' USING ERRCODE = '42501';\n"
        "  END IF;\n"
        "  IF OLD.fim IS NOT NULL THEN\n"
        "    RAISE EXCEPTION 'Este período já foi encerrado",
        "UPDATE de fn_ranks_guarda",
    )


def novo_periodo_antigo() -> str:
    return _m16().NOVO_PERIODO


def novo_periodo_novo() -> str:
    sql = _troca(
        novo_periodo_antigo(),
        "  IF char_length(v_periodo) < 1 OR char_length(v_periodo) > 40 THEN\n",
        "  IF v_rank.evento_id IS NOT NULL THEN\n"
        "    RAISE EXCEPTION 'O rank do evento acompanha a janela do evento: não tem período novo.' USING ERRCODE = '22023';\n"
        "  END IF;\n\n"
        "  IF char_length(v_periodo) < 1 OR char_length(v_periodo) > 40 THEN\n",
        "rank de evento em fn_rank_novo_periodo",
    )
    # O título de um evento não pode ocupar o nome de um período da turma.
    return _troca(
        sql,
        "       AND r.classe_id = v_rank.classe_id\n"
        "       AND lower(btrim(COALESCE(r.periodo, ''))) = lower(v_periodo)\n"
        "  ) THEN\n",
        "       AND r.classe_id = v_rank.classe_id\n"
        "       AND r.evento_id IS NULL\n"
        "       AND lower(btrim(COALESCE(r.periodo, ''))) = lower(v_periodo)\n"
        "  ) THEN\n",
        "nome repetido em fn_rank_novo_periodo",
    )


# --- a view -------------------------------------------------------------------------------------


def view_antiga() -> str:
    return _load("20261103_15_duelo_fora_do_xp.py").view_nova()


def view_nova() -> str:
    sql = _troca(
        view_antiga(),
        "            r.fim AT TIME ZONE 'UTC'::text AS fim_utc\n           FROM ranks r\n",
        "            r.fim AT TIME ZONE 'UTC'::text AS fim_utc,\n            r.evento_id\n           FROM ranks r\n",
        "ranks_janela",
    )
    sql = _troca(
        sql,
        "            AND NOT e.fora_do_xp\n",
        "            -- No rank do evento o duelo conta: quem está ali escolheu entrar (#155).\n"
        "            AND (NOT e.fora_do_xp OR rj.evento_id IS NOT NULL)\n",
        "eventos_por_rank",
    )
    return _troca(
        sql,
        "             CROSS JOIN elo_config ecfg\n        ), ordenado AS (",
        "             CROSS JOIN elo_config ecfg\n"
        "          -- Rank do evento: só quem se inscreveu (#155). Sem função: a view é lida pelo cliente.\n"
        "          WHERE r.evento_id IS NULL\n"
        "             OR EXISTS (SELECT 1 FROM evento_inscricoes i\n"
        "                         WHERE i.evento_id = r.evento_id AND i.aluno_id = ca.aluno_id)\n"
        "        ), ordenado AS (",
        "base",
    )


# --- notificações de rank -----------------------------------------------------------------------


def notificacoes_antiga() -> str:
    m = _load("20261102_18_notificacao_por_perfil_e_foco.py")
    return _funcao(m.FUNCOES, "notificacoes_rank_varrer", "20261102_18.FUNCOES")


def notificacoes_nova() -> str:
    return _troca(
        notificacoes_antiga(),
        "       WHERE r.inicio <= now() AND (r.fim IS NULL OR r.fim > now())\n",
        "       WHERE r.inicio <= now() AND (r.fim IS NULL OR r.fim > now())\n"
        "         -- Rank de evento fica de fora: avisaria amigos de quem nem entrou (#155).\n"
        "         AND r.evento_id IS NULL\n",
        "ativos de notificacoes_rank_varrer",
    )


# --- RPCs do aluno ------------------------------------------------------------------------------

RPCS = """
CREATE OR REPLACE FUNCTION public.evento_classe_inscrever(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_status text;
  v_fim timestamptz;
  v_pecas jsonb;
  v_novo integer := 0;
BEGIN
  -- Posse antes de ler: sem sessão ou sem matrícula, o evento "não existe" para quem chama.
  -- FOR SHARE: o encerramento (FOR UPDATE) espera, e ninguém entra num evento que está fechando.
  SELECT e.status, e.fim, e.pecas INTO v_status, v_fim, v_pecas FROM public.eventos_classe e
   WHERE e.id = p_evento_id
     AND v_aluno IS NOT NULL
     AND e.classe_id IN (SELECT public.app_classes_do_aluno())
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'aberto' OR v_fim <= now() THEN
    RAISE EXCEPTION 'O evento não está aberto.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_pecas ? 'arena' THEN
    RAISE EXCEPTION 'Este evento não tem rank.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.evento_inscricoes (evento_id, aluno_id)
  VALUES (p_evento_id, v_aluno)
  ON CONFLICT (evento_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_novo = ROW_COUNT;

  RETURN jsonb_build_object('inscrito', true, 'novo', v_novo > 0);
END
$function$;

CREATE OR REPLACE FUNCTION public.evento_classe_sair(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_status text;
  v_fim timestamptz;
  v_saiu integer := 0;
BEGIN
  SELECT e.status, e.fim INTO v_status, v_fim FROM public.eventos_classe e
   WHERE e.id = p_evento_id
     AND v_aluno IS NOT NULL
     AND e.classe_id IN (SELECT public.app_classes_do_aluno())
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  -- Sair vale a qualquer momento com o evento aberto (D6). Encerrado, o rank é o resultado.
  IF v_status <> 'aberto' OR v_fim <= now() THEN
    RAISE EXCEPTION 'O evento não está aberto.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.evento_inscricoes
   WHERE evento_id = p_evento_id AND aluno_id = v_aluno;
  GET DIAGNOSTICS v_saiu = ROW_COUNT;

  RETURN jsonb_build_object('inscrito', false, 'novo', v_saiu > 0);
END
$function$;

REVOKE ALL ON FUNCTION public.evento_classe_inscrever(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_inscrever(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.evento_classe_sair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_sair(uuid) TO authenticated, service_role;
"""

DESFAZ = """
DROP FUNCTION IF EXISTS public.evento_classe_sair(uuid);
DROP FUNCTION IF EXISTS public.evento_classe_inscrever(uuid);
DELETE FROM public.retencao_politica WHERE tabela = 'evento_inscricoes';
DROP TABLE IF EXISTS public.evento_inscricoes;
ALTER TABLE public.eventos_classe DROP CONSTRAINT IF EXISTS eventos_classe_arena_criterios;
ALTER TABLE public.eventos_classe DROP COLUMN IF EXISTS arena_criterios;
DROP INDEX IF EXISTS public.ranks_um_por_evento_e_tipo;
ALTER TABLE public.ranks DROP COLUMN IF EXISTS evento_id;
"""

# Antes da guarda antiga voltar: ela não sabe o que é rank de evento.
APAGA_RANKS_DE_EVENTO = """
SELECT set_config('app.rank_periodo', 'on', true);
DELETE FROM public.ranks WHERE evento_id IS NOT NULL;
SELECT set_config('app.rank_periodo', '', true);
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(TABELA)
    op.execute(guarda_evento_nova())
    op.execute(guarda_ranks_nova())
    op.execute(novo_periodo_novo())
    op.execute(view_nova())
    op.execute(miolos_novos())
    op.execute(notificacoes_nova())
    op.execute(RPCS)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(APAGA_RANKS_DE_EVENTO)
    op.execute(notificacoes_antiga())
    op.execute(miolos_antigos())
    op.execute(view_antiga())
    op.execute(novo_periodo_antigo())
    op.execute(guarda_ranks_antiga())
    op.execute(guarda_evento_antiga())
    op.execute(DESFAZ)
    op.execute(RELOAD)
