"""Duelo dentro do evento, só entre inscritos (#154, fase 2: D1 e D2)

Desenho: `docs/superpowers/specs/2026-11-05-batalhas-em-evento-design.md`, aprovado em 05/11.

## O que muda

- **`guilda_desafios.evento_id`**, nulo fora de evento. Um CHECK amarra: duelo com evento é
  `consequencia = 'evento'`. Essa consequência já fazia o que D1 e D2 pedem, sem mexer no
  fechamento (`fn_desafio_encerrar`):
  - **não move o Elo**: `fn_elo_aplicar` só roda em `ranqueada` (`20261021_18`);
  - **quem perde não perde ponto**: a aposta (`desafio_derrota`, −6) só sai em `ranqueada`
    (`20261021_06`); no evento, todo mundo que jogou recebe `desafio_participou` e o vencedor,
    `desafio_vencido`;
  - continua `fora_do_xp` (é duelo: existe equipe 2, `20261103_15`).
- **`evento_duelo_criar(evento, …)`**, com os mesmos argumentos de `arena_desafio_criar` (menos a
  turma, que vem do evento). Exige o evento aberto e dentro da janela, quem cria inscrito, um
  adversário de verdade e **todo participante convocado inscrito**. Cria pela própria
  `arena_desafio_criar` (convite, questões, limite diário e mensagens iguais) e só depois liga o
  evento. Qualquer recusa desfaz a criação inteira.
- **`arena_convite_responder`**: aceitar um duelo de evento exige o evento ainda aberto e o aluno
  ainda inscrito (`fn_evento_duelo_cobrar`). Recusar continua sempre possível.
- **Rank do evento, critério `ranqueada`**: passa a contar também os duelos **daquele** evento.
  Antes contava só `consequencia = 'ranqueada'`, e o duelo do evento ficaria de fora do próprio
  rank. O duelo `ranqueada` do Social, feito por um inscrito dentro da janela, continua contando
  como antes (#920): mudar isso tiraria pontos de ranks de evento já abertos.

## O que não muda

- `fn_evento_classe_apurar`: o duelo é `fora_do_xp`, então não entra na pontuação, no destaque nem
  nas medalhas do evento. Nenhuma recompensa é exclusiva de quem batalha (#154).
- O Social: `arena_desafio_criar` sem evento segue igual, com escolha livre do adversário. O
  pareamento por proximidade é a fase 3.

As funções existentes são remendadas por troca de texto a partir da migration que as deixou, e a
troca falha alto se o trecho mudou.

Revision ID: 20261105_15
Revises: 20261105_14
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_15"
down_revision = "20261105_14"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

COLUNA = """
ALTER TABLE public.guilda_desafios
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.eventos_classe(id) ON DELETE SET NULL;
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_evento_consequencia_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_evento_consequencia_check
  CHECK (evento_id IS NULL OR consequencia = 'evento');
CREATE INDEX IF NOT EXISTS guilda_desafios_evento_idx
  ON public.guilda_desafios (evento_id) WHERE evento_id IS NOT NULL;
COMMENT ON COLUMN public.guilda_desafios.evento_id IS
  'Duelo dentro de um evento (#154): so entre inscritos, consequencia evento (sem Elo e sem aposta). '
  'Nulo no Social. Escrito so por evento_duelo_criar.';
