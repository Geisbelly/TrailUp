"""Pareamento por proximidade de desempenho no duelo do evento (#154, fase 3: D3, D4 e D5)

Desenho: `docs/superpowers/specs/2026-11-05-batalhas-em-evento-design.md`, aprovado em 05/11. Vem
depois da `20261105_15` (duelo no evento).

## O que muda

- **Desempenho de um aluno na turma** (`fn_evento_desempenho`, D4), na escala do Elo:
  - critério `elo` (padrão): o rating de `ranqueada_elo` de quem já jogou alguma partida na turma;
  - quem nunca jogou, ou critério `acerto`: o acerto da matrícula (`classe_aluno."acertosPercentual"`)
    convertido linearmente para `[acerto_min, acerto_max]` (padrão 800 a 1200). Sem isso, todo estreante
    teria 1000 e o pareamento seria às cegas;
  - sem acerto nenhum: o rating inicial (`elo_inicial`, 1000).
- **Os `k` adversários mais próximos** (`fn_evento_adversarios_proximos`, D3): inscritos do evento,
  menos o próprio aluno, pela distância de desempenho; o desempate é pelo id, para a lista não mudar
  entre duas leituras iguais.
- **As `k` guildas mais próximas** (`fn_evento_guildas_proximas`, D5): força = **média** do desempenho
  dos membros ativos, não a soma, que premiaria guilda grande. Só entram guildas ativas da turma com até
  `dif_membros` membros de diferença.
- **`evento_sugerir_adversarios(evento, guilda)`**, para o app: devolve os nomes, na ordem, **sem os
  números de desempenho** de ninguém. Quem pede precisa estar inscrito, e para guilda, ser membro ativo dela.
- **`evento_duelo_criar` cobra a sugestão**: adversário ou guilda rival fora dos `k` mais próximos é
  recusado (`evento_duelo_fora_da_sugestao`). O Social continua com escolha livre.

## Configuração (`app_config`, privada)

| chave | padrão | o que é |
|---|---|---|
| `evento_pareamento_k` | 3 | quantos sugeridos |
| `evento_pareamento_criterio` | `elo` | `elo` (com recaída no acerto) ou `acerto` |
| `evento_pareamento_acerto_min` / `_max` | 800 / 1200 | a faixa do acerto convertido |
| `evento_pareamento_dif_membros` | 1 | diferença máxima de tamanho entre guildas |

Revision ID: 20261105_16
Revises: 20261105_15
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_16"
down_revision = "20261105_15"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('evento_pareamento_k', '3', 'Duelo no evento (#154): quantos adversarios ou guildas a sugestao oferece.', false),
  ('evento_pareamento_criterio', 'elo',
   'Duelo no evento (#154): elo (rating de quem ja jogou, acerto convertido para quem nao) ou acerto.', false),
  ('evento_pareamento_acerto_min', '800', 'Duelo no evento (#154): rating equivalente a 0% de acerto.', false),
  ('evento_pareamento_acerto_max', '1200', 'Duelo no evento (#154): rating equivalente a 100% de acerto.', false),
  ('evento_pareamento_dif_membros', '1', 'Duelo no evento (#154): diferenca maxima de membros entre guildas.', false)
ON CONFLICT (chave) DO NOTHING;
"""

FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.fn_evento_desempenho(p_classe_id bigint, p_aluno uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_criterio text := COALESCE(
    (SELECT lower(btrim(valor)) FROM public.app_config WHERE chave = 'evento_pareamento_criterio'), 'elo');
  v_min numeric := public.fn_app_config_int('evento_pareamento_acerto_min', 800);
  v_max numeric := public.fn_app_config_int('evento_pareamento_acerto_max', 1200);
  v_rating integer;
  v_acerto numeric;
BEGIN
  IF v_criterio = 'elo' THEN
    SELECT e.rating INTO v_rating
      FROM public.ranqueada_elo e
     WHERE e.classe_id = p_classe_id AND e.aluno_id = p_aluno AND e.partidas > 0;
    IF FOUND THEN
      RETURN v_rating;
    END IF;
  END IF;
  SELECT max(ca."acertosPercentual") INTO v_acerto
    FROM public.classe_aluno ca
   WHERE ca.classe_id = p_classe_id AND ca.aluno_id = p_aluno;
  IF v_acerto IS NULL THEN
    RETURN public.fn_app_config_int('elo_inicial', 1000);
  END IF;
  RETURN v_min + (v_max - v_min) * LEAST(GREATEST(v_acerto, 0), 100) / 100.0;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_desempenho(bigint, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_evento_adversarios_proximos(p_evento_id uuid, p_aluno uuid, p_k integer)
RETURNS TABLE (aluno_id uuid, distancia numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ev AS (SELECT e.classe_id FROM public.eventos_classe e WHERE e.id = p_evento_id),
  eu AS (SELECT public.fn_evento_desempenho(ev.classe_id, p_aluno) AS d FROM ev)
  SELECT i.aluno_id, abs(public.fn_evento_desempenho(ev.classe_id, i.aluno_id) - eu.d) AS distancia
    FROM public.evento_inscricoes i
    CROSS JOIN ev
    CROSS JOIN eu
   WHERE i.evento_id = p_evento_id AND i.aluno_id <> p_aluno
   ORDER BY 2, 1
   LIMIT GREATEST(p_k, 1);
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_adversarios_proximos(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_evento_guildas_proximas(p_evento_id uuid, p_guilda_id uuid, p_k integer)
RETURNS TABLE (guilda_id uuid, membros integer, distancia numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ev AS (SELECT e.classe_id FROM public.eventos_classe e WHERE e.id = p_evento_id),
  forca AS (
    SELECT g.id AS guilda_id, count(*)::integer AS membros,
           avg(public.fn_evento_desempenho(ev.classe_id, gm.aluno_id)) AS media
      FROM public.guildas g
      CROSS JOIN ev
      JOIN public.guilda_membros gm ON gm.guilda_id = g.id AND gm.left_at IS NULL AND gm.aluno_id IS NOT NULL
     WHERE g.classe_id = ev.classe_id AND g.ativa
     GROUP BY g.id
  ),
  minha AS (SELECT f.membros, f.media FROM forca f WHERE f.guilda_id = p_guilda_id)
  SELECT f.guilda_id, f.membros, abs(f.media - minha.media) AS distancia
    FROM forca f
    CROSS JOIN minha
   WHERE f.guilda_id <> p_guilda_id
     AND abs(f.membros - minha.membros) <= public.fn_app_config_int('evento_pareamento_dif_membros', 1)
   ORDER BY 3, 1
   LIMIT GREATEST(p_k, 1);
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_guildas_proximas(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.evento_sugerir_adversarios(p_evento_id uuid, p_guilda_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_k integer := public.fn_app_config_int('evento_pareamento_k', 3);
  v_guildas jsonb := NULL;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'arena_sem_sessao';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.eventos_classe e
     WHERE e.id = p_evento_id AND e.status = 'aberto' AND e.inicio <= now() AND e.fim > now()
  ) THEN
    RAISE EXCEPTION 'evento_duelo_evento_fechado' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evento_inscricoes i WHERE i.evento_id = p_evento_id AND i.aluno_id = v_me) THEN
    RAISE EXCEPTION 'evento_duelo_sem_inscricao' USING ERRCODE = '22023';
  END IF;
  IF p_guilda_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.guilda_membros gm
       WHERE gm.guilda_id = p_guilda_id AND gm.aluno_id = v_me AND gm.left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'arena_sem_permissao';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('guilda_id', g.id, 'nome', g.nome, 'membros', p.membros)
                              ORDER BY p.distancia, p.guilda_id), '[]'::jsonb)
      INTO v_guildas
      FROM public.fn_evento_guildas_proximas(p_evento_id, p_guilda_id, v_k) p
      JOIN public.guildas g ON g.id = p.guilda_id;
  END IF;

  RETURN jsonb_build_object(
    'k', v_k,
    'alunos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('aluno_id', p.aluno_id, 'nome', a.nome) ORDER BY p.distancia, p.aluno_id)
        FROM public.fn_evento_adversarios_proximos(p_evento_id, v_me, v_k) p
        JOIN public.alunos a ON a.id = p.aluno_id
    ), '[]'::jsonb),
    'guildas', v_guildas
  );
END
$function$;

REVOKE ALL ON FUNCTION public.evento_sugerir_adversarios(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_sugerir_adversarios(uuid, uuid) TO authenticated;
"""

CRIAR_ANTES = "  -- A criação é a do Social: convite, questões, limite diário e mensagens iguais.\n"
CRIAR_DEPOIS = """  -- Pareamento (20261105_16, #154 D3 e D5): adversário só entre os k mais próximos.
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_adversarios, '{}'::uuid[])) AS adv(id)
     WHERE adv.id NOT IN (
       SELECT s.aluno_id FROM public.fn_evento_adversarios_proximos(
         p_evento_id, v_me, public.fn_app_config_int('evento_pareamento_k', 3)) s)
  ) OR (
    p_guilda_rival IS NOT NULL AND (
      p_guilda_id IS NULL OR p_guilda_rival NOT IN (
        SELECT s.guilda_id FROM public.fn_evento_guildas_proximas(
          p_evento_id, p_guilda_id, public.fn_app_config_int('evento_pareamento_k', 3)) s))
  ) THEN
    RAISE EXCEPTION 'evento_duelo_fora_da_sugestao' USING ERRCODE = '22023',
      HINT = 'No evento, o adversario vem da sugestao (evento_sugerir_adversarios).';
  END IF;

  -- A criação é a do Social: convite, questões, limite diário e mensagens iguais.
"""


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_16", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def criar_anterior() -> str:
    """As funções da `20261105_15` (`fn_evento_duelo_cobrar` e `evento_duelo_criar`)."""
    return _load("20261105_15_duelo_no_evento.py").FUNCOES


def criar_novo() -> str:
    texto = criar_anterior()
    if texto.count(CRIAR_ANTES) != 1:
        raise RuntimeError("evento_duelo_criar mudou de forma; revise a 20261105_16")
    return texto.replace(CRIAR_ANTES, CRIAR_DEPOIS)


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(FUNCOES)
    op.execute(criar_novo())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(criar_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.evento_sugerir_adversarios(uuid, uuid);")
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_guildas_proximas(uuid, uuid, integer);")
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_adversarios_proximos(uuid, uuid, integer);")
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_desempenho(bigint, uuid);")
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN ('evento_pareamento_k', 'evento_pareamento_criterio',"
        " 'evento_pareamento_acerto_min', 'evento_pareamento_acerto_max', 'evento_pareamento_dif_membros');"
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
