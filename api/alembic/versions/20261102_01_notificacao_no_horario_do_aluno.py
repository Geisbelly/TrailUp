"""Notificação no horário do aluno e com o tópico dele: horário e texto da revisão diária no banco (#66)

## O que a medição de 01/11 achou (produção, só leitura)

- **O horário que a IA escolhe é descartado.** `notificacoes_ia` não tinha coluna de horário, e
  `notificacoes_ia_promover` gravava a pendente com `horario = now()`. As três sugestões de 31/10
  saíram às 00:34, no meio do silêncio de 22h–7h que o próprio agente respeita.
- **Toda revisão diária sai às 19h** (o padrão de `rotina_diaria_hora`) para quem nunca escolheu, e
  não havia como distinguir escolha do aluno de padrão: um aluno tem 22h e é escolha explícita.
- **O texto da revisão diária é fixo** ("Sua revisão de hoje" / "Sua trilha continua de onde você
  parou."), o mesmo para os sete perfis e sem dizer de qual tópico.
- `aluno_sessoes_app` tem 679 sessões de 5 alunos; uma conta tem 602, espalhadas de 0h a 23h, e 205
  sessões têm `duracao_seg = 0`. Amostra pequena e ruidosa: inferir horário exige mínimo de
  evidência (dias distintos, não sessões) e cair no padrão quando ela não existe.

A base de evidências (`docs/rag/avaliacao-documentos.md`) diz que lembrete funciona ligado ao
progresso e a prazos, e que lembrete genérico e frequente pode gerar ansiedade (DAT-33, DAT-45,
DAT-32). Por isso o texto novo cita o tópico em andamento e o percentual, e não aumenta a
frequência: continua uma revisão por dia.

Tudo aqui é banco, pela regra de fronteira: horário, fila e texto de modelo não têm modelo de
linguagem no meio. A API só passa a gravar o horário que o modelo sugeriu (`horario_sugerido`).

## Horário habitual: `notificacoes_horario_preferido(aluno)`

Lê `aluno_sessoes_app` dos últimos `horario_janela_dias` (28) dias, cada sessão no fuso dela, e:

- descarta sessão com menos de `horario_sessao_min_seg` (60 s). A duração é a maior entre
  `duracao_seg` e `encerrada_em - iniciada_em`: as 205 sessões com `duracao_seg = 0` não são todas
  sessões de zero segundo;
- descarta sessão que começa no silêncio (22h–7h): mandar lembrete ali está fora de questão, e uma
  madrugada de estudo não pode puxar a rotina para a madrugada;
- conta **dias distintos** por hora local. Sessão não serve: um dia com 40 aberturas às 10h
  venceria um mês inteiro de estudo às 20h;
- exige `horario_min_dias` (3) dias de uso no período e `horario_min_dias_na_hora` (2) na hora
  vencedora. Empate: mais dias, depois o dia mais recente, depois a hora mais cedo;
- sem isso, vale o padrão (`rotina_diaria_hora`, 19h) e `origem = 'padrao'`.

O envio sai `horario_antecedencia_min` (30) minutos **antes** da hora habitual: a notificação chama
para estudar, então chega antes de o aluno costumar começar. Se a antecedência cair no silêncio
(hábito às 7h), o envio vai para o fim do silêncio.

## Escolha do aluno nunca é sobrescrita: `notificacoes_agendamentos.hora_origem`

`padrao`, `aluno` ou `inferida`. Só a tela "Lembrete diário" do app chama
`notificacoes_salvar_rotina` (`mobile/src/app/(tabs)/perfil/lembrete-diario.tsx`), e ela manda a
hora atual também quando o aluno só liga ou desliga o lembrete. Por isso `salvar_rotina` marca
`aluno` **quando a hora ou o minuto mudam** (ou quando a linha nasce por ela) e preserva a origem
no liga/desliga: senão, desligar e religar congelaria a hora inferida como se fosse escolha.
`notificacoes_garantir_rotinas` (o upsert do login) não mexe na origem.

Linhas que já existem: `revisao_diaria` com hora ou minuto diferentes do padrão configurado viram
`aluno` (é o caso das 22h medido). As demais ficam `padrao`. Um aluno que escolheu exatamente o
padrão passa a ser recalculado; a alternativa (tratar tudo como escolha) congelaria as quatro
rotinas de 19h medidas, que nunca foram escolhidas.

## Texto por aluno: `notificacoes_modelos_texto` e `notificacoes_texto_revisao(aluno)`

Modelo por perfil BrainHex dominante (mesma ordem de `fn_enqueue_student_enrollment_job`: maior
afinidade, empate pelo nome, sem perfil = `mastermind`), em duas variantes: `com_topico` (o tópico
em andamento mais recente, numa turma em que o aluno está, com o percentual) e `sem_topico`. Os
marcadores são `{topico}` e `{percentual}`; o sinal de porcentagem entra pela função (`chr(37)`) e
não pelo texto, para nenhum `%` aparecer no SQL desta migração (o SQL offline do Alembic o dobra).

**A tabela fica sem policy, de propósito.** O event trigger `ensure_rls` liga RLS nela, e o acesso
é só por função `SECURITY DEFINER` (a do texto e a do job). O cliente não tem o que ler aqui, e os
GRANTs de `anon`/`authenticated` são revogados. O aluno vê o texto pronto em
`notificacoes_minhas_rotinas`, como antes.

`notificacoes_garantir_rotinas` deixa de reescrever título e corpo da `revisao_diaria` a cada
login: senão, o texto personalizado viraria o fixo de novo na abertura seguinte do app. Ao criar a
linha, o texto fixo continua sendo o inicial (`20260826_14`).

## Job diário: `notificacoes_recalcular_rotinas()`

`pg_cron`, todo dia às 09:00 UTC (06h de Brasília, antes de qualquer horário possível fora do
silêncio). Para cada `revisao_diaria` ativa: troca o texto pelo modelo do aluno; e, se a origem não
é `aluno`, troca hora e minuto pelo horário preferido e reagenda a próxima execução quando eles
mudam. Trava com `pg_try_advisory_xact_lock` (passada duplicada sai sem fazer nada), `FOR UPDATE
SKIP LOCKED` e uma exceção isolada por linha. O app agenda a notificação local pelo que
`notificacoes_minhas_rotinas` devolve, então o aparelho segue o horário e o texto novos sem
mudança no mobile.

## Promoção da sugestão da IA: `notificacoes_ia.horario_sugerido`

A API passa a gravar o horário que o modelo sugeriu. `notificacoes_ia_promover` decide:

- `suporte`: agora;
- `lembrete`: o próximo horário habitual do aluno (quando inferido); senão o do modelo; senão agora;
- outro tipo (`conquista`, `alteracao_professor`): o do modelo, senão agora;
- sempre fora do silêncio no fuso do aluno: caindo nele, vai para o fim do silêncio.

A expiração e o dia do dedupe passam a contar do horário escolhido, não da hora da promoção.

`notificacoes_varrer` também passa a visitar quem tem pendente de horário vencida. Antes ela só
visitava alunos com rotina vencida: uma sugestão marcada para as 20h esperaria a rotina ou o
próximo login.

Revision ID: 20261102_01
Revises: 20261101_14
Create Date: 2026-11-02
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261102_01"
down_revision = "20261101_14"
branch_labels = None
depends_on = None

JOB = "trailup_notificacoes_recalcular_rotinas"
CRON = "0 9 * * *"

AQUI = Path(__file__).resolve()

# (perfil, variante) -> (título, corpo). `{topico}` e `{percentual}` são trocados pela função.
MODELOS: dict[tuple[str, str], tuple[str, str]] = {
    ("seeker", "com_topico"): (
        "Ainda há o que descobrir",
        "Você explorou {percentual} de {topico}. O próximo trecho guarda uma conexão nova.",
    ),
    ("seeker", "sem_topico"): (
        "Tem trilha para explorar",
        "Seu próximo tópico guarda uma descoberta. Dá uma olhada quando puder.",
    ),
    ("survivor", "com_topico"): (
        "Seu plano continua de pé",
        "{topico} está em {percentual}. Um passo pequeno hoje mantém tudo em dia.",
    ),
    ("survivor", "sem_topico"): (
        "Seu plano continua de pé",
        "Um passo pequeno hoje mantém a trilha em dia. Retome do ponto onde parou.",
    ),
    ("daredevil", "com_topico"): (
        "Missão em andamento",
        "{topico}: {percentual} feito. Topa uma rodada rápida agora?",
    ),
    ("daredevil", "sem_topico"): (
        "Desafio esperando",
        "Tem uma missão rápida na sua trilha. Topa resolver hoje?",
    ),
    ("mastermind", "com_topico"): (
        "O próximo padrão te espera",
        "Você está em {percentual} de {topico}. Falta encaixar o próximo conceito.",
    ),
    ("mastermind", "sem_topico"): (
        "O próximo padrão te espera",
        "Há um conceito novo para encaixar no que você já sabe. Retome quando puder.",
    ),
    ("conqueror", "com_topico"): (
        "Sua próxima conquista",
        "{topico} está em {percentual}. Avance mais uma etapa e chegue perto de fechar.",
    ),
    ("conqueror", "sem_topico"): (
        "Sua próxima conquista",
        "Falta pouco para a próxima etapa. Avance mais um passo hoje.",
    ),
    ("socializer", "com_topico"): (
        "Sua turma está avançando",
        "Você está em {percentual} de {topico}. Que tal seguir junto com a turma hoje?",
    ),
    ("socializer", "sem_topico"): (
        "Sua turma está avançando",
        "Que tal acompanhar a turma? Seu próximo passo já está pronto.",
    ),
    ("achiever", "com_topico"): (
        "Mais um passo na meta",
        "{topico}: {percentual} concluído. Feche o próximo item e veja o progresso subir.",
    ),
    ("achiever", "sem_topico"): (
        "Mais um passo na meta",
        "Seu próximo item está pronto. Avance hoje e veja o progresso subir.",
    ),
}

CONFIG = """
INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES
  ('horario_janela_dias', '28',
   'Dias de aluno_sessoes_app lidos para inferir o horário habitual do aluno.'),
  ('horario_sessao_min_seg', '60',
   'Sessão mais curta que isto (segundos) não conta como uso para o horário habitual.'),
  ('horario_min_dias', '3',
   'Dias distintos de uso no período, abaixo dos quais vale o horário padrão.'),
  ('horario_min_dias_na_hora', '2',
   'Dias distintos na hora vencedora, abaixo dos quais vale o horário padrão.'),
  ('horario_antecedencia_min', '30',
   'Minutos antes da hora habitual em que a revisão diária e o lembrete da IA saem.')