"""

FUNCOES = r"""
-- Duelo de evento: o evento ainda aberto e o aluno ainda inscrito. Sem efeito fora de evento.
CREATE OR REPLACE FUNCTION public.fn_evento_duelo_cobrar(p_desafio_id uuid, p_aluno uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_evento uuid;
BEGIN
  SELECT d.evento_id INTO v_evento FROM public.guilda_desafios d WHERE d.id = p_desafio_id;
  IF v_evento IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.eventos_classe e
     WHERE e.id = v_evento AND e.status = 'aberto' AND e.inicio <= now() AND e.fim > now()
  ) THEN
    RAISE EXCEPTION 'evento_duelo_evento_fechado' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evento_inscricoes i WHERE i.evento_id = v_evento AND i.aluno_id = p_aluno
  ) THEN
    RAISE EXCEPTION 'evento_duelo_sem_inscricao' USING ERRCODE = '22023';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_duelo_cobrar(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.evento_duelo_criar(
  p_evento_id uuid,
  p_formato text DEFAULT 'solo'::text,
  p_modo text DEFAULT 'precisao'::text,
  p_quantidade integer DEFAULT 5,
  p_guilda_id uuid DEFAULT NULL::uuid,
  p_aliado uuid DEFAULT NULL::uuid,
  p_adversarios uuid[] DEFAULT NULL::uuid[],
  p_guilda_rival uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_classe bigint;
  v_r jsonb;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'arena_sem_sessao';
  END IF;
  SELECT e.classe_id INTO v_classe
    FROM public.eventos_classe e
   WHERE e.id = p_evento_id AND e.status = 'aberto' AND e.inicio <= now() AND e.fim > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_duelo_evento_fechado' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evento_inscricoes i WHERE i.evento_id = p_evento_id AND i.aluno_id = v_me
  ) THEN
    RAISE EXCEPTION 'evento_duelo_sem_inscricao' USING ERRCODE = '22023';
  END IF;

  -- A criação é a do Social: convite, questões, limite diário e mensagens iguais.
  v_r := public.arena_desafio_criar(v_classe, p_formato, p_modo, p_quantidade, p_guilda_id,
                                    p_aliado, p_adversarios, p_guilda_rival);
  v_id := (v_r ->> 'id')::uuid;

  IF NOT EXISTS (SELECT 1 FROM public.desafio_participantes p WHERE p.desafio_id = v_id AND p.equipe = 2) THEN
    RAISE EXCEPTION 'evento_duelo_sem_adversario' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = v_id
       AND NOT EXISTS (SELECT 1 FROM public.evento_inscricoes i
                        WHERE i.evento_id = p_evento_id AND i.aluno_id = p.aluno_id)
  ) THEN
    RAISE EXCEPTION 'evento_duelo_participante_sem_inscricao' USING ERRCODE = '22023',
      HINT = 'Todos os convocados para o duelo precisam estar inscritos no evento.';
  END IF;

  UPDATE public.guilda_desafios
     SET evento_id = p_evento_id, consequencia = 'evento'
   WHERE id = v_id;

  RETURN v_r || jsonb_build_object('evento_id', p_evento_id, 'consequencia', 'evento');
END
$function$;

REVOKE ALL ON FUNCTION public.evento_duelo_criar(uuid, text, text, integer, uuid, uuid, uuid[], uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_duelo_criar(uuid, text, text, integer, uuid, uuid, uuid[], uuid)
  TO authenticated;
"""

CONVITE_ANTES = "  IF p_aceitar THEN\n    -- 20261021_19 (decis"
CONVITE_DEPOIS = (
    "  IF p_aceitar THEN\n"
    "    -- 20261105_15 (#154): duelo de evento so com o evento aberto e quem aceita inscrito.\n"
    "    PERFORM public.fn_evento_duelo_cobrar(p_desafio_id, auth.uid());\n"
    "    -- 20261021_19 (decis"
)

VIEW_ANTES = "          WHERE d.consequencia = 'ranqueada'::text\n"
VIEW_DEPOIS = (
    "          -- No rank do evento, tambem os duelos daquele evento (20261105_15, #154).\n"
    "          WHERE (d.consequencia = 'ranqueada'::text OR (rj.evento_id IS NOT NULL AND d.evento_id = rj.evento_id))\n"
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_15", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"{onde} mudou de forma; revise a 20261105_15")
    return texto.replace(antigo, novo)


def convite_anterior() -> str:
    return _load("20261021_19_arena_volta.py").convite_com_recusa_e_limite()


def convite_novo() -> str:
    return _troca(convite_anterior(), CONVITE_ANTES, CONVITE_DEPOIS, "arena_convite_responder")


def view_anterior() -> str:
    return _load("20261104_07_rank_do_evento_por_tempo.py").view_nova()


def view_nova() -> str:
    return _troca(view_anterior(), VIEW_ANTES, VIEW_DEPOIS, "vw_rank_posicoes_por_classe_todas")


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(FUNCOES)
    op.execute(convite_novo())
    op.execute(view_nova())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(view_anterior())
    op.execute(convite_anterior())
    op.execute(
        "DROP FUNCTION IF EXISTS public.evento_duelo_criar(uuid, text, text, integer, uuid, uuid, uuid[], uuid);"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_duelo_cobrar(uuid, uuid);")
    op.execute("ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_evento_consequencia_check;")
    op.execute("DROP INDEX IF EXISTS public.guilda_desafios_evento_idx;")
    op.execute("ALTER TABLE public.guilda_desafios DROP COLUMN IF EXISTS evento_id;")
    op.execute("NOTIFY pgrst, 'reload schema'")
