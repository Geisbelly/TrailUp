"""Molduras: desafios difíceis de verdade, medidos pelo banco

## O pedido

A dona do projeto (05/11) pediu que as tarefas padrão das molduras fossem bem mais difíceis e, ao ver
a primeira proposta, recusou só aumentar a quantidade: **as missões têm de ser diferentes**. Aprovou a
lista abaixo. Ativar as notificações e reportar um erro **ficam como estão**.

## O que muda

- **Métrica nova `desafio_moldura`.** O critério é `{"metrica": "desafio_moldura", "desafio": <código>,
  "minimo": <n>}`. `fn_desafio_moldura_valor(aluno, desafio)` devolve quanto o aluno já fez e o
  avaliador compara com `minimo`. Os códigos são uma lista fechada, conferida pelo CHECK de
  `conquistas` (`fn_conquista_criterio_erro`): código errado não chega a ser gravado, em vez de virar
  uma conquista que nunca sai.
- **As dez conquistas de moldura trocam de missão**, com o mesmo `tipo`.
- **Oito ações viram conquistas novas.** A ação é declarada pelo app, então não dá para torná-la
  difícil. `molduras_acoes` mantém as oito linhas, desligadas e sem moldura: `moldura_registrar_acao`
  segue gravando a métrica e não entrega nada. Os builds instalados não precisam mudar.
- `molduras_catalogo` passa a dizer o que fazer. O nome sozinho ("Azarão") não explica a missão.

`fn_avaliar_metrica`, `fn_conquista_criterio_erro` e `molduras_catalogo` são alteradas por substituição
do trecho, como na `20261103_05`, porque copiar o corpo inteiro congelaria o que outras migrações já
mudaram. Âncora ausente ou repetida aborta a migração em vez de instalar pela metade.

## O que não muda

- Ninguém perde moldura nem conquista já ganha. Medido em produção em 05/11: nenhuma posse, nenhuma
  ação registrada e nenhuma conquista de moldura concluída.
- `pontos_recompensa` continua 0: o prêmio é a moldura, e pontos mexeriam no ranking.

## Decisões que não são óbvias

- **Série e repetição contam atividades diferentes.** Refazer a mesma atividade até dar 100% não pode
  encher "Série perfeita" nem "Contra o relógio". Uma nota abaixo de 100 quebra a série.
- **O dia é o de São Paulo**, com `criado_em` em UTC convertido primeiro, como em `eventos_no_dia`.
- **"Concluir algo" é evento de conclusão**, não um evento qualquer: é o que diferencia "Mês de verdade"
  de `dias_seguidos`, em que abrir um tópico mantém a sequência.
- **"Imersão" lê a telemetria** (`active_sec`, escopo `topic`, somando as linhas: cada lote traz só o
  próprio intervalo). `estudo_sessoes` e `tempo_uso_seg` contam o app aberto, não o estudo.
- **"Turma zerada" e "Sem atalhos" exigem turma com ao menos 5 tópicos**, senão uma turma de um tópico
  bastaria. "Turma zerada" também exige ao menos uma atividade, com a não feita contando como zero.
- **O avaliador só roda quando entra um evento que não é crédito.** Medalha de pódio, resultado de
  evento de turma e prêmio de missão aparecem no próximo evento do aluno, não no mesmo instante.

## Limites conhecidos

- As missões de precisão leem `atividade_tentativas`, vazia em produção em 05/11: só contam com um build
  que grave a tentativa no servidor. O percentual ainda é calculado no aparelho (`20261101_13`), e a
  policy de `eventos_aluno` aceita evento do cliente, então quem chamar o banco fora do app consegue
  forjar parte disso. Continua o princípio da `20261103_09`: é cosmético.
- Vencer boss não entrou: o banco guarda as falas, não o resultado da batalha.

Revision ID: 20261105_24
Revises: 20261105_23
Create Date: 2026-11-05
"""

from __future__ import annotations

import json

from alembic import op

revision = "20261105_24"
down_revision = "20261105_23"
branch_labels = None
depends_on = None