ON CONFLICT (chave) DO NOTHING;
"""

COLUNAS = """
ALTER TABLE public.notificacoes_agendamentos
  ADD COLUMN IF NOT EXISTS hora_origem text NOT NULL DEFAULT 'padrao';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'notificacoes_agendamentos_hora_origem_chk') THEN
    ALTER TABLE public.notificacoes_agendamentos
      ADD CONSTRAINT notificacoes_agendamentos_hora_origem_chk
      CHECK (hora_origem IN ('padrao', 'aluno', 'inferida'));
  END IF;
END $$;

-- Hora diferente do padrão só sai de escolha do aluno: a rotina nasce no padrão.
UPDATE public.notificacoes_agendamentos
   SET hora_origem = 'aluno'
 WHERE tipo = 'revisao_diaria'
   AND hora_origem = 'padrao'
   AND (hora_local IS DISTINCT FROM public.notificacoes_cfg_int('rotina_diaria_hora', 19)::smallint
        OR minuto_local IS DISTINCT FROM public.notificacoes_cfg_int('rotina_diaria_minuto', 0)::smallint);

ALTER TABLE public.notificacoes_ia ADD COLUMN IF NOT EXISTS horario_sugerido timestamptz;
"""

TABELA = """
CREATE TABLE IF NOT EXISTS public.notificacoes_modelos_texto (
  perfil        text        NOT NULL,
  tipo          text        NOT NULL,
  variante      text        NOT NULL CHECK (variante IN ('com_topico', 'sem_topico')),
  titulo        text        NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 60),
  corpo         text        NOT NULL CHECK (char_length(corpo) BETWEEN 1 AND 200),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (perfil, tipo, variante)
);
COMMENT ON TABLE public.notificacoes_modelos_texto IS
  'Modelos de texto da revisão diária por perfil BrainHex (#66). Sem policy de propósito: '
  'acesso só por notificacoes_texto_revisao / notificacoes_recalcular_rotinas (SECURITY DEFINER).';
