"""A arena volta: desafio com adversário, valendo Elo

Decisão da Geisbelly (2026-10-20): "A arena volta, com o Elo valendo". A `20261021_18` deixou o Elo
pronto em `fn_desafio_encerrar`, mas ele só se move em partida com equipe 2, e quem cria equipe 2
é a arena, que estava sem chamador. Esta migration reativa a arena com o menor diff que fecha.

## O que já existia

- Tabelas: `guilda_desafios`, `desafio_participantes` (equipe 1/2; estado `convidado`/`aceito`/
  `recusado`), `guilda_desafio_questoes`, `guilda_desafio_respostas`. Todas em produção, RLS
  ligada, zero policies — só se chega por função `SECURITY DEFINER`.
- Já versionadas: `arena_desafio` (`_13`), `arena_encerrar` (`_09`, delega a `fn_desafio_encerrar`),
  `fn_arena_placar`/`fn_arena_equipes` (`20261018_04`), `arena_professor_resumo` (`20261017_05`).
- Só em produção (`docs/architecture/schema-nao-versionado.md`, grupo "arena completa"):
  `arena_desafio_criar`, `arena_listar`, `arena_convite_responder`, `arena_responder`. Nenhum
  cliente chamava nenhuma das quatro.

## O que esta migration faz

1. **Versiona** `arena_desafio_criar`, `arena_listar` e `arena_convite_responder` a partir do
   texto exato de produção (o teste confere o md5 de `prosrc`); o upgrade aplica esse texto com
   as mudanças das decisões abaixo, e o downgrade volta ao texto de produção.
2. **`arena_responder`**: o corpo de produção (md5 conferido) com uma guarda a mais — desafio
   **sem equipe 2** (cooperativo) é recusado com `arena_desafio_cooperativo`.
3. **`guilda_desafio_responder`**: o corpo da `20261021_14` com a guarda espelhada — desafio
   **com equipe 2** é recusado com `guilda_desafio_e_da_arena`.
4. **`arena_desafio`**: devolve `competitivo` (existe equipe 2), para a tela saber por qual das
   duas responder sem adivinhar, e `meu_elo` (decisão 10).

## As decisões da Geisbelly sobre a arena (2026-10-20, "segue suas recomendações nas 10")

- **Convite com janela própria** (decisão 3): desafio da arena (com equipe 2) fica aberto por
  `arena_convite_expira_min` (padrão 1440 = 24 h) antes de a varredura fechá-lo; o cooperativo
  segue com `desafio_encerra_apos_min` (30). A janela conta de `created_at`, como antes: é a
  partida inteira, não só o aceite.
- **Recusa fecha na hora** (decisão 4): `arena_convite_responder` com `p_aceitar = false` fecha
  o desafio por `fn_desafio_encerrar` quando a equipe 2 fica sem ninguém (`sem_adversario`, sem
  Elo) — ou quando, com a recusa, não sobra convite e todo aceito já respondeu tudo (fecha com o
  resultado normal, que antes esperava a varredura).
- **Limite diário contra o mesmo adversário** (decisão 5): `fn_arena_cobrar_limite_diario` (sem
  EXECUTE para cliente) recusa com `arena_limite_diario_adversario` (22023; DETAIL com os nomes,
  HINT com o limite) ao **criar** e ao **aceitar**. Conta partidas ranqueadas do dia (horário de
  Brasília) em que os dois estavam `aceito` em equipes opostas, fora `sem_adversario`. Padrão
  `arena_limite_diario_mesmo_adversario` = 3; 0 desliga.
- **Variação de Elo para o aluno** (decisão 10): `arena_listar` e `arena_desafio` devolvem
  `meu_elo` (`delta`, `rating_antes`, `rating_depois`) lido de `ranqueada_elo_partida`, só a
  linha de `auth.uid()`. A tabela continua sem grant para cliente; quem lê é a função DEFINER.

## Os dois "responder", lado a lado

Ficam os dois, cada um com o seu tipo de desafio, e o banco cobra a separação:

| | `guilda_desafio_responder` | `arena_responder` |
| --- | --- | --- |
| desafio | cooperativo (só equipe 1) | competitivo (equipe 2 existe) |
| tentativas | preset (`normal` 2, `dificil` 1), tempo acumula | 1: a primeira resposta vale |
| fecha quando | ninguém aceito pode mais responder (ignora `convidado`) | todo aceito respondeu tudo **e** ninguém está `convidado` |
| fechamento | `fn_desafio_encerrar` | `arena_encerrar` → `fn_desafio_encerrar` |

Sem a separação, os dois se atrapalham: um duelo respondido pelo `guilda_desafio_responder`
fecharia antes de o adversário aceitar (ele ignora `convidado`), virando `sem_adversario`, e daria
duas tentativas numa partida que vale Elo; um cooperativo respondido pelo `arena_responder` fecharia
antes de a equipe usar as tentativas. Unificar os dois fica como decisão em aberto no PR.

## O Elo

Nada de Elo muda aqui: `arena_responder` → `arena_encerrar` → `fn_desafio_encerrar` →
`fn_elo_aplicar` (`20261021_18`). `arena_desafio_criar` não escolhe `consequencia` nem
`dificuldade`, então o duelo nasce `ranqueada`/`normal` (padrão da tabela) e vale Elo.

## Downgrade

Volta `arena_desafio_criar`, `arena_listar`, `arena_convite_responder`, `arena_responder` e
`fn_desafio_varrer_abandonados` aos corpos de produção, `guilda_desafio_responder` ao da `_14` e
`arena_desafio` ao da `_13`; exclui só o que nasceu aqui (`fn_arena_cobrar_limite_diario` e as
duas chaves de `app_config`). Nenhuma função da arena é excluída: já existiam em produção.

Revision ID: 20261021_19
Revises: 20261021_18
Create Date: 2026-10-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_19"
down_revision = "20261021_18"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261021_19")
    return texto.replace(antigo, novo, 1)


# Copiadas de produção (pg_get_functiondef), sem mudança. Os grants são os de produção:
# EXECUTE para `authenticated`, nada para `anon`.
VERSIONADAS = r"""
CREATE OR REPLACE FUNCTION public.arena_desafio_criar(p_classe_id bigint, p_formato text DEFAULT 'solo'::text, p_modo text DEFAULT 'precisao'::text, p_quantidade integer DEFAULT 5, p_guilda_id uuid DEFAULT NULL::uuid, p_aliado uuid DEFAULT NULL::uuid, p_adversarios uuid[] DEFAULT NULL::uuid[], p_guilda_rival uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_formato text := lower(btrim(COALESCE(p_formato, '')));
  v_modo    text := lower(btrim(COALESCE(p_modo, '')));
  v_adv     uuid[] := COALESCE(p_adversarios, ARRAY[]::uuid[]);
  v_n_adv   integer;
  v_qtd     integer := GREATEST(1, LEAST(COALESCE(p_quantidade, 5), 10));
  v_convocados uuid[];
  v_alvo    uuid;
  v_id      uuid;
  v_q       record;
  v_i       integer := 0;
  v_rivais  integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'arena_sem_sessao';
  END IF;
  IF NOT public.guilda_e_colega(v_me, p_classe_id) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF v_formato NOT IN ('guilda', 'dupla', 'solo') THEN
    RAISE EXCEPTION 'arena_formato_invalido';
  END IF;
  IF v_modo NOT IN ('todos', 'velocidade', 'precisao') THEN
    RAISE EXCEPTION 'arena_modo_invalido';
  END IF;

  v_n_adv := COALESCE(array_length(v_adv, 1), 0);

  IF v_formato = 'guilda' THEN
    IF p_guilda_id IS NULL OR p_aliado IS NOT NULL OR v_n_adv > 0 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_id AND m.aluno_id = v_me
         AND m.left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'arena_sem_permissao';
    END IF;
    IF p_guilda_rival IS NOT NULL THEN
      IF p_guilda_rival = p_guilda_id THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.guildas g
         WHERE g.id = p_guilda_rival AND g.ativa
           AND g.classe_id = p_classe_id
      ) THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      SELECT count(*) INTO v_rivais
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL;
      IF v_rivais = 0 THEN
        RAISE EXCEPTION 'arena_rival_sem_membros';
      END IF;
    END IF;
    v_convocados := ARRAY[]::uuid[];
  ELSIF v_formato = 'dupla' THEN
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NULL OR v_n_adv <> 2 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := ARRAY[p_aliado] || v_adv;
  ELSE
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NOT NULL OR v_n_adv <> 1 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := v_adv;
  END IF;

  IF v_me = ANY(v_convocados) THEN
    RAISE EXCEPTION 'arena_participante_invalido';
  END IF;
  IF COALESCE(array_length(v_convocados, 1), 0)
     IS DISTINCT FROM (SELECT count(DISTINCT x)::integer FROM unnest(v_convocados) x) THEN
    RAISE EXCEPTION 'arena_participante_repetido';
  END IF;
  FOREACH v_alvo IN ARRAY v_convocados LOOP
    IF NOT public.guilda_e_colega(v_alvo, p_classe_id) THEN
      RAISE EXCEPTION 'arena_participante_fora_da_turma';
    END IF;
    IF public.guilda_bloqueio_ativo(v_me, v_alvo) THEN
      RAISE EXCEPTION 'arena_participante_bloqueado';
    END IF;
  END LOOP;

  INSERT INTO public.guilda_desafios
         (guilda_id, guilda_rival_id, classe_id, criado_por,
          modo, formato, titulo, configuracao)
  VALUES (CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
          CASE WHEN v_formato = 'guilda' THEN p_guilda_rival ELSE NULL END,
          p_classe_id, v_me, v_modo, v_formato,
          'Desafio em ' || v_formato,
          jsonb_build_object('quantidade', v_qtd))
  RETURNING id INTO v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, m.aluno_id, 1, 'aceito', now()
      FROM public.guilda_membros m
     WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL
       AND m.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      SELECT v_id, m.aluno_id, 2, 'convidado'
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, v_me, 1, 'aceito', now());
    IF v_formato = 'dupla' THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, p_aliado, 1, 'convidado');
    END IF;
    FOREACH v_alvo IN ARRAY v_adv LOOP
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, v_alvo, 2, 'convidado');
    END LOOP;
  END IF;

  FOR v_q IN
    SELECT q.id
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND NOT EXISTS (
         SELECT 1 FROM public.desafio_participantes dp
          WHERE dp.desafio_id = v_id
            AND NOT public.fn_questao_liberada_para(dp.aluno_id, q.id)
       )
     ORDER BY random()
     LIMIT v_qtd
  LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q.id, v_i);
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'arena_sem_questoes_liberadas';
  END IF;

  UPDATE public.guilda_desafios
     SET configuracao = jsonb_build_object('quantidade', v_i)
   WHERE id = v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.guilda_mensagens
           (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
    VALUES (p_guilda_id, p_classe_id, v_me, 'desafio',
            'Um novo desafio foi lancado!',
            jsonb_build_object('id', v_id, 'modo', v_modo,
                               'formato', v_formato, 'quantidade', v_i));
    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.guilda_mensagens
             (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
      VALUES (p_guilda_rival, p_classe_id, v_me, 'desafio',
              'Sua guilda foi desafiada!',
              jsonb_build_object('id', v_id, 'modo', v_modo,
                                 'formato', v_formato, 'quantidade', v_i));
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'formato', v_formato,
                            'modo', v_modo, 'quantidade', v_i,
                            'rivais_convidados', v_rivais);
END
$function$;
REVOKE ALL ON FUNCTION public.arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[], uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[], uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.arena_listar(p_classe_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT d.created_at,
           jsonb_build_object(
             'id', d.id,
             'classe_id', d.classe_id,
             'formato', d.formato,
             'modo', d.modo,
             'status', d.status,
             'resultado', d.resultado,
             'titulo', d.titulo,
             'guilda_id', d.guilda_id,
             'guilda_nome', g.nome,
             'guilda_rival_id', d.guilda_rival_id,
             'guilda_rival_nome', gr.nome,
             'criado_por', d.criado_por,
             'sou_criador', d.criado_por = auth.uid(),
             'created_at', d.created_at,
             'encerrado_em', d.encerrado_em,
             'vencedor_equipe', d.vencedor_equipe,
             'questoes', (SELECT count(*) FROM public.guilda_desafio_questoes q
                           WHERE q.desafio_id = d.id),
             'meu_estado', me.estado,
             'minha_equipe', me.equipe,
             'minhas_respostas', (SELECT count(*)
                                    FROM public.guilda_desafio_respostas r
                                   WHERE r.desafio_id = d.id
                                     AND r.aluno_id = auth.uid()),
             'participantes', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'aluno_id', pl.aluno_id, 'nome', a.nome,
                        'apelido', a.apelido, 'foto_url', a.foto_url,
                        'perfil_ativo', a.perfil_ativo,
                        'equipe', pl.equipe, 'estado', pl.estado,
                        'acertos', pl.acertos,
                        'respondidas', pl.respondidas,
                        'tempo_ms', pl.tempo_total_ms
                      ) ORDER BY pl.equipe, a.nome)
                 FROM public.fn_arena_placar(d.id) pl
                 JOIN public.alunos a ON a.id = pl.aluno_id
             ), '[]'::jsonb),
             'equipes', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'equipe', e.equipe, 'pontos', e.pontos,
                        'tempo_ms', e.tempo_ms, 'integrantes', e.integrantes
                      ) ORDER BY e.equipe)
                 FROM public.fn_arena_equipes(d.id) e
             ), '[]'::jsonb)
           ) AS item
      FROM public.guilda_desafios d
      JOIN public.desafio_participantes me
        ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
      LEFT JOIN public.guildas g  ON g.id  = d.guilda_id
      LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
     WHERE d.classe_id = p_classe_id
       AND public.guilda_e_colega(auth.uid(), p_classe_id)
     ORDER BY d.created_at DESC
     LIMIT 40
  ) s;