# (codigo, nome da moldura, missão, o que fazer, categoria, desafio, mínimo, ícone, cor)
Missao = tuple[str, str, str, str, str, str, int, str, str]

ENDURECIDAS: list[Missao] = [
    (
        "coral_vivo",
        "Coral Vivo",
        "De primeira",
        "Tire 100% na primeira tentativa em 10 atividades diferentes.",
        "Precisão",
        "de_primeira",
        10,
        "raio",
        "#f4623a",
    ),
    (
        "sol_dourado",
        "Sol Dourado",
        "Série perfeita",
        "Tire 100% em 20 atividades seguidas, sem nenhuma nota menor no meio.",
        "Precisão",
        "serie_perfeita",
        20,
        "alvo",
        "#e0b34d",
    ),
    (
        "fogo_e_ouro",
        "Fogo e Ouro",
        "Contra o relógio",
        "Tire 100% dentro do tempo em 15 atividades cronometradas.",
        "Precisão",
        "contra_o_relogio",
        15,
        "trofeu",
        "#c9a227",
    ),
    (
        "trepadeira",
        "Trepadeira",
        "Volta por cima",
        "Tire menos de 50% e depois 100% na mesma atividade, em 10 atividades.",
        "Precisão",
        "volta_por_cima",
        10,
        "livro",
        "#5fd99a",
    ),
    (
        "mare",
        "Maré",
        "Turma zerada",
        "Conclua 100% de uma turma com pelo menos 5 tópicos, com média de 90% ou mais nas atividades.",
        "Trilha",
        "turma_zerada",
        1,
        "livro",
        "#17a398",
    ),
    (
        "geada",
        "Geada",
        "Mês de verdade",
        "Conclua um conteúdo ou atividade por dia, 30 dias seguidos.",
        "Constância",
        "mes_de_verdade",
        30,
        "chama",
        "#6fb3e0",
    ),
    (
        "labareda",
        "Labareda",
        "Dia completo",
        "Cumpra as 3 missões diárias, 14 dias seguidos.",
        "Constância",
        "dia_completo",
        14,
        "chama",
        "#e2574c",
    ),
    (
        "diamante",
        "Diamante",
        "Sem folga",
        "Conclua algo no sábado e no domingo, 8 fins de semana seguidos.",
        "Constância",
        "sem_folga",
        8,
        "medalha",
        "#4fd1c5",
    ),
    (
        "aurora",
        "Aurora",
        "Madrugador",
        "Conclua algo antes das 8h em 20 dias diferentes.",
        "Rotina",
        "madrugador",
        20,
        "estrela",
        "#9b5de5",
    ),
    (
        "meia_noite",
        "Meia-Noite",
        "Coruja",
        "Conclua algo depois das 22h em 20 dias diferentes.",
        "Rotina",
        "coruja",
        20,
        "estrela",
        "#5b3fd9",
    ),
]

# As dez como a `20261103_09` as gravou, para o downgrade: (codigo, conquista, descrição, categoria, critério).
ANTERIORES: list[tuple[str, str, str, str, dict]] = [
    (
        "geada",
        "Uma semana sem parar",
        "Estudou 7 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 7},
    ),
    (
        "labareda",
        "Duas semanas acesas",
        "Estudou 14 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 14},
    ),
    (
        "diamante",
        "Um mês de constância",
        "Estudou 30 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 30},
    ),
    (
        "aurora",
        "Cinco horas de estudo",
        "Somou 5 horas de estudo.",
        "Dedicação",
        {"metrica": "minutos_totais", "minutos": 300},
    ),
    (
        "meia_noite",
        "Vinte horas de estudo",
        "Somou 20 horas de estudo.",
        "Dedicação",
        {"metrica": "minutos_totais", "minutos": 1200},
    ),
    (
        "trepadeira",
        "Cinco tópicos fechados",
        "Concluiu 5 tópicos.",
        "Trilha",
        {"metrica": "topicos_concluidos", "minimo": 5},
    ),
    (
        "mare",
        "Quinze tópicos fechados",
        "Concluiu 15 tópicos.",
        "Trilha",
        {"metrica": "topicos_concluidos", "minimo": 15},
    ),
    (
        "sol_dourado",
        "Vinte e cinco atividades",
        "Concluiu 25 atividades.",
        "Prática",
        {"metrica": "atividades_concluidas", "minimo": 25},
    ),
    (
        "fogo_e_ouro",
        "Setenta e cinco atividades",
        "Concluiu 75 atividades.",
        "Prática",
        {"metrica": "atividades_concluidas", "minimo": 75},
    ),
    (
        "coral_vivo",
        "Gabarito",
        "Acertou 100% de uma atividade.",
        "Precisão",
        {"metrica": "acertos_percentual", "percentual": 100},
    ),
]