ALTER TABLE public.notificacoes_modelos_texto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes_modelos_texto FROM PUBLIC, anon, authenticated;
"""


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def sementes() -> str:
    linhas = ",\n  ".join(
        f"({_sql_texto(perfil)}, 'revisao_diaria', {_sql_texto(variante)}, "
        f"{_sql_texto(titulo)}, {_sql_texto(corpo)})"
        for (perfil, variante), (titulo, corpo) in MODELOS.items()
    )
    return f"""
INSERT INTO public.notificacoes_modelos_texto (perfil, tipo, variante, titulo, corpo) VALUES
  {linhas}
ON CONFLICT (perfil, tipo, variante) DO UPDATE
  SET titulo = EXCLUDED.titulo, corpo = EXCLUDED.corpo, atualizado_em = now();

-- Guarda de codificação (mesmo padrão da 20260826_14): arquivo lido com a codificação errada
-- falha aqui, em vez de gravar mojibake que só aparece no aparelho do aluno.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notificacoes_modelos_texto
                  WHERE perfil = 'survivor' AND variante = 'com_topico'
                    AND position('á' in corpo) > 0) THEN
    RAISE EXCEPTION 'Modelo de texto chegou sem acento: revise a codificação da migração.';
  END IF;
END $$;
"""


FUNCOES = r"""
-- Momento fora do silêncio: dentro dele, o fim do silêncio (no fuso do aluno).
CREATE OR REPLACE FUNCTION public.notificacoes_fora_do_silencio(
  p_timezone text, p_momento timestamptz
)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_fim   integer := mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24);
  v_local timestamp;
  v_alvo  timestamp;