$function$;
REVOKE ALL ON FUNCTION public.arena_listar(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_listar(bigint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.arena_convite_responder(p_desafio_id uuid, p_aceitar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_estado text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;
BEGIN
  UPDATE public.desafio_participantes p
     SET estado = v_estado, respondido_em = now()
    FROM public.guilda_desafios d
   WHERE d.id = p.desafio_id
     AND p.desafio_id = p_desafio_id
     AND p.aluno_id = auth.uid()
     AND p.estado = 'convidado'
     AND d.status = 'aberto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_convite_indisponivel';
  END IF;
  RETURN jsonb_build_object('estado', v_estado);
END
$function$;
REVOKE ALL ON FUNCTION public.arena_convite_responder(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_convite_responder(uuid, boolean)
  TO authenticated;
"""


# `arena_responder` como está em produção. O downgrade volta para este texto.
RESPONDER_ARENA_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.arena_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_q       public.questoes%ROWTYPE;
  v_correta boolean;
  v_tempo   integer;
  v_gravou  boolean := false;
  v_faltam  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.desafio_participantes p
      JOIN public.guilda_desafios d ON d.id = p.desafio_id
     WHERE p.desafio_id = p_desafio_id AND p.aluno_id = v_me
       AND p.estado = 'aceito' AND d.status = 'aberto'
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guilda_desafio_questoes
     WHERE desafio_id = p_desafio_id AND questao_id = p_questao_id
  ) THEN
    RAISE EXCEPTION 'arena_questao_fora_do_desafio';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta, '')));

  v_tempo := LEAST(GREATEST(COALESCE(p_tempo_ms, 0), 0), 600000);

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms)
  VALUES (p_desafio_id, p_questao_id, v_me,
          COALESCE(p_resposta, ''), v_correta, v_tempo)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_faltam = ROW_COUNT;
  v_gravou := v_faltam > 0;

  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes p
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM public.guilda_desafio_respostas r
       WHERE r.desafio_id = p.desafio_id AND r.aluno_id = p.aluno_id
    ) resp
   WHERE p.desafio_id = p_desafio_id
     AND p.estado = 'aceito'
     AND resp.n < (SELECT count(*) FROM public.guilda_desafio_questoes q
                    WHERE q.desafio_id = p_desafio_id);

  IF v_faltam = 0 AND NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.estado = 'convidado'
  ) THEN
    PERFORM public.arena_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object('correta', v_correta, 'registrada', v_gravou);
END
$function$;
REVOKE ALL ON FUNCTION public.arena_responder(uuid, bigint, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_responder(uuid, bigint, text, integer)
  TO authenticated;
"""

_ARENA_ANTES_DA_GUARDA = """    RAISE EXCEPTION 'arena_questao_fora_do_desafio';
  END IF;
"""

_ARENA_GUARDA = """    RAISE EXCEPTION 'arena_questao_fora_do_desafio';
  END IF;
  -- 20261021_19: desafio sem equipe 2 e cooperativo, e cooperativo se responde por
  -- `guilda_desafio_responder` (tentativas do preset, fecha sem esperar convidado).
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.equipe = 2
  ) THEN
    RAISE EXCEPTION 'arena_desafio_cooperativo' USING ERRCODE = '22023';
  END IF;
"""


def responder_arena() -> str:
    return _troca(RESPONDER_ARENA_PRODUCAO, _ARENA_ANTES_DA_GUARDA, _ARENA_GUARDA, "arena_responder")


_GUILDA_ANTES_DA_GUARDA = """    RAISE EXCEPTION 'guilda_desafio_sem_permissao';
  END IF;
"""

_GUILDA_GUARDA = """    RAISE EXCEPTION 'guilda_desafio_sem_permissao';
  END IF;

  -- 20261021_19: desafio com equipe 2 e da arena, e se responde por `arena_responder` (uma
  -- tentativa, espera o convidado). Respondido aqui, fecharia antes de o adversario aceitar.
  IF EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) THEN
    RAISE EXCEPTION 'guilda_desafio_e_da_arena' USING ERRCODE = '22023';
  END IF;
"""


def responder_guilda_anterior() -> str:
    """O `guilda_desafio_responder` como a `_14` deixa (a `_14` recorta a `_12`, que recorta a `_09`)."""
    m = _load("20261021_14_fechar_so_quando_ninguem_mais_pode.py")
    return m._responder(m.FALTAM_QUEM_AINDA_PODE)


def responder_guilda() -> str:
    return _troca(responder_guilda_anterior(), _GUILDA_ANTES_DA_GUARDA, _GUILDA_GUARDA, "guilda_desafio_responder")


def arena_desafio_anterior() -> str:
    return _load("20261021_13_arena_desafio_devolve_os_eixos.py")._arena_desafio(com_eixos=True)


def arena_desafio_com_competitivo() -> str:
    return _troca(
        arena_desafio_anterior(),
        "    'minha_equipe', me.equipe,\n",
        "    'minha_equipe', me.equipe,\n"
        "    -- 20261021_19: com equipe 2 responde-se por `arena_responder`; sem, por\n"
        "    -- `guilda_desafio_responder`. A tela le daqui, nao adivinha.\n"
        "    'competitivo', EXISTS (SELECT 1 FROM public.desafio_participantes c\n"
        "                            WHERE c.desafio_id = d.id AND c.equipe = 2),\n" + _meu_elo("    "),
        "arena_desafio",
    )


def _da_producao(nome: str) -> str:
    """Um bloco de VERSIONADAS: o CREATE da função e os grants dela."""
    inicio = VERSIONADAS.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    fim = VERSIONADAS.index(
        "  TO authenticated;\n", VERSIONADAS.index(f"GRANT EXECUTE ON FUNCTION public.{nome}(", inicio)
    )
    return VERSIONADAS[inicio : fim + len("  TO authenticated;\n")]


# ── Decisões 3 e 5: as duas chaves ───────────────────────────────────────────────────────────

CONFIG = r"""
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('arena_convite_expira_min', '1440',
   'Minutos que um desafio da arena (com adversário) fica aberto antes de a varredura fechá-lo.', false),
  ('arena_limite_diario_mesmo_adversario', '3',
   'Partidas ranqueadas por dia (horário de Brasília) entre os mesmos dois alunos; 0 desliga.', false)
ON CONFLICT (chave) DO NOTHING;
"""

CONFIG_FORA = r"""
DELETE FROM public.app_config
 WHERE chave IN ('arena_convite_expira_min', 'arena_limite_diario_mesmo_adversario');
"""


# ── Decisão 5: o limite diário ───────────────────────────────────────────────────────────────

LIMITE = r"""
-- Recusa quando algum par de lados opostos deste desafio (ou, com p_aluno, os pares de p_aluno)
-- já fez o limite de partidas ranqueadas hoje. "Partida" é outro desafio ranqueado criado hoje
-- (horário de Brasília) em que os dois estavam `aceito` em equipes opostas e que não fechou como
-- `sem_adversario`. Convite pendente não conta: quem trava é o aceite da partida N+1.
CREATE OR REPLACE FUNCTION public.fn_arena_cobrar_limite_diario(p_desafio_id uuid, p_aluno uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limite integer := public.fn_app_config_int('arena_limite_diario_mesmo_adversario', 3);
  v_inicio timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                          AT TIME ZONE 'America/Sao_Paulo';
  v_par    record;
BEGIN
  IF v_limite <= 0 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guilda_desafios
                  WHERE id = p_desafio_id AND consequencia = 'ranqueada') THEN
    RETURN;
  END IF;

  SELECT x.aluno_id AS a, y.aluno_id AS b, n.partidas
    INTO v_par
    FROM public.desafio_participantes x
    JOIN public.desafio_participantes y
      ON y.desafio_id = x.desafio_id AND y.equipe <> x.equipe AND y.estado <> 'recusado'
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS partidas
        FROM public.guilda_desafios d
        JOIN public.desafio_participantes px
          ON px.desafio_id = d.id AND px.aluno_id = x.aluno_id AND px.estado = 'aceito'
        JOIN public.desafio_participantes py
          ON py.desafio_id = d.id AND py.aluno_id = y.aluno_id AND py.estado = 'aceito'
         AND py.equipe <> px.equipe
       WHERE d.id <> p_desafio_id
         AND d.consequencia = 'ranqueada'
         AND d.created_at >= v_inicio
         AND d.resultado IS DISTINCT FROM 'sem_adversario'
    ) n
   WHERE x.desafio_id = p_desafio_id
     AND x.estado <> 'recusado'
     AND (CASE WHEN p_aluno IS NULL THEN x.equipe = 1 ELSE x.aluno_id = p_aluno END)
     AND n.partidas >= v_limite
   ORDER BY n.partidas DESC
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'arena_limite_diario_adversario' USING
      ERRCODE = '22023',
      DETAIL = format('%s e %s já fizeram %s partidas ranqueadas hoje um contra o outro.',
                      (SELECT COALESCE(apelido, nome) FROM public.alunos WHERE id = v_par.a),
                      (SELECT COALESCE(apelido, nome) FROM public.alunos WHERE id = v_par.b),
                      v_par.partidas),
      HINT = v_limite::text;
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_arena_cobrar_limite_diario(uuid, uuid) FROM PUBLIC, anon, authenticated;
"""

LIMITE_FORA = "DROP FUNCTION IF EXISTS public.fn_arena_cobrar_limite_diario(uuid, uuid);\n"


def criar_com_limite() -> str:
    """`arena_desafio_criar` cobra o limite depois de montar as equipes, antes de sortear questões."""
    return _troca(
        _da_producao("arena_desafio_criar"),
        "  FOR v_q IN\n",
        "  -- 20261021_19 (decisão 5): limite diário contra o mesmo adversário. A exceção desfaz o\n"
        "  -- desafio inteiro.\n"
        "  PERFORM public.fn_arena_cobrar_limite_diario(v_id);\n"
        "\n"
        "  FOR v_q IN\n",
        "arena_desafio_criar",
    )


# ── Decisões 4 e 5: recusa fecha na hora; aceite cobra o limite ──────────────────────────────

_CONVITE_RETORNO = "  RETURN jsonb_build_object('estado', v_estado);\n"

_CONVITE_NOVO_RETORNO = """  IF p_aceitar THEN
    -- 20261021_19 (decisão 5): aceitar é o que torna a partida real; é aqui que o limite trava.
    PERFORM public.fn_arena_cobrar_limite_diario(p_desafio_id, auth.uid());
    RETURN jsonb_build_object('estado', v_estado);
  END IF;

  -- 20261021_19 (decisão 4): recusa fecha na hora, sem esperar a varredura, quando
  --   - a equipe 2 ficou sem ninguem (todos recusaram): `sem_adversario`, sem Elo; ou
  --   - nao sobrou convite e todo aceito ja respondeu tudo: o resultado normal.
  IF NOT EXISTS (
       SELECT 1 FROM public.desafio_participantes p
        WHERE p.desafio_id = p_desafio_id AND p.equipe = 2 AND p.estado <> 'recusado'
     )
     OR (
       NOT EXISTS (SELECT 1 FROM public.desafio_participantes p
                    WHERE p.desafio_id = p_desafio_id AND p.estado = 'convidado')
       AND NOT EXISTS (
         SELECT 1 FROM public.desafio_participantes p
          WHERE p.desafio_id = p_desafio_id AND p.estado = 'aceito'
            AND (SELECT count(*) FROM public.guilda_desafio_respostas r
                  WHERE r.desafio_id = p_desafio_id AND r.aluno_id = p.aluno_id)
              < (SELECT count(*) FROM public.guilda_desafio_questoes q
                  WHERE q.desafio_id = p_desafio_id)
       )
     ) THEN
    v_fim := public.fn_desafio_encerrar(p_desafio_id);
  END IF;
  RETURN jsonb_build_object('estado', v_estado, 'encerrou', v_fim IS NOT NULL,
                            'resultado', v_fim->>'resultado');
"""


def convite_com_recusa_e_limite() -> str:
    sql = _troca(
        _da_producao("arena_convite_responder"),
        "DECLARE v_estado text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;\n",
        "DECLARE v_estado text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;\n  v_fim jsonb;\n",
        "arena_convite_responder",
    )
    return _troca(sql, _CONVITE_RETORNO, _CONVITE_NOVO_RETORNO, "arena_convite_responder")


# ── Decisão 10: a variação de Elo do próprio aluno ───────────────────────────────────────────


def _meu_elo(recuo: str) -> str:
    return (
        f"{recuo}-- 20261021_19 (decisão 10): a variação de Elo de quem pergunta, e só a dele.\n"
        f"{recuo}'meu_elo', (SELECT jsonb_build_object('delta', ep.delta,\n"
        f"{recuo}                                      'rating_antes', ep.rating_antes,\n"
        f"{recuo}                                      'rating_depois', ep.rating_depois)\n"
        f"{recuo}              FROM public.ranqueada_elo_partida ep\n"
        f"{recuo}             WHERE ep.desafio_id = d.id AND ep.aluno_id = auth.uid()),\n"
    )


def listar_com_elo() -> str:
    ancora = "             'participantes', COALESCE((\n"
    return _troca(_da_producao("arena_listar"), ancora, _meu_elo("             ") + ancora, "arena_listar")


# ── Decisão 3: a janela da arena na varredura ────────────────────────────────────────────────

VARREDURA_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_desafio_varrer_abandonados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_min  integer := public.fn_app_config_int('desafio_encerra_apos_min', 30);
  v_id   uuid;
  v_n    integer := 0;
BEGIN
  FOR v_id IN
    SELECT d.id FROM public.guilda_desafios d
     WHERE d.status <> 'encerrado'
       AND d.created_at < now() - make_interval(mins => GREATEST(v_min, 1))
     ORDER BY d.created_at
     -- Teto por passada: a varredura roda a cada 5 min e nao deve virar uma transacao
     -- gigante na primeira vez que ligar numa base com desafio velho acumulado.
     LIMIT 200
  LOOP
    BEGIN
      PERFORM public.fn_desafio_encerrar(v_id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Um desafio problematico nao pode parar a varredura dos outros: o proximo ciclo
      -- tenta de novo, e o aviso fica no log.
      RAISE WARNING 'fn_desafio_varrer_abandonados: desafio % falhou: %', v_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_n;
END
$function$;
"""


def varredura_com_janela() -> str:
    sql = _troca(
        VARREDURA_PRODUCAO,
        "  v_min  integer := public.fn_app_config_int('desafio_encerra_apos_min', 30);\n",
        "  v_min  integer := public.fn_app_config_int('desafio_encerra_apos_min', 30);\n"
        "  -- 20261021_19 (decisão 3): desafio da arena (com equipe 2) tem janela propria.\n"
        "  v_min_arena integer := public.fn_app_config_int('arena_convite_expira_min', 1440);\n",
        "fn_desafio_varrer_abandonados",
    )
    return _troca(
        sql,
        "       AND d.created_at < now() - make_interval(mins => GREATEST(v_min, 1))\n",
        "       AND d.created_at < now() - make_interval(mins => GREATEST(\n"
        "             CASE WHEN EXISTS (SELECT 1 FROM public.desafio_participantes p\n"
        "                                WHERE p.desafio_id = d.id AND p.equipe = 2)\n"
        "                  THEN v_min_arena ELSE v_min END, 1))\n",
        "fn_desafio_varrer_abandonados",
    )


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(LIMITE)
    op.execute(criar_com_limite())
    op.execute(listar_com_elo())
    op.execute(convite_com_recusa_e_limite())
    op.execute(responder_arena())
    op.execute(responder_guilda())
    op.execute(arena_desafio_com_competitivo())
    op.execute(varredura_com_janela())
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(VARREDURA_PRODUCAO)
    op.execute(arena_desafio_anterior())
    op.execute(responder_guilda_anterior())
    op.execute(RESPONDER_ARENA_PRODUCAO)
    op.execute(VERSIONADAS)
    op.execute(LIMITE_FORA)
    op.execute(CONFIG_FORA)
    op.execute(RELOAD)