# (acao, ordem antiga da moldura rara, missão nova)
CONVERTIDAS: list[tuple[str, int, Missao]] = [
    (
        "editar_perfil",
        6,
        (
            "rosa",
            "Rosa",
            "Sem atalhos",
            "Conclua uma turma inteira, com pelo menos 5 tópicos, sem pular nenhum conteúdo.",
            "Trilha",
            "sem_atalhos",
            1,
            "livro",
            "#d7263d",
        ),
    ),
    (
        "usar_modo_foco",
        5,
        (
            "lua_violeta",
            "Lua Violeta",
            "Imersão",
            "Tenha 2 horas de tempo ativo no mesmo dia, em 10 dias diferentes.",
            "Rotina",
            "imersao",
            10,
            "estrela",
            "#9b5de5",
        ),
    ),
    (
        "ver_estilo",
        10,
        (
            "nebulosa",
            "Nebulosa",
            "Semana completa",
            "Faça conteúdo, atividade, missão e duelo em cada dia, 7 dias seguidos.",
            "Rotina",
            "semana_completa",
            7,
            "foguete",
            "#4fd1c5",
        ),
    ),
    (
        "compartilhar_guilda",
        7,
        (
            "constelacao",
            "Constelação",
            "Invicto",
            "Vença 10 duelos ranqueados seguidos.",
            "Competição",
            "invicto",
            10,
            "trofeu",
            "#5b3fd9",
        ),
    ),
    (
        "avaliar_app",
        1,
        (
            "estrela_guia",
            "Estrela-Guia",
            "Azarão",
            "Vença 5 duelos contra quem tem 200 pontos de rating ou mais acima de você.",
            "Competição",
            "azarao",
            5,
            "foguete",
            "#e0b34d",
        ),
    ),
    (
        "ver_novidades",
        9,
        (
            "ceu_estrelado",
            "Céu Estrelado",
            "Campeão",
            "Termine em 1º lugar em 3 eventos de turma.",
            "Competição",
            "campeao",
            3,
            "medalha",
            "#1e4fd6",
        ),
    ),
    (
        "gerar_relatorio",
        3,
        (
            "lua_crescente",
            "Lua Crescente",
            "Guilda lendária",
            "Vença 3 eventos de turma com a sua guilda.",
            "Competição",
            "guilda_lendaria",
            3,
            "trofeu",
            "#6fb3e0",
        ),
    ),
    (
        "definir_lembrete",
        4,
        (
            "noite_de_lua",
            "Noite de Lua",
            "Topo do pódio",
            "Ganhe 3 medalhas de ouro no ranking da turma.",
            "Competição",
            "topo_do_podio",
            3,
            "medalha",
            "#1e4fd6",
        ),
    ),
]

# Ficam como estão, a pedido: são as duas únicas tarefas fáceis que sobram.
ACOES_MANTIDAS = ("reportar_erro", "ativar_notificacoes")

# As conquistas de moldura vão de 1 a 10 em `ordem`; as novas entram depois delas na aba.
PRIMEIRA_ORDEM = 11

DESAFIOS: list[str] = [m[5] for m in ENDURECIDAS] + [c[2][5] for c in CONVERTIDAS]

