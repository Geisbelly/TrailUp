"""O evento abre e encerra sozinho no horário: varredura no `pg_cron` a cada minuto (#141)

## O que faltava

`eventos_classe` tem janela (`inicio`/`fim`, `timestamptz`), mas só o professor movia o estado:
`evento_classe_abrir` e `evento_classe_encerrar` exigem `auth.uid()` de quem tem a turma. Evento que
o professor esquecia de encerrar ficava `aberto` para sempre, sem apuração, sem os pontos do evento
(`20261025_01`), sem moedas nem medalhas. E não havia como deixar um evento pronto para abrir na hora
marcada: abrir era sempre um clique.

O aceite da #141 pede "agendamento e apuração no banco — a API hiberna, nada com relógio nela". Esta
migration faz isso no Postgres, com o mesmo desenho que a `20261021_09` usou para o desafio de guilda
(`fn_desafio_encerrar` + `fn_desafio_varrer_abandonados` no `pg_cron`).

## O miolo sai da porta do cliente

As duas transições ganham um miolo interno, **sem** checagem de sessão (o cron não tem `auth.uid()`;
a checagem de posse levantaria `42501` em toda passada):

- `fn_evento_classe_abrir_agora(evento)`: o corpo de `evento_classe_abrir` da `20261017_02`, com as
  mesmas exigências (rascunho, janela não terminada, ao menos uma peça) e o congelamento das guildas.
- `fn_evento_classe_encerrar_agora(evento)`: o corpo de `evento_classe_encerrar` da `20261017_03`,
  que chama `fn_evento_classe_apurar` (resultado, moedas, medalhas e os pontos do evento no rank).
- `fn_guilda_congelar_composicao(evento, turma)`: a cópia congelada das guildas, sem a checagem de
  professor. `guilda_congelar_composicao` mantém a checagem e delega.

Os três são `SECURITY DEFINER` sem EXECUTE para nenhum papel de cliente. As portas
`evento_classe_abrir` / `evento_classe_encerrar` continuam conferindo a posse **antes** de ler e
delegam: o console não muda de contrato.

## Idempotência e concorrência

O estado é a trava. Os dois miolos fazem `SELECT ... FOR UPDATE` na linha do evento e decidem depois
de pegar a trava, então duas transições do mesmo evento se enfileiram e a segunda vê o estado novo:

- encerrar um evento **já encerrado** devolve `novo: false` e não apura de novo (nada é creditado
  duas vezes; os créditos ainda têm os índices únicos de `moedas_ledger` e
  `eventos_aluno_evento_classe_unico` por baixo);
- abrir um evento **já aberto** devolve `novo: false` e não congela de novo.

Isso vale também para o clique do professor: se a varredura encerrou um segundo antes, o "Encerrar"
do console responde que está encerrado em vez de dar erro. Encerrar um rascunho e abrir um evento
encerrado continuam recusados como antes.

A varredura (`fn_eventos_classe_varrer`) ainda:

- pega `pg_try_advisory_xact_lock`: duas passadas ao mesmo tempo (job duplicado, chamada à mão
  durante o cron) não disputam; a segunda devolve `pulou: true` e sai;
- seleciona com `FOR UPDATE SKIP LOCKED`: evento que o professor está encerrando agora fica para a
  próxima passada, sem esperar a trava dele;
- isola cada evento num bloco com `EXCEPTION`: um evento com problema vira `WARNING` no log e não
  impede os outros; a próxima passada tenta de novo;
- tem teto de 100 eventos por estado e por passada.

## Quem abre sozinho: só quem o professor agendou

Encerrar no fim vale para **todo** evento aberto: a janela acabou, e a apuração só conta o que
aconteceu dentro dela, então encerrar no horário é o que o professor faria.

Abrir no início **não** vale para todo rascunho. O console promete "O evento nasce como rascunho. Os
alunos só o veem depois que você abrir", e um rascunho pela metade não pode ir ao ar porque a data
chegou. Por isso a coluna nova `eventos_classe.abrir_no_inicio` (padrão `false`): o professor marca no
formulário, e só esses rascunhos abrem sozinhos. Rascunhos que já existem não mudam de comportamento.
O CHECK `eventos_classe_agendado_com_peca` impede marcar um rascunho sem peça (abrir recusaria).

Rascunho agendado cuja janela inteira passou sem abrir (cron fora do ar, por exemplo) **não** abre:
`fn_evento_classe_abrir_agora` recusa janela terminada, como o clique já recusava.

## Fuso

`inicio`, `fim`, `aberto_em` e `encerrado_em` são `timestamptz` (`20261017_01`), e a comparação é
contra `now()`: instante contra instante, sem fuso no meio. O console grava a hora digitada no fuso
do navegador (`America/Sao_Paulo` para os professores) convertida em ISO UTC (`toISOString`), e o
`pg_cron` do Supabase roda em UTC; nenhum dos dois altera o instante comparado.

## Agendamento

`trailup_eventos_classe_varredura`, `* * * * *` (a cada minuto), agendado aqui como a
`20261024_03` faz com o expurgo: só se a extensão `pg_cron` existir, e reagendando por nome (aplicar
de novo não duplica o job). Sem `pg_cron` (banco local, CI) a migration passa e nada é agendado.

Não há perna na API, ao contrário do expurgo de retenção: lá o worker existe para apagar fora do banco
(Storage, OpenAI). Aqui tudo é no banco, e a #141 pede que nada dependa da API acordada.

## Downgrade

Desagenda o job, volta `evento_classe_abrir` da `20261017_02`, `evento_classe_encerrar` da
`20261017_03` e `guilda_congelar_composicao` de `docs/mobile/sql/20260912_03`, derruba os miolos, a
varredura, os índices, o CHECK e a coluna. Eventos que a varredura já abriu ou encerrou ficam como
estão: desfazer uma apuração mudaria o rank de quem já o viu.

Revision ID: 20261025_04
Revises: 20261025_03
Create Date: 2026-10-25
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261025_04"
down_revision = "20261025_03"
branch_labels = None
depends_on = None

JOB = "trailup_eventos_classe_varredura"
CRON = "* * * * *"
TETO = 100

COLUNA = """
ALTER TABLE public.eventos_classe
  ADD COLUMN IF NOT EXISTS abrir_no_inicio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eventos_classe.abrir_no_inicio IS
  'O professor agendou: o rascunho abre sozinho quando chega o inicio (fn_eventos_classe_varrer, '
  'pg_cron). Sem a marca o rascunho espera o clique, como o console promete. O fim vale para todo '
  'evento aberto, com ou sem a marca.';