BEGIN
  IF p_momento IS NULL OR NOT public.notificacoes_em_silencio(v_tz, p_momento) THEN
    RETURN p_momento;
  END IF;
  v_local := p_momento AT TIME ZONE v_tz;
  v_alvo  := date_trunc('day', v_local) + make_interval(hours => v_fim);
  IF v_alvo <= v_local THEN
    v_alvo := v_alvo + interval '1 day';
  END IF;
  RETURN v_alvo AT TIME ZONE v_tz;
END;
$fn$;

-- Perfil dominante, como chave do mobile/microservice: mesma ordem de
-- fn_enqueue_student_enrollment_job (afinidade, depois nome; sem perfil = mastermind).
CREATE OR REPLACE FUNCTION public.notificacoes_perfil_dominante(p_aluno uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil text;
BEGIN
  SELECT lower(btrim(p.nome)) INTO v_perfil
    FROM aluno_perfil ap
    JOIN perfil p ON p.id = ap.perfil_id
   WHERE ap.aluno_id = p_aluno
   ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
   LIMIT 1;
  RETURN CASE
    WHEN v_perfil IS NULL OR v_perfil = '' THEN 'mastermind'
    WHEN v_perfil = 'socialiser' THEN 'socializer'
    ELSE v_perfil
  END;
END;
$fn$;

-- Horário de envio da revisão diária e do lembrete da IA para este aluno.
CREATE OR REPLACE FUNCTION public.notificacoes_horario_preferido(p_aluno uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_janela    integer := public.notificacoes_cfg_int('horario_janela_dias', 28);
  v_min_seg   integer := public.notificacoes_cfg_int('horario_sessao_min_seg', 60);
  v_min_dias  integer := public.notificacoes_cfg_int('horario_min_dias', 3);
  v_min_hora  integer := public.notificacoes_cfg_int('horario_min_dias_na_hora', 2);
  v_antes     integer := public.notificacoes_cfg_int('horario_antecedencia_min', 30);
  v_hora_pad  integer := public.notificacoes_cfg_int('rotina_diaria_hora', 19);
  v_min_pad   integer := public.notificacoes_cfg_int('rotina_diaria_minuto', 0);
  v_fim       integer := mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24);
  v_dias      integer;
  v_hora      integer;
  v_dias_hora integer;
  v_envio     integer;
BEGIN
  WITH uso AS (
    SELECT (s.iniciada_em AT TIME ZONE public.notificacoes_tz(s.timezone)) AS local
      FROM aluno_sessoes_app s
     WHERE s.aluno_id = p_aluno
       AND s.iniciada_em >= now() - make_interval(days => v_janela)
       AND GREATEST(
             COALESCE(s.duracao_seg, 0),
             COALESCE(EXTRACT(EPOCH FROM (s.encerrada_em - s.iniciada_em)), 0)
           ) >= v_min_seg
       AND NOT public.notificacoes_em_silencio(s.timezone, s.iniciada_em)
  ),
  por_hora AS (
    SELECT EXTRACT(HOUR FROM u.local)::integer AS hora,
           count(DISTINCT u.local::date)::integer AS dias,
           max(u.local::date) AS ultimo
      FROM uso u
     GROUP BY 1
  )
  SELECT (SELECT count(DISTINCT u.local::date)::integer FROM uso u), ph.hora, ph.dias
    INTO v_dias, v_hora, v_dias_hora
    FROM (SELECT 1) um
    LEFT JOIN LATERAL (
      SELECT * FROM por_hora ORDER BY dias DESC, ultimo DESC, hora ASC LIMIT 1
    ) ph ON TRUE;

  IF COALESCE(v_dias, 0) < v_min_dias OR COALESCE(v_dias_hora, 0) < v_min_hora THEN
    RETURN jsonb_build_object(
      'hora', v_hora_pad, 'minuto', v_min_pad, 'origem', 'padrao',
      'hora_habitual', v_hora, 'dias_uso', COALESCE(v_dias, 0),
      'dias_na_hora', COALESCE(v_dias_hora, 0), 'janela_dias', v_janela
    );
  END IF;

  v_envio := mod(v_hora * 60 - v_antes + 1440, 1440);
  -- Só a hora importa para o silêncio: qualquer data serve para perguntar.
  IF public.notificacoes_em_silencio(
       'UTC', make_timestamptz(2000, 1, 1, v_envio / 60, mod(v_envio, 60), 0, 'UTC')
     ) THEN
    v_envio := v_fim * 60;
  END IF;

  RETURN jsonb_build_object(
    'hora', v_envio / 60, 'minuto', mod(v_envio, 60), 'origem', 'inferida',
    'hora_habitual', v_hora, 'dias_uso', v_dias, 'dias_na_hora', v_dias_hora,
    'janela_dias', v_janela
  );
END;
$fn$;

-- Texto da revisão diária no tom do perfil e com o tópico em andamento (DAT-33).
-- NULL quando não há modelo: quem chama mantém o texto que já está lá.
CREATE OR REPLACE FUNCTION public.notificacoes_texto_revisao(p_aluno uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil   text := public.notificacoes_perfil_dominante(p_aluno);
  v_topico   record;
  v_variante text := 'sem_topico';
  v_modelo   record;
  v_nome     text;
BEGIN
  SELECT ta.topico_id, btrim(t.nome) AS nome, COALESCE(ta.percentual_concluido, 0) AS percentual
    INTO v_topico
    FROM topico_aluno ta
    JOIN topicos t ON t.id = ta.topico_id
    JOIN classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = ta.aluno_id
   WHERE ta.aluno_id = p_aluno
     AND ta.status::text = 'em andamento'
     AND COALESCE(ta.percentual_concluido, 0) < 100
     AND btrim(COALESCE(t.nome, '')) <> ''
   ORDER BY ta.updated_at DESC NULLS LAST, ta.topico_id
   LIMIT 1;
  IF FOUND THEN
    v_variante := 'com_topico';
    v_nome := left(v_topico.nome, 60);
  END IF;

  SELECT m.titulo, m.corpo, m.perfil INTO v_modelo
    FROM notificacoes_modelos_texto m
   WHERE m.tipo = 'revisao_diaria' AND m.variante = v_variante
     AND m.perfil IN (v_perfil, 'mastermind')
   ORDER BY (m.perfil = v_perfil) DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'titulo', v_modelo.titulo,
    'corpo', CASE WHEN v_variante = 'com_topico' THEN
               replace(replace(v_modelo.corpo, '{topico}', v_nome),
                       '{percentual}', round(v_topico.percentual)::integer::text || chr(37))
             ELSE v_modelo.corpo END,
    'perfil', v_modelo.perfil,
    'variante', v_variante,
    'topico_id', v_topico.topico_id
  );
END;
$fn$;

-- Job diário (pg_cron): texto de toda revisão diária ativa; horário de quem não escolheu.
CREATE OR REPLACE FUNCTION public.notificacoes_recalcular_rotinas(p_limite integer DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_reg      record;
  v_texto    jsonb;
  v_pref     jsonb;
  v_hora     smallint;
  v_minuto   smallint;
  v_prox     timestamptz;
  v_textos   integer := 0;
  v_horarios integer := 0;
  v_falhas   integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('notificacoes_recalcular_rotinas')) THEN
    RETURN jsonb_build_object('pulou', true);
  END IF;

  FOR v_reg IN
    SELECT a.*
      FROM notificacoes_agendamentos a
     WHERE a.tipo = 'revisao_diaria' AND a.aluno_id IS NOT NULL AND a.ativo
     ORDER BY a.id
     LIMIT GREATEST(1, p_limite)
       FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_texto := public.notificacoes_texto_revisao(v_reg.aluno_id);
      IF v_texto IS NOT NULL
         AND (v_reg.titulo IS DISTINCT FROM v_texto->>'titulo'
              OR v_reg.corpo IS DISTINCT FROM v_texto->>'corpo') THEN
        UPDATE notificacoes_agendamentos
           SET titulo = v_texto->>'titulo', corpo = v_texto->>'corpo', atualizado_em = now()
         WHERE id = v_reg.id;
        v_textos := v_textos + 1;
      END IF;

      IF v_reg.hora_origem <> 'aluno' THEN
        v_pref   := public.notificacoes_horario_preferido(v_reg.aluno_id);
        v_hora   := (v_pref->>'hora')::smallint;
        v_minuto := (v_pref->>'minuto')::smallint;
        IF v_hora IS DISTINCT FROM v_reg.hora_local
           OR v_minuto IS DISTINCT FROM v_reg.minuto_local THEN
          v_prox := public.notificacoes_proxima_ocorrencia(
            v_reg.recorrencia, now(), v_hora, v_minuto, v_reg.timezone
          );
          UPDATE notificacoes_agendamentos
             SET hora_local = v_hora, minuto_local = v_minuto,
                 hora_origem = v_pref->>'origem',
                 proxima_execucao = v_prox, horario = v_prox, atualizado_em = now()
           WHERE id = v_reg.id;
          v_horarios := v_horarios + 1;
        ELSIF v_reg.hora_origem IS DISTINCT FROM v_pref->>'origem' THEN
          UPDATE notificacoes_agendamentos
             SET hora_origem = v_pref->>'origem', atualizado_em = now()
           WHERE id = v_reg.id;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas + 1;
      RAISE WARNING USING MESSAGE =
        'notificacoes_recalcular_rotinas: agendamento ' || v_reg.id::text || ' falhou: ' || SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('pulou', false, 'textos', v_textos,
                            'horarios', v_horarios, 'falhas', v_falhas);
END;
$fn$;

-- Edição explícita do aluno (tela Lembrete diário). Igual à 20260826_04, mais `hora_origem`.
CREATE OR REPLACE FUNCTION public.notificacoes_salvar_rotina(
  p_tipo text,
  p_recorrencia text DEFAULT 'diaria',
  p_gatilho text DEFAULT 'horario',
  p_titulo text DEFAULT NULL,
  p_corpo text DEFAULT NULL,
  p_hora_local smallint DEFAULT NULL,
  p_minuto_local smallint DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_prioridade integer DEFAULT 0,
  p_contexto jsonb DEFAULT '{}'::jsonb,
  p_ativo boolean DEFAULT TRUE
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_prox  timestamptz;
  v_id    bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF p_gatilho NOT IN ('horario', 'login', 'tempo_uso') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gatilho invalido: ' || COALESCE(p_gatilho, '');
  END IF;

  v_prox := public.notificacoes_proxima_ocorrencia(
    p_recorrencia, now(), p_hora_local, p_minuto_local, v_tz
  );

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, hora_local, minuto_local,
    timezone, prioridade, contexto, proxima_execucao, horario, ativo, hora_origem
  )
  VALUES (
    v_aluno, p_tipo, p_recorrencia, p_gatilho, p_titulo, p_corpo, p_hora_local,
    COALESCE(p_minuto_local, 0), v_tz, COALESCE(p_prioridade, 0),
    COALESCE(p_contexto, '{}'::jsonb), v_prox, v_prox, COALESCE(p_ativo, TRUE), 'aluno'
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET recorrencia = EXCLUDED.recorrencia, gatilho = EXCLUDED.gatilho,
        titulo = COALESCE(EXCLUDED.titulo, notificacoes_agendamentos.titulo),
        corpo = COALESCE(EXCLUDED.corpo, notificacoes_agendamentos.corpo),
        -- A tela manda a hora atual também no liga/desliga: só hora ou minuto
        -- DIFERENTES são escolha. Sem isso, desligar e religar congelaria a
        -- hora inferida como se o aluno a tivesse escolhido.
        hora_origem = CASE
          WHEN EXCLUDED.hora_local IS DISTINCT FROM notificacoes_agendamentos.hora_local
            OR EXCLUDED.minuto_local IS DISTINCT FROM notificacoes_agendamentos.minuto_local
          THEN 'aluno'
          ELSE notificacoes_agendamentos.hora_origem
        END,
        hora_local = EXCLUDED.hora_local, minuto_local = EXCLUDED.minuto_local,
        timezone = EXCLUDED.timezone, prioridade = EXCLUDED.prioridade,
        contexto = EXCLUDED.contexto,
        proxima_execucao = EXCLUDED.proxima_execucao,
        horario = EXCLUDED.horario,
        ativo = EXCLUDED.ativo, atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'proxima_execucao', v_prox);
END;
$fn$;

-- Sugestão da IA -> fila, no horário certo. Igual à 20260826_07, mais a escolha do horário.
CREATE OR REPLACE FUNCTION public.notificacoes_ia_promover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz     text;
  v_dia    date;
  v_gat    text;
  v_pend   bigint;
  v_pref   jsonb;
  v_hor    timestamptz;
  v_origem text := 'agora';
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.timezone INTO v_tz
    FROM expo_tokens d
   WHERE d.aluno_id = NEW.aluno_id AND d.ativo
   ORDER BY d.ultima_atividade_em DESC
   LIMIT 1;
  v_tz := public.notificacoes_tz(v_tz);

  -- Sem aparelho registrado nao ha como alcancar o aluno com o app fechado:
  -- a sugestao espera o proximo login em vez de ser entregue no vazio.
  v_gat := COALESCE(NEW.contexto->>'gatilho', 'horario');
  IF v_gat NOT IN ('horario', 'login', 'tempo_uso') THEN
    v_gat := 'horario';
  END IF;
  IF v_gat = 'horario'
     AND NOT EXISTS (SELECT 1 FROM expo_tokens d
                      WHERE d.aluno_id = NEW.aluno_id AND d.ativo) THEN
    v_gat := 'login';
  END IF;

  -- Suporte sai logo. Lembrete vai para a hora em que o aluno costuma estudar;
  -- sem hábito inferido, vale o horário do modelo; sem ele, agora.
  IF NEW.tipo <> 'suporte' THEN
    IF NEW.tipo = 'lembrete' THEN
      v_pref := public.notificacoes_horario_preferido(NEW.aluno_id);
      IF v_pref->>'origem' = 'inferida' THEN
        v_hor := public.notificacoes_proxima_ocorrencia(
          'diaria', now(), (v_pref->>'hora')::smallint, (v_pref->>'minuto')::smallint, v_tz
        );
        v_origem := 'habito';
      END IF;
    END IF;
    IF v_hor IS NULL AND NEW.horario_sugerido IS NOT NULL AND NEW.horario_sugerido > now() THEN
      v_hor := NEW.horario_sugerido;
      v_origem := 'modelo';
    END IF;
  END IF;
  v_hor := public.notificacoes_fora_do_silencio(v_tz, COALESCE(v_hor, now()));
  v_dia := public.notificacoes_dia_local(v_tz, v_hor);

  INSERT INTO notificacoes_pendentes (
    aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade,
    gatilho, expira_em, sugestao_id, dedupe_key
  )
  VALUES (
    NEW.aluno_id, NEW.tipo,
    COALESCE(NEW.contexto, '{}'::jsonb)
      || jsonb_build_object('dia', v_dia::text, 'timezone', v_tz, 'horario_origem', v_origem),
    COALESCE(NEW.titulo, 'TrailUp'), COALESCE(NEW.corpo, ''), v_hor, 'pendente',
    COALESCE(NEW.prioridade, 0), v_gat,
    v_hor + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48)),
    NEW.id,
    public.notificacoes_dedupe_key(NEW.tipo, NEW.contexto->>'motivo', v_dia)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_pend;

  IF v_pend IS NOT NULL THEN
    UPDATE notificacoes_ia
       SET status = 'promovida', promovida_em = now(), pendente_id = v_pend
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Faxina + varredura global (pg_cron). Igual à 20260826_04, mais quem tem pendente de
-- horário vencida: sem isso, a sugestão marcada para a hora habitual esperaria a
-- rotina ou o próximo login.
CREATE OR REPLACE FUNCTION public.notificacoes_varrer(p_limite integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid;
  v_criadas integer := 0;
  v_entregues integer := 0;
  v_ociosa integer := public.notificacoes_cfg_int('sessao_ociosa_min', 15);
BEGIN
  UPDATE aluno_sessoes_app
     SET encerrada_em = atualizado_em, atualizado_em = now()
   WHERE encerrada_em IS NULL
     AND atualizado_em < now() - make_interval(mins => v_ociosa);

  UPDATE notificacoes_pendentes
     SET status = 'expirada', atualizado_em = now()
   WHERE status = 'pendente' AND expira_em IS NOT NULL AND expira_em <= now();

  FOR v_aluno IN
    SELECT DISTINCT x.aluno_id
      FROM (
        SELECT a.aluno_id
          FROM notificacoes_agendamentos a
         WHERE a.ativo AND a.gatilho = 'horario'
           AND a.aluno_id IS NOT NULL
           AND a.proxima_execucao IS NOT NULL AND a.proxima_execucao <= now()
        UNION
        SELECT p.aluno_id
          FROM notificacoes_pendentes p
         WHERE p.status = 'pendente' AND p.gatilho = 'horario'
           AND p.aluno_id IS NOT NULL AND p.horario <= now()
      ) x
     LIMIT GREATEST(1, p_limite)
  LOOP
    v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
    v_entregues := v_entregues + public.notificacoes_entregar(v_aluno, ARRAY['horario']);
  END LOOP;

  RETURN jsonb_build_object('pendentes_criadas', v_criadas, 'entregues', v_entregues);
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_fora_do_silencio(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_perfil_dominante(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_horario_preferido(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_texto_revisao(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_recalcular_rotinas(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_varrer(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_salvar_rotina(text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean) TO authenticated;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.notificacoes_recalcular_rotinas()');
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


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_02_01", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def _sql_do_upgrade(nome: str) -> str:
    """O SQL que o `upgrade()` de outra migração executaria, sem executar."""
    mod = _load(nome)
    coletor = _Coletor()
    original = mod.op
    mod.op = coletor
    try:
        mod.upgrade()
    finally:
        mod.op = original
    return "\n".join(coletor.sql)


def _funcao(texto: str, nome: str, origem: str) -> str:
    """Recorta `CREATE OR REPLACE FUNCTION public.<nome>(...)` até o fim do corpo, da origem.

    Copiar à mão seria uma segunda fonte da verdade; recortar falha alto se a origem mudar de forma.
    """
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{re.escape(nome)}\(.*?\bAS (\$\w*\$)",
        texto,
        re.S,
    )
    if m is None:
        raise RuntimeError(f"{nome} não encontrado em {origem}; revise a 20261102_01")
    fim = texto.find(m.group(1), m.end())
    if fim < 0:
        raise RuntimeError(f"fim de {nome} não encontrado em {origem}; revise a 20261102_01")
    return texto[m.start() : fim + len(m.group(1))] + ";"


# O conflito da `revisao_diaria` em `notificacoes_garantir_rotinas` (20260826_14). É o PRIMEIRO
# dos três iguais na função: as outras duas rotinas continuam reescrevendo o texto fixo.
_CONFLITO_REVISAO = """          ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
            SET timezone = EXCLUDED.timezone,
                titulo = EXCLUDED.titulo,
                corpo = EXCLUDED.corpo,
                atualizado_em = now();"""
_CONFLITO_REVISAO_NOVO = """          -- Titulo e corpo da revisao diaria sao do job (20261102_01): reescrever
          -- aqui trocaria o texto personalizado pelo fixo a cada login.
          ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
            SET timezone = EXCLUDED.timezone,
                atualizado_em = now();"""


def garantir_rotinas_anterior() -> str:
    return _funcao(
        _sql_do_upgrade("20260826_14_notificacoes_texto_pt_br.py"),
        "notificacoes_garantir_rotinas",
        "20260826_14",
    )


def garantir_rotinas_nova() -> str:
    anterior = garantir_rotinas_anterior()
    if anterior.count(_CONFLITO_REVISAO) != 3:
        raise RuntimeError(
            "notificacoes_garantir_rotinas mudou de forma desde a 20260826_14; revise a 20261102_01"
        )
    return anterior.replace(_CONFLITO_REVISAO, _CONFLITO_REVISAO_NOVO, 1)


def anteriores() -> str:
    """As funções como estavam antes desta migração (o downgrade volta a elas)."""
    motor = _load("20260826_04_notificacoes_motor_sql.py").FUNCOES
    expo = _sql_do_upgrade("20260826_07_push_em_expo_tokens.py")
    return "\n".join(
        (
            _funcao(motor, "notificacoes_salvar_rotina", "20260826_04"),
            _funcao(motor, "notificacoes_varrer", "20260826_04"),
            _funcao(expo, "notificacoes_ia_promover", "20260826_07"),
            garantir_rotinas_anterior(),
        )
    )


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(COLUNAS)
    op.execute(TABELA)
    op.execute(sementes())
    op.execute(FUNCOES)
    op.execute(garantir_rotinas_nova())
    op.execute(CRON_SQL)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(CRON_FORA)
    # As funções antigas voltam ANTES de as colunas saírem: a nova `ia_promover` lê
    # `horario_sugerido`, e não pode haver instante em que o gatilho aponte para coluna ausente.
    op.execute(anteriores())
    for assinatura in (
        "notificacoes_recalcular_rotinas(integer)",
        "notificacoes_texto_revisao(uuid)",
        "notificacoes_horario_preferido(uuid)",
        "notificacoes_perfil_dominante(uuid)",
        "notificacoes_fora_do_silencio(text, timestamptz)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{assinatura}")
    op.execute("DROP TABLE IF EXISTS public.notificacoes_modelos_texto")
    op.execute("ALTER TABLE public.notificacoes_ia DROP COLUMN IF EXISTS horario_sugerido")
    op.execute(
        "ALTER TABLE public.notificacoes_agendamentos "
        "DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_hora_origem_chk"
    )
    op.execute("ALTER TABLE public.notificacoes_agendamentos DROP COLUMN IF EXISTS hora_origem")
    op.execute(
        "DELETE FROM public.notificacoes_config WHERE chave IN ("
        "'horario_janela_dias', 'horario_sessao_min_seg', 'horario_min_dias', "
        "'horario_min_dias_na_hora', 'horario_antecedencia_min')"
    )
    op.execute(RELOAD)