METRICAS_ANTES = (
    "'eventos_totais', 'eventos_do_tipo', 'atividades_concluidas', 'topicos_concluidos', "
    "'topicos_visitados', 'dias_seguidos', 'minutos_totais', 'acertos_percentual', "
    "'trilha_percentual', 'atividade_rapida', 'atividades_rapidas', 'evento_medalha'"
)


def _q(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def _lista_sql(itens: list[str]) -> str:
    return ", ".join(_q(i) for i in itens)


def _suportadas(metricas: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada(p_metrica text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_metrica IN ({metricas});
$function$;
"""


FUNCOES = r"""
-- Maior sequência de datas consecutivas.
CREATE OR REPLACE FUNCTION public.fn_maior_sequencia_de_dias(p_dias date[])
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(max(n), 0)::integer
    FROM (
      SELECT count(*) AS n
        FROM (
          SELECT d, d - (row_number() OVER (ORDER BY d))::integer AS grupo
            FROM (SELECT DISTINCT unnest(p_dias) AS d) distintos
           WHERE d IS NOT NULL
        ) s
       GROUP BY grupo
    ) t;
$fn$;

-- Turma do aluno com ao menos 5 tópicos, todos concluídos por ele.
CREATE OR REPLACE FUNCTION public.fn_turma_concluida_pelo_aluno(p_aluno uuid, p_classe bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT (SELECT count(*) FROM public.topicos t WHERE t.classe_id = p_classe) >= 5
     AND NOT EXISTS (
       SELECT 1
         FROM public.topicos t
        WHERE t.classe_id = p_classe
          AND NOT EXISTS (
            SELECT 1 FROM public.topico_aluno ta
             WHERE ta.aluno_id = p_aluno AND ta.topico_id = t.id AND ta.status::text = 'concluido'
          )
     );
$fn$;

-- Quanto o aluno já fez de cada desafio de moldura. Desafio desconhecido vale zero.
CREATE OR REPLACE FUNCTION public.fn_desafio_moldura_valor(p_aluno uuid, p_desafio text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  c_fuso CONSTANT text := 'America/Sao_Paulo';
  c_conclusoes CONSTANT text[] := ARRAY['conteudo_concluido', 'atividade_concluida', 'topico_atividade_concluida'];
  v_valor integer := 0;
BEGIN
  IF p_desafio = 'de_primeira' THEN
    SELECT count(DISTINCT t.atividade_id) INTO v_valor
      FROM public.atividade_tentativas t
     WHERE t.aluno_id = p_aluno AND t.respondida_em IS NOT NULL
       AND t.numero = 1 AND t.acertos_percentual = 100;

  ELSIF p_desafio = 'serie_perfeita' THEN
    -- Cada nota abaixo de 100 abre um grupo novo; a maior série é o grupo com mais atividades diferentes.
    SELECT COALESCE(max(n), 0) INTO v_valor
      FROM (
        SELECT count(DISTINCT s.atividade_id) FILTER (WHERE s.acertos_percentual = 100) AS n
          FROM (
            SELECT t.atividade_id, t.acertos_percentual,
                   count(*) FILTER (WHERE COALESCE(t.acertos_percentual, 0) < 100)
                     OVER (ORDER BY t.respondida_em, t.id) AS grupo
              FROM public.atividade_tentativas t
             WHERE t.aluno_id = p_aluno AND t.respondida_em IS NOT NULL
          ) s
         GROUP BY s.grupo
      ) g;

  ELSIF p_desafio = 'contra_o_relogio' THEN
    SELECT count(DISTINCT t.atividade_id) INTO v_valor
      FROM public.atividade_tentativas t
     WHERE t.aluno_id = p_aluno AND t.respondida_em IS NOT NULL
       AND t.cronometrada AND t.no_tempo AND t.acertos_percentual = 100;

  ELSIF p_desafio = 'volta_por_cima' THEN
    SELECT count(DISTINCT depois.atividade_id) INTO v_valor
      FROM public.atividade_tentativas depois
      JOIN public.atividade_tentativas antes
        ON antes.aluno_id = depois.aluno_id
       AND antes.atividade_id = depois.atividade_id
       AND antes.numero < depois.numero
     WHERE depois.aluno_id = p_aluno
       AND depois.respondida_em IS NOT NULL AND depois.acertos_percentual = 100
       AND antes.respondida_em IS NOT NULL AND antes.acertos_percentual < 50;

  ELSIF p_desafio = 'turma_zerada' THEN
    SELECT count(*) INTO v_valor
      FROM public.classe_aluno ca
     WHERE ca.aluno_id = p_aluno
       AND public.fn_turma_concluida_pelo_aluno(p_aluno, ca.classe_id)
       -- Sem atividade a média é NULL e a turma não conta. Atividade não feita vale zero.
       AND (
         SELECT avg(COALESCE(aa.acertos_percentual, 0))
           FROM public.atividades a
           JOIN public.topicos t ON t.id = a.topico_id
           LEFT JOIN public.atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
          WHERE t.classe_id = ca.classe_id
       ) >= 90;

  ELSIF p_desafio = 'sem_atalhos' THEN
    SELECT count(*) INTO v_valor
      FROM public.classe_aluno ca
     WHERE ca.aluno_id = p_aluno
       AND public.fn_turma_concluida_pelo_aluno(p_aluno, ca.classe_id)
       AND NOT EXISTS (
         SELECT 1
           FROM public.eventos_aluno e
           JOIN public.topicos t ON e.referencia = 'topico:' || t.id::text
          WHERE e.aluno_id = p_aluno
            AND e.tipo = 'topico_pular_conteudo'
            AND t.classe_id = ca.classe_id
       );

  ELSIF p_desafio = 'mes_de_verdade' THEN
    SELECT public.fn_maior_sequencia_de_dias(array_agg((e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE c_fuso)::date))
      INTO v_valor
      FROM public.eventos_aluno e
     WHERE e.aluno_id = p_aluno AND e.tipo = ANY (c_conclusoes);

  ELSIF p_desafio = 'dia_completo' THEN
    SELECT public.fn_maior_sequencia_de_dias(array_agg(d.dia))
      INTO v_valor
      FROM (
        SELECT (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE c_fuso)::date AS dia
          FROM public.eventos_aluno e
         WHERE e.aluno_id = p_aluno AND e.tipo = 'missao_diaria_concluida'
         GROUP BY 1
        HAVING count(DISTINCT e.referencia) >= 3
      ) d;

  ELSIF p_desafio = 'sem_folga' THEN
    -- Semana que começa na segunda: sábado e domingo caem na mesma. A sequência é de semanas.
    SELECT COALESCE(max(n), 0) INTO v_valor
      FROM (
        SELECT count(*) AS n
          FROM (
            SELECT w.semana, w.semana - row_number() OVER (ORDER BY w.semana) AS grupo
              FROM (
                SELECT (date_trunc('week', d.dia)::date - DATE '2000-01-03') / 7 AS semana
                  FROM (
                    SELECT DISTINCT (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE c_fuso)::date AS dia
                      FROM public.eventos_aluno e
                     WHERE e.aluno_id = p_aluno AND e.tipo = ANY (c_conclusoes)
                  ) d
                 WHERE extract(isodow FROM d.dia) IN (6, 7)
                 GROUP BY 1
                HAVING count(*) = 2
              ) w
          ) s
         GROUP BY s.grupo
      ) g;

  ELSIF p_desafio IN ('madrugador', 'coruja') THEN
    SELECT count(DISTINCT l.momento::date) INTO v_valor
      FROM (
        SELECT e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE c_fuso AS momento
          FROM public.eventos_aluno e
         WHERE e.aluno_id = p_aluno AND e.tipo = ANY (c_conclusoes)
      ) l
     WHERE (p_desafio = 'madrugador' AND extract(hour FROM l.momento) < 8)
        OR (p_desafio = 'coruja' AND extract(hour FROM l.momento) >= 22);

  ELSIF p_desafio = 'imersao' THEN
    -- Somar as linhas: cada lote traz só o próprio intervalo. Um escopo só: os outros repetem o tempo.
    SELECT count(*) INTO v_valor
      FROM (
        SELECT (m.captured_at AT TIME ZONE c_fuso)::date
          FROM public.telemetria_time_metric_entries m
         WHERE m.aluno_id = p_aluno AND m.scope = 'topic' AND m.topico_id IS NOT NULL
         GROUP BY 1
        HAVING sum(m.active_sec) >= 7200
      ) d;

  ELSIF p_desafio = 'semana_completa' THEN
    SELECT public.fn_maior_sequencia_de_dias(array_agg(d.dia))
      INTO v_valor
      FROM (
        SELECT (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE c_fuso)::date AS dia
          FROM public.eventos_aluno e
         WHERE e.aluno_id = p_aluno
           AND e.tipo IN ('conteudo_concluido', 'atividade_concluida', 'topico_atividade_concluida',
                          'missao_diaria_concluida',
                          'desafio_vencido', 'desafio_empate', 'desafio_derrota', 'desafio_participou')
         GROUP BY 1
        HAVING bool_or(e.tipo = 'conteudo_concluido')
           AND bool_or(e.tipo IN ('atividade_concluida', 'topico_atividade_concluida'))
           AND bool_or(e.tipo = 'missao_diaria_concluida')
           AND bool_or(e.tipo LIKE 'desafio\_%')
      ) d;

  ELSIF p_desafio = 'invicto' THEN
    -- Empate também quebra a série.
    SELECT COALESCE(max(n), 0) INTO v_valor
      FROM (
        SELECT count(*) FILTER (WHERE s.resultado = 'vitoria') AS n
          FROM (
            SELECT p.resultado,
                   count(*) FILTER (WHERE p.resultado <> 'vitoria')
                     OVER (ORDER BY p.criado_em, p.desafio_id) AS grupo
              FROM public.ranqueada_elo_partida p
             WHERE p.aluno_id = p_aluno
          ) s
         GROUP BY s.grupo
      ) g;

  ELSIF p_desafio = 'azarao' THEN
    SELECT count(DISTINCT p.desafio_id) INTO v_valor
      FROM public.ranqueada_elo_partida p
     WHERE p.aluno_id = p_aluno
       AND p.resultado = 'vitoria'
       AND EXISTS (
         SELECT 1 FROM public.ranqueada_elo_partida o
          WHERE o.desafio_id = p.desafio_id
            AND o.equipe <> p.equipe
            AND o.rating_antes >= p.rating_antes + 200
       );

  ELSIF p_desafio = 'campeao' THEN
    SELECT count(*) INTO v_valor
      FROM public.eventos_classe_resultado r
     WHERE r.aluno_id = p_aluno AND r.posicao = 1 AND r.participou;

  ELSIF p_desafio = 'guilda_lendaria' THEN
    -- Só conta quem era da guilda quando o evento foi apurado e participou dele.
    SELECT count(DISTINCT g.evento_id) INTO v_valor
      FROM public.eventos_classe_resultado_guilda g
      JOIN public.guilda_membros m
        ON m.guilda_id = g.guilda_id
       AND m.aluno_id = p_aluno
       AND m.joined_at <= g.apurado_em
       AND (m.left_at IS NULL OR m.left_at >= g.apurado_em)
      JOIN public.eventos_classe_resultado r
        ON r.evento_id = g.evento_id AND r.aluno_id = p_aluno AND r.participou
     WHERE g.posicao = 1;

  ELSIF p_desafio = 'topo_do_podio' THEN
    SELECT count(DISTINCT c.rank_id) INTO v_valor
      FROM public.rank_podio_congelado c
     WHERE c.aluno_id = p_aluno AND c.posicao = 1;
  END IF;

  RETURN COALESCE(v_valor, 0);
END;
$fn$;

-- Índice próprio: a chave primária começa em desafio_id e o outro índice exige a turma.
CREATE INDEX IF NOT EXISTS ix_ranqueada_elo_partida_aluno_tempo
  ON public.ranqueada_elo_partida (aluno_id, criado_em);

REVOKE ALL ON FUNCTION public.fn_maior_sequencia_de_dias(date[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_turma_concluida_pelo_aluno(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_desafio_moldura_valor(uuid, text) FROM PUBLIC, anon, authenticated;
"""


def _troca_em_funcao(funcao: str, antes: str, depois: str) -> str:
    """Substitui um trecho no corpo de uma função; âncora ausente ou repetida aborta a migração."""
    return f"""
DO $migracao$
DECLARE
  v_def text;
  v_ancora CONSTANT text := $a${antes}$a$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.proname = '{funcao}' AND p.pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '{funcao} nao existe';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_ancora, ''))) <> length(v_ancora) THEN
    RAISE EXCEPTION 'ancora ausente ou repetida em {funcao}';
  END IF;
  EXECUTE replace(v_def, v_ancora, $r${depois}$r$);
END;
$migracao$;
"""


_AVALIADOR_ANTES = "IF v_metrica = 'eventos_totais' THEN"
_AVALIADOR_DEPOIS = """IF v_metrica = 'desafio_moldura' THEN
    v_ok := public.fn_desafio_moldura_valor(p_aluno, p_criterio ->> 'desafio')
            >= COALESCE((p_criterio ->> 'minimo')::int, 1);

  ELSIF v_metrica = 'eventos_totais' THEN"""

_VALIDADOR_ANTES = "IF v_metrica = 'eventos_do_tipo'"
_VALIDADOR_DEPOIS = f"""IF v_metrica = 'desafio_moldura'
     AND (coalesce(p_criterio ->> 'desafio', '') NOT IN ({_lista_sql(DESAFIOS)})
          OR coalesce(p_criterio ->> 'minimo', '') !~ c_inteiro
          OR (p_criterio ->> 'minimo')::int < 1) THEN
    RETURN 'Informe um desafio da lista e o mínimo como inteiro a partir de 1.';
  END IF;

  IF v_metrica = 'eventos_do_tipo'"""

_CATALOGO_ANTES = "COALESCE('Conquista: ' || c.nome, 'Conquista do sistema')"
_CATALOGO_DEPOIS = (
    "COALESCE(c.nome || ': ' || regexp_replace(c.descricao, ' Libera a moldura .*$', ''), 'Conquista do sistema')"
)


def _criterio(desafio: str, minimo: int, icone: str, cor: str) -> str:
    completo = {
        "metrica": "desafio_moldura",
        "desafio": desafio,
        "minimo": minimo,
        "aparencia": {"icone": icone, "cor": cor},
    }
    return _q(json.dumps(completo, ensure_ascii=False)) + "::jsonb"


def _descricao(texto: str, moldura: str) -> str:
    return _q(f"{texto} Libera a moldura {moldura}.")


def _semente_sql() -> str:
    partes: list[str] = []
    for codigo, moldura, missao, texto, categoria, desafio, minimo, icone, cor in ENDURECIDAS:
        partes.append(
            f"UPDATE public.conquistas SET nome = {_q(missao)}, "
            f"descricao = {_descricao(texto, moldura)}, categoria = {_q(categoria)}, "
            f"criterio = {_criterio(desafio, minimo, icone, cor)} "
            f"WHERE tipo = {_q('moldura_' + codigo)} AND classe_id IS NULL AND escopo = 'comum';"
        )
    for posicao, (acao, _ordem, m) in enumerate(CONVERTIDAS, start=PRIMEIRA_ORDEM):
        codigo, moldura, missao, texto, categoria, desafio, minimo, icone, cor = m
        partes.append(
            f"""
WITH c AS (
  INSERT INTO public.conquistas
    (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por, ativa)
  VALUES ({_q(missao)}, {_descricao(texto, moldura)}, {_q(categoria)},
          {_q("moldura_" + codigo)}, 'comum', {_criterio(desafio, minimo, icone, cor)}, 0, NULL, NULL, true)
  RETURNING id
)
UPDATE public.molduras m
   SET origem = 'conquista', conquista_id = c.id, ordem = {posicao}, atualizado_em = now()
  FROM c
 WHERE m.codigo = {_q(codigo)};"""
        )
        partes.append(
            "UPDATE public.molduras_acoes SET ativa = false, moldura_codigo = NULL, atualizado_em = now() "
            f"WHERE acao = {_q(acao)};"
        )
    return "\n".join(partes)


def _reverte_semente_sql() -> str:
    aparencia = {m[0]: (m[1], m[7], m[8]) for m in ENDURECIDAS}
    partes: list[str] = []
    for acao, ordem, m in CONVERTIDAS:
        codigo = m[0]
        partes.append(
            f"""
WITH alvo AS (SELECT conquista_id AS id FROM public.molduras WHERE codigo = {_q(codigo)}),
     solta AS (
       UPDATE public.molduras
          SET origem = 'acao', conquista_id = NULL, ordem = {ordem}, atualizado_em = now()
        WHERE codigo = {_q(codigo)}
     ),
     registros AS (DELETE FROM public.conquistas_aluno WHERE conquista_id IN (SELECT id FROM alvo))
DELETE FROM public.conquistas WHERE id IN (SELECT id FROM alvo);"""
        )
        partes.append(
            f"UPDATE public.molduras_acoes SET ativa = true, moldura_codigo = {_q(codigo)}, atualizado_em = now() "
            f"WHERE acao = {_q(acao)};"
        )
    for codigo, conquista, texto, categoria, criterio in ANTERIORES:
        moldura, icone, cor = aparencia[codigo]
        completo = {**criterio, "aparencia": {"icone": icone, "cor": cor}}
        partes.append(
            f"UPDATE public.conquistas SET nome = {_q(conquista)}, "
            f"descricao = {_descricao(texto, moldura)}, categoria = {_q(categoria)}, "
            f"criterio = {_q(json.dumps(completo, ensure_ascii=False))}::jsonb "
            f"WHERE tipo = {_q('moldura_' + codigo)} AND classe_id IS NULL AND escopo = 'comum';"
        )
    return "\n".join(partes)


UPGRADE: list[str] = [
    FUNCOES,
    _suportadas(METRICAS_ANTES + ", 'desafio_moldura'"),
    _troca_em_funcao("fn_avaliar_metrica", _AVALIADOR_ANTES, _AVALIADOR_DEPOIS),
    _troca_em_funcao("fn_conquista_criterio_erro", _VALIDADOR_ANTES, _VALIDADOR_DEPOIS),
    _troca_em_funcao("molduras_catalogo", _CATALOGO_ANTES, _CATALOGO_DEPOIS),
    _semente_sql(),
]

DOWNGRADE: list[str] = [
    _reverte_semente_sql(),
    _troca_em_funcao("molduras_catalogo", _CATALOGO_DEPOIS, _CATALOGO_ANTES),
    _troca_em_funcao("fn_conquista_criterio_erro", _VALIDADOR_DEPOIS, _VALIDADOR_ANTES),
    _troca_em_funcao("fn_avaliar_metrica", _AVALIADOR_DEPOIS, _AVALIADOR_ANTES),
    _suportadas(METRICAS_ANTES),
    """
DROP INDEX IF EXISTS public.ix_ranqueada_elo_partida_aluno_tempo;
DROP FUNCTION IF EXISTS public.fn_desafio_moldura_valor(uuid, text);
DROP FUNCTION IF EXISTS public.fn_turma_concluida_pelo_aluno(uuid, bigint);
DROP FUNCTION IF EXISTS public.fn_maior_sequencia_de_dias(date[]);
""",
]


def upgrade() -> None:
    for bloco in UPGRADE:
        op.execute(bloco)


def downgrade() -> None:
    for bloco in DOWNGRADE:
        op.execute(bloco)