ALTER TABLE public.eventos_classe DROP CONSTRAINT IF EXISTS eventos_classe_agendado_com_peca;
ALTER TABLE public.eventos_classe ADD CONSTRAINT eventos_classe_agendado_com_peca
  CHECK (NOT abrir_no_inicio OR status <> 'rascunho' OR jsonb_array_length(pecas) > 0);

-- O que a varredura procura a cada minuto, sem varrer a tabela.
CREATE INDEX IF NOT EXISTS eventos_classe_a_abrir_idx
  ON public.eventos_classe (inicio) WHERE status = 'rascunho' AND abrir_no_inicio;
CREATE INDEX IF NOT EXISTS eventos_classe_a_encerrar_idx
  ON public.eventos_classe (fim) WHERE status = 'aberto';
"""

COLUNA_FORA = """
DROP INDEX IF EXISTS public.eventos_classe_a_encerrar_idx;
DROP INDEX IF EXISTS public.eventos_classe_a_abrir_idx;
ALTER TABLE public.eventos_classe DROP CONSTRAINT IF EXISTS eventos_classe_agendado_com_peca;
ALTER TABLE public.eventos_classe DROP COLUMN IF EXISTS abrir_no_inicio;
"""

CONGELAR = """
CREATE OR REPLACE FUNCTION public.fn_guilda_congelar_composicao(p_evento_id text, p_classe_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_count integer;
BEGIN
  -- SEM checagem de professor de proposito: a abertura pela varredura nao tem sessao. Quem chama
  -- pelo cliente passa por `guilda_congelar_composicao`, que confere a posse e delega para ca.
  INSERT INTO public.guilda_evento_snapshot (evento_id, classe_id, guilda_id, aluno_id, aluno_nome, posicao)
  SELECT p_evento_id, g.classe_id, g.id, m.aluno_id, a.nome,
         row_number() OVER (PARTITION BY g.id ORDER BY m.joined_at)::integer
    FROM public.guildas g
    JOIN public.guilda_membros m ON m.guilda_id = g.id AND m.left_at IS NULL
    JOIN public.alunos a ON a.id = m.aluno_id
   WHERE g.classe_id = p_classe_id AND g.ativa
  ON CONFLICT (evento_id, guilda_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guilda_congelar_composicao(text, bigint) FROM PUBLIC, anon, authenticated;

-- Mesma assinatura e mesma checagem; o corpo passa a delegar. `CREATE OR REPLACE` mantem o EXECUTE
-- que a `20261021_25` deixou (so `service_role`).
CREATE OR REPLACE FUNCTION public.guilda_congelar_composicao(p_evento_id text, p_classe_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'guilda_sem_permissao';
  END IF;
  RETURN public.fn_guilda_congelar_composicao(p_evento_id, p_classe_id);
END
$function$;
"""

MIOLOS = """
CREATE OR REPLACE FUNCTION public.fn_evento_classe_abrir_agora(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_guildas integer := 0;
BEGIN
  -- A trava da linha e a decisao pelo estado: quem chega depois (clique ou varredura) espera aqui
  -- e le o estado que o primeiro deixou.
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF v_evento.status = 'aberto' THEN
    RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', 0, 'novo', false);
  END IF;
  IF v_evento.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Só um rascunho pode ser aberto.' USING ERRCODE = '22023';
  END IF;
  IF v_evento.fim <= now() THEN
    RAISE EXCEPTION 'A janela do evento já terminou.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_evento.pecas) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma peça para o evento.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.evento_transicao', 'on', true);
  UPDATE public.eventos_classe SET status = 'aberto', aberto_em = now() WHERE id = p_evento_id;

  IF v_evento.modalidade_guilda THEN
    v_guildas := COALESCE(public.fn_guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id), 0);
  END IF;

  RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', v_guildas, 'novo', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_evento_classe_encerrar_agora(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_participantes integer;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF v_evento.status = 'encerrado' THEN
    -- Ja apurado (pelo professor ou por outra passada): nao apura de novo, nada e creditado duas vezes.
    SELECT count(*)::integer INTO v_participantes
      FROM public.eventos_classe_resultado WHERE evento_id = p_evento_id AND participou;
    RETURN jsonb_build_object('status', 'encerrado', 'participantes', v_participantes, 'novo', false);
  END IF;
  IF v_evento.status <> 'aberto' THEN
    RAISE EXCEPTION 'Só um evento aberto pode ser encerrado.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.evento_transicao', 'on', true);
  UPDATE public.eventos_classe SET status = 'encerrado', encerrado_em = now() WHERE id = p_evento_id;
  v_participantes := public.fn_evento_classe_apurar(p_evento_id);

  RETURN jsonb_build_object('status', 'encerrado', 'participantes', v_participantes, 'novo', true);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_classe_abrir_agora(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_evento_classe_encerrar_agora(uuid) FROM PUBLIC, anon, authenticated;
"""

PORTAS = """
CREATE OR REPLACE FUNCTION public.evento_classe_abrir(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
BEGIN
  -- Posse antes de ler (e antes de mudar qualquer coisa). O miolo decide pelo estado.
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_evento_classe_abrir_agora(p_evento_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.evento_classe_encerrar(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_evento_classe_encerrar_agora(p_evento_id);
END
$function$;

REVOKE ALL ON FUNCTION public.evento_classe_abrir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_abrir(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.evento_classe_encerrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_encerrar(uuid) TO authenticated;
"""

VARREDURA = f"""
CREATE OR REPLACE FUNCTION public.fn_eventos_classe_varrer()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_id uuid;
  v_abertos integer := 0;
  v_encerrados integer := 0;
  v_falhas integer := 0;
BEGIN
  -- Uma passada por vez: job duplicado ou chamada a mao durante o cron sai sem disputar.
  IF NOT pg_try_advisory_xact_lock(hashtext('{JOB}')) THEN
    RETURN jsonb_build_object('pulou', true, 'abertos', 0, 'encerrados', 0, 'falhas', 0);
  END IF;

  -- Primeiro o fim (vale para todo evento aberto), depois o inicio (so os agendados).
  -- SKIP LOCKED: o evento que o professor esta encerrando agora fica para a proxima passada.
  FOR v_id IN
    SELECT e.id FROM public.eventos_classe e
     WHERE e.status = 'aberto' AND e.fim <= now()
     ORDER BY e.fim
     LIMIT {TETO}
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF (public.fn_evento_classe_encerrar_agora(v_id) ->> 'novo')::boolean THEN
        v_encerrados := v_encerrados + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas + 1;
      RAISE WARNING 'fn_eventos_classe_varrer: encerrar % falhou: %', v_id, SQLERRM;
    END;
  END LOOP;

  FOR v_id IN
    SELECT e.id FROM public.eventos_classe e
     WHERE e.status = 'rascunho' AND e.abrir_no_inicio
       AND e.inicio <= now() AND e.fim > now()
     ORDER BY e.inicio
     LIMIT {TETO}
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF (public.fn_evento_classe_abrir_agora(v_id) ->> 'novo')::boolean THEN
        v_abertos := v_abertos + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas + 1;
      RAISE WARNING 'fn_eventos_classe_varrer: abrir % falhou: %', v_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('pulou', false, 'abertos', v_abertos,
                            'encerrados', v_encerrados, 'falhas', v_falhas);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_eventos_classe_varrer() FROM PUBLIC, anon, authenticated;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.fn_eventos_classe_varrer()');
  END IF;
END $$
"""

CRON_FORA = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END $$
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"

AQUI = Path(__file__).resolve()
RAIZ = AQUI.parents[3]


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_25_04", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _funcao(texto: str, nome: str, origem: str) -> str:
    """Recorta `CREATE OR REPLACE FUNCTION public.<nome>(...)` até o fim do corpo, do arquivo de origem.

    Copiar à mão seria uma segunda fonte da verdade; recortar falha alto se a origem mudar de forma.
    """
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{re.escape(nome)}\(.*?\$(function|)\$;",
        texto,
        re.S,
    )
    if m is None:
        raise RuntimeError(f"{nome} não encontrado em {origem}; revise o downgrade da 20261025_04")
    return m.group(0)


def anteriores() -> str:
    """As três portas como estavam antes desta migration (o downgrade volta a elas)."""
    abrir = _funcao(_load("20261017_02_eventos_classe_abrir_encerrar.py").SQL, "evento_classe_abrir", "20261017_02")
    encerrar = _funcao(_load("20261017_03_eventos_classe_apuracao.py").SQL, "evento_classe_encerrar", "20261017_03")
    guildas = (RAIZ / "docs" / "mobile" / "sql" / "20260912_03_guildas_perfil_publico.sql").read_text(encoding="utf-8")
    congelar = _funcao(guildas, "guilda_congelar_composicao", "docs/mobile/sql/20260912_03")
    return "\n".join((abrir, encerrar, congelar))


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(CONGELAR)
    op.execute(MIOLOS)
    op.execute(PORTAS)
    op.execute(VARREDURA)
    op.execute(CRON_SQL)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(CRON_FORA)
    op.execute("DROP FUNCTION IF EXISTS public.fn_eventos_classe_varrer()")
    # As portas voltam ANTES de os miolos saírem: não fica instante em que o clique chama função
    # que já não existe.
    op.execute(anteriores())
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_classe_encerrar_agora(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_classe_abrir_agora(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_guilda_congelar_composicao(text, bigint)")
    op.execute(COLUNA_FORA)
    op.execute(RELOAD)
