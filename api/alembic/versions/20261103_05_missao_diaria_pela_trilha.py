"""Missão diária sai da trilha da turma: o conteúdo e a atividade em que ela está

## O que ainda estava errado depois de `20261103_04`

A `_04` passou a gerar a diária por turma e a só oferecer o que a turma tem (sem atividade na trilha,
nada de "Conclua atividades"). Mas o que ela pede continuava genérico e sorteado: "Conclua 1 atividade
hoje", "Conclua 1 conteúdo hoje", com o molde e a quantidade escolhidos por `hashtext`. Nada disso diz
**qual** conteúdo nem **qual** atividade, e o professor não reconhece a própria trilha na missão.

## O que muda

**1. O gerador escolhe pelo estado da turma, não por hash.** Para cada turma:

- o **tópico da vez** é o primeiro da trilha (`ordem`, depois `id`) que menos da metade dos alunos
  matriculados concluiu (`topico_aluno.status = 'concluido'`). Turma que já fechou todos os tópicos
  não ganha missão de item — não há o que pedir —, só a de minutos;
- o **conteúdo do dia** é o primeiro conteúdo desse tópico que menos da metade concluiu (se todos já
  passaram da metade, o primeiro do tópico);
- a **atividade do dia** é o mesmo critério sobre as atividades do tópico, sem as de `tipo = 'missao'`
  (essas já são a missão de entrega do professor; repetir viraria duas missões da mesma coisa);
- **minutos de estudo** continua, porque vale para qualquer trilha.

Slots fixos: 1 = conteúdo, 2 = atividade, 3 = minutos. Sem tópico, conteúdo ou atividade, o slot não
nasce. `missao_diaria_min`/`_max` deixam de ser lidas: quem decide quantas é o que a turma tem.

**2. Métrica nova, `item_no_dia`**: `{"metrica": "item_no_dia", "item": "conteudo"|"atividade",
"item_id": N, "topico_id": T, "dia": D, "fuso": F}`. Fecha quando **as duas** coisas valem:

- o item está feito — pelo estado (`conteudo_aluno`/`atividade_aluno` concluído) **ou** pelo evento de
  conclusão com a referência dele. São dois porque nenhum basta sozinho: o app grava `conteudo_aluno`
  direto no Supabase, e o evento `conteudo_concluido` sai da telemetria pela API — que pode estar fora
  do ar —, e já veio com referência nula em produção (13 de 15, ver `repositories/evento.py`);
- houve uma conclusão desse tipo **hoje**. É o que faz a missão ser do dia: sem isso, o aluno que
  fechou o conteúdo semana passada ganharia a diária sem abrir o app.

O aluno que já tinha feito o item, portanto, cumpre concluindo **outro** do mesmo tipo hoje — a
descrição diz isso. Sem essa saída, a missão da turma seria impossível justamente para quem está à
frente.

**3. Gatilho de conclusão.** O laço de missão só rodava em `eventos_aluno`. A conclusão de conteúdo
não passa necessariamente por lá (o evento é da API) e, quando passa, pode chegar **antes** da linha
de `conteudo_aluno` ser gravada — a avaliação veria o item não feito e ninguém a repetiria. Então
`trg_missao_item_concluido` roda o laço de `item_no_dia` quando `conteudo_aluno`/`atividade_aluno`
vira concluído, avisando o avaliador por `concluiu_agora` que a conclusão de hoje é esta. É o molde de
`trg_aluno_atividade_diaria_missao_minutos` (`20261021_20`): mesmo filtro, paga uma vez
(`ON CONFLICT ... WHERE status <> 'concluida'` + `ROW_COUNT`), mesmo sinal `app.missao_premiando`, e
falha vira aviso — missão não derruba a gravação do progresso.

**4. A guarda volta a recusar guilda com métrica que não soma.** A `20261103_02` reescreveu
`fn_missoes_guarda` a partir de uma cópia anterior a `20261021_15`, e a regra da guilda (`22023`)
caiu sem ninguém pedir. Ela volta. O resto do que a `_02` decidiu fica: só a missão do **sistema** é
congelada — a proposta da IA é editável pelo professor (a #881 mudou `podeEditar` no console para
isso, revendo o "recusa e cria a sua" da #151) —, e na diária do sistema o professor ajusta texto
**e** critério, agora também `item_no_dia`.

## Fora daqui

- A reescrita do texto por IA (`missao_diaria_texto.py`) não pega as missões de item: o texto delas já
  cita o conteúdo e o tópico, e o validador de lá conta unidades numéricas, não nomes.
- As missões de hoje já gravadas pela `_04` ficam como estão (`ON CONFLICT DO NOTHING` não as
  substitui). A trilha vale a partir do próximo cron.
- Material personalizado concluído **sem** linha em `conteudo_aluno` e sem evento não conta. Não medi
  se esse caminho existe; se existir, entra no `v_feito`.

Revision ID: 20261103_05
Revises: 20261103_04
Create Date: 2026-11-03
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_05"
down_revision = "20261103_04"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


# A lista de `20261021_15`, de onde vem a regra da guilda. Lida de lá para não haver duas.
_ARRAY_SOMAVEIS = _modulo("20261021_15_missao_de_guilda_soma_os_membros.py")._ARRAY_SOMAVEIS


# Ramo novo do avaliador. Entra ANTES de `eventos_no_dia`, por âncora no corpo que está no banco:
# a função foi redefinida por várias migrações, e reescrevê-la inteira a partir de uma cópia daqui é
# exatamente o erro que a `20261103_02` cometeu com a guarda.
RAMO_ITEM = r"""  ELSIF v_metrica = 'item_no_dia' THEN
    -- 20261103_05. Feito (estado OU evento com a referencia) E uma conclusao do mesmo tipo hoje.
    -- `concluiu_agora` vem de `trg_missao_item_concluido`: a conclusao de hoje e' a que disparou.
    DECLARE
      v_item    text   := lower(COALESCE(p_criterio ->> 'item', ''));
      v_item_id bigint := NULLIF(regexp_replace(COALESCE(p_criterio ->> 'item_id', ''), '[^0-9]', '', 'g'), '')::bigint;
      v_dia     date   := NULLIF(btrim(COALESCE(p_criterio ->> 'dia', '')), '')::date;
      v_fuso    text   := COALESCE(NULLIF(p_criterio ->> 'fuso', ''), 'America/Sao_Paulo');
      v_feito   boolean := false;
      v_hoje    boolean := false;
    BEGIN
      IF v_item = 'conteudo' AND v_item_id IS NOT NULL AND v_dia IS NOT NULL THEN
        v_feito := EXISTS (SELECT 1 FROM public.conteudo_aluno ca
                            WHERE ca.aluno_id = p_aluno AND ca.conteudo_id = v_item_id
                              AND position('concl' in lower(COALESCE(ca.status::text, ''))) > 0)
                OR EXISTS (SELECT 1 FROM public.eventos_aluno e
                            WHERE e.aluno_id = p_aluno AND e.tipo = 'conteudo_concluido'
                              AND e.referencia = 'conteudo:' || v_item_id::text);
        v_hoje := COALESCE(v_ag ->> 'concluiu_agora', '') = 'conteudo'
                  OR EXISTS (SELECT 1 FROM public.eventos_aluno e
                              WHERE e.aluno_id = p_aluno AND e.tipo = 'conteudo_concluido'
                                AND (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE v_fuso)::date = v_dia);
      ELSIF v_item = 'atividade' AND v_item_id IS NOT NULL AND v_dia IS NOT NULL THEN
        v_feito := EXISTS (SELECT 1 FROM public.atividade_aluno aa
                            WHERE aa.aluno_id = p_aluno AND aa.atividade_id = v_item_id
                              AND position('concl' in lower(COALESCE(aa.status::text, ''))) > 0)
                OR EXISTS (SELECT 1 FROM public.eventos_aluno e
                            WHERE e.aluno_id = p_aluno AND e.tipo = 'atividade_concluida'
                              AND e.referencia = 'atividade:' || v_item_id::text);
        v_hoje := COALESCE(v_ag ->> 'concluiu_agora', '') = 'atividade'
                  OR EXISTS (SELECT 1 FROM public.eventos_aluno e
                              WHERE e.aluno_id = p_aluno
                                AND e.tipo IN ('atividade_concluida', 'atividade_acertada',
                                               'topico_atividade_concluida', 'topico_atividade_acertada')
                                AND (e.criado_em AT TIME ZONE 'UTC' AT TIME ZONE v_fuso)::date = v_dia);
      END IF;
      v_ok := v_feito AND v_hoje;
    END;

"""

_ANCORA_AVALIADOR = "  ELSIF v_metrica = 'eventos_no_dia' THEN"

AVALIADOR = f"""
DO $migracao$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.proname = 'fn_avaliar_metrica' AND p.pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_avaliar_metrica nao existe';
  END IF;
  IF position('item_no_dia' IN v_def) > 0 THEN
    RETURN;  -- ja aplicada
  END IF;
  IF (length(v_def) - length(replace(v_def, $a${_ANCORA_AVALIADOR}$a$, ''))) / length($a${_ANCORA_AVALIADOR}$a$) <> 1 THEN
    RAISE EXCEPTION 'ancora de eventos_no_dia ausente ou repetida em fn_avaliar_metrica';
  END IF;
  EXECUTE replace(v_def, $a${_ANCORA_AVALIADOR}$a$, $r${RAMO_ITEM}{_ANCORA_AVALIADOR}$r$);
END;
$migracao$;
"""


GUARDA = f"""
CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
DECLARE
  v_metrica text;
  v_texto_llm boolean;
  v_diaria boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Missao nasce com o texto de quem a escreveu; "ja enriquecida" nao e estado de nascimento.
    NEW.texto_molde          := NULL;
    NEW.texto_enriquecido_em := NULL;
    NEW.texto_modelo         := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Imutaveis sempre: identidade e origem da missao nao mudam por UPDATE.
    NEW.classe_id   := OLD.classe_id;
    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    NEW.perfil_alvo := OLD.perfil_alvo;
    NEW.criado_em   := OLD.criado_em;

    -- A reescrita da fase 6, pelo sinal que so' `fn_missao_diaria_reescrever_texto` liga.
    v_texto_llm := COALESCE(current_setting('app.missao_texto_llm', true), '') = 'on'
                   AND current_user NOT IN ('authenticated', 'anon')
                   AND OLD.origem = 'sistema'
                   AND OLD.dia IS NOT NULL;

    -- A diaria do sistema: o professor ajusta texto e meta (20261103_02).
    v_diaria := OLD.origem = 'sistema' AND OLD.dia IS NOT NULL;

    -- So' o que o banco gerou e' congelado (20261103_02): a proposta da IA o professor edita.
    -- Da diaria do sistema ele ajusta texto e criterio; o resto dela e' do gerador.
    IF OLD.origem = 'sistema' THEN
      IF NOT v_diaria AND NOT v_texto_llm THEN
        NEW.titulo    := OLD.titulo;
        NEW.descricao := OLD.descricao;
      END IF;
      IF NOT v_diaria THEN
        NEW.criterio := OLD.criterio;
      END IF;
      NEW.recompensa_tipo     := OLD.recompensa_tipo;
      NEW.janela_inicio       := OLD.janela_inicio;
      NEW.janela_fim          := OLD.janela_fim;
      NEW.escopo              := OLD.escopo;
      NEW.atividade_origem_id := OLD.atividade_origem_id;
    END IF;

    IF NOT v_texto_llm THEN
      NEW.texto_molde          := OLD.texto_molde;
      NEW.texto_enriquecido_em := OLD.texto_enriquecido_em;
      NEW.texto_modelo         := OLD.texto_modelo;
    END IF;

    NEW.atualizado_em := now();
  END IF;

  v_metrica := NEW.criterio ->> 'metrica';
  IF v_metrica IS NULL THEN
    RAISE EXCEPTION 'A missao precisa de criterio.metrica.' USING ERRCODE = '22023';
  END IF;
  -- As de DELTA e as de item sao de missao, nao de conquista: entram aqui pelo nome.
  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia', 'item_no_dia')
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN
    RAISE EXCEPTION 'Metrica nao suportada: %.', v_metrica USING ERRCODE = '22023';
  END IF;
  IF v_metrica = 'atividade_especifica'
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'atividade_id', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.atividade_id e obrigatorio em atividade_especifica.' USING ERRCODE = '22023';
  END IF;
  -- Sem `dia` o avaliador compara com NULL e a missao nunca completa, em silencio.
  IF v_metrica IN ('minutos_no_dia', 'eventos_no_dia', 'item_no_dia')
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'dia', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.dia e obrigatorio em %.', v_metrica USING ERRCODE = '22023';
  END IF;
  -- Item sem tipo ou sem id: o avaliador devolve falso para sempre, sem erro nenhum.
  IF v_metrica = 'item_no_dia'
     AND (COALESCE(NEW.criterio ->> 'item', '') NOT IN ('conteudo', 'atividade')
          OR NULLIF(regexp_replace(COALESCE(NEW.criterio ->> 'item_id', ''), '[^0-9]', '', 'g'), '') IS NULL) THEN
    RAISE EXCEPTION 'item_no_dia precisa de criterio.item (conteudo|atividade) e criterio.item_id.'
      USING ERRCODE = '22023';
  END IF;

  -- Missao de guilda soma o progresso dos membros (20261021_15). So' contagem e tempo somam:
  -- percentual somado passa de 100, sequencia somada nao e' de ninguem.
  IF NEW.escopo = 'guilda' AND v_metrica <> ALL ({_ARRAY_SOMAVEIS}) THEN
    RAISE EXCEPTION 'Missao de guilda soma o progresso dos membros; a metrica % nao soma.', v_metrica
      USING ERRCODE = '22023';
  END IF;

  -- Recompensa e chave de `eventos_pontuacao`, nao numero. Tipo inexistente valeria zero em
  -- silencio (`fn_pontos_do_evento` devolve 0 para desconhecido), e a missao pareceria paga.
  IF NOT EXISTS (SELECT 1 FROM public.eventos_pontuacao ep WHERE ep.tipo = NEW.recompensa_tipo) THEN
    RAISE EXCEPTION 'recompensa_tipo % nao existe em eventos_pontuacao.', NEW.recompensa_tipo
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missoes_guarda() FROM PUBLIC, anon, authenticated;
"""


GERADOR = r"""
-- A assinatura e' (date, uuid) desde 20261102_14. Recriar so' (date) deixaria as duas e toda
-- chamada com uma data ficaria ambigua (derrubou a subida da API em 03/11). Uma (date) que
-- tenha sobrado sai antes.
DROP FUNCTION IF EXISTS public.fn_missao_diaria_gerar(date);
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar(p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fuso      text := 'America/Sao_Paulo';
  v_dia       date := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_inicio    timestamptz := (v_dia::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim       timestamptz := ((v_dia + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_minutos   int := public.fn_app_config_int('missao_diaria_minutos', 10);
  v_classe    bigint;
  v_alunos    int;
  v_topico    record;
  v_conteudo  record;
  v_atividade record;
  v_moldes    jsonb;
  v_molde     jsonb;
  v_total     int := 0;
BEGIN
  FOR v_classe IN
    SELECT DISTINCT ca.classe_id
      FROM public.classe_aluno ca
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
       AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)  -- troca de perfil (20261102_14)
  LOOP
    SELECT count(DISTINCT ca.aluno_id)::int INTO v_alunos
      FROM public.classe_aluno ca WHERE ca.classe_id = v_classe;

    -- O topico da vez: o primeiro da trilha que menos da metade da turma concluiu.
    SELECT t.id, COALESCE(NULLIF(btrim(t.nome), ''), 'Tópico ' || t.id) AS nome
      INTO v_topico
      FROM public.topicos t
     WHERE t.classe_id = v_classe
       AND (SELECT count(*) FROM public.topico_aluno ta
              JOIN public.classe_aluno ca ON ca.aluno_id = ta.aluno_id AND ca.classe_id = v_classe
             WHERE ta.topico_id = t.id AND ta.status::text = 'concluido') * 2 < v_alunos
     ORDER BY t.ordem NULLS LAST, t.id
     LIMIT 1;

    v_moldes := '[]'::jsonb;

    IF v_topico.id IS NOT NULL THEN
      -- O primeiro conteudo do topico que menos da metade concluiu; se todos ja passaram, o primeiro.
      SELECT c.id, COALESCE(NULLIF(btrim(c.titulo), ''), 'Conteúdo ' || c.id) AS titulo
        INTO v_conteudo
        FROM public.conteudos c
       WHERE c.topico_id = v_topico.id
       ORDER BY (SELECT count(*) FROM public.conteudo_aluno x
                   JOIN public.classe_aluno ca ON ca.aluno_id = x.aluno_id AND ca.classe_id = v_classe
                  WHERE x.conteudo_id = c.id AND x.status::text = 'concluido') * 2 >= v_alunos,
                c.ordem NULLS LAST, c.id
       LIMIT 1;

      IF v_conteudo.id IS NOT NULL THEN
        v_moldes := v_moldes || jsonb_build_array(jsonb_build_object(
          'slot', 1,
          'titulo', 'Conteúdo do dia',
          'descricao', 'Conclua o conteúdo “' || left(v_conteudo.titulo, 80) || '”, do tópico “'
                       || left(v_topico.nome, 60) || '”. Se já o concluiu, vale concluir outro conteúdo hoje.',
          'criterio', jsonb_build_object('metrica', 'item_no_dia', 'item', 'conteudo',
                        'item_id', v_conteudo.id, 'topico_id', v_topico.id, 'dia', v_dia, 'fuso', v_fuso)));
      END IF;

      -- Mesma regra nas atividades, sem as que ja sao a entrega de uma missao do professor.
      SELECT a.id, COALESCE(NULLIF(btrim(a.titulo), ''), 'Atividade ' || a.id) AS titulo
        INTO v_atividade
        FROM public.atividades a
       WHERE a.topico_id = v_topico.id
         AND COALESCE(a.tipo, '') <> 'missao'
       ORDER BY (SELECT count(*) FROM public.atividade_aluno x
                   JOIN public.classe_aluno ca ON ca.aluno_id = x.aluno_id AND ca.classe_id = v_classe
                  WHERE x.atividade_id = a.id AND x.status::text = 'concluido') * 2 >= v_alunos,
                a.id
       LIMIT 1;

      IF v_atividade.id IS NOT NULL THEN
        v_moldes := v_moldes || jsonb_build_array(jsonb_build_object(
          'slot', 2,
          'titulo', 'Atividade do dia',
          'descricao', 'Faça a atividade “' || left(v_atividade.titulo, 80) || '”, do tópico “'
                       || left(v_topico.nome, 60) || '”. Se já a concluiu, vale concluir outra atividade hoje.',
          'criterio', jsonb_build_object('metrica', 'item_no_dia', 'item', 'atividade',
                        'item_id', v_atividade.id, 'topico_id', v_topico.id, 'dia', v_dia, 'fuso', v_fuso)));
      END IF;
    END IF;

    -- Tempo de estudo vale para qualquer trilha, inclusive a que a turma ja fechou.
    v_moldes := v_moldes || jsonb_build_array(jsonb_build_object(
      'slot', 3,
      'titulo', 'Seu tempo de estudo',
      'descricao', 'Estude por ' || v_minutos || ' minutos hoje.',
      'criterio', jsonb_build_object('metrica', 'minutos_no_dia', 'minutos', v_minutos, 'dia', v_dia)));

    FOR v_molde IN SELECT value FROM jsonb_array_elements(v_moldes) LOOP
      INSERT INTO public.missoes (
        classe_id, origem, escopo, titulo, descricao, criterio, recompensa_tipo,
        janela_inicio, janela_fim, dia, slot, perfil_alvo, aprovacao, ativa
      ) VALUES (
        v_classe, 'sistema', 'aluno', v_molde ->> 'titulo', v_molde ->> 'descricao',
        v_molde -> 'criterio', 'missao_diaria_concluida', v_inicio, v_fim, v_dia,
        (v_molde ->> 'slot')::int, NULL, 'nao_requer', true
      )
      -- Predicado repetido: sem ele o Postgres nao casa o indice PARCIAL.
      ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL
      DO NOTHING;
      IF FOUND THEN v_total := v_total + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date, uuid) FROM PUBLIC, anon, authenticated;
"""


GATILHO_ITEM = r"""
CREATE OR REPLACE FUNCTION public.trg_missao_item_concluido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_aluno_id      uuid := NEW.aluno_id;
  v_item          text := TG_ARGV[0];
  v_missao        record;
  v_mudou         integer;
  v_perfil_missao text;
BEGIN
  IF v_aluno_id IS NULL OR position('concl' in lower(COALESCE(NEW.status::text, ''))) = 0 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(current_setting('app.missao_premiando', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- So' `item_no_dia` do tipo que acabou de ser concluido. Falha aqui nao derruba o progresso.
  BEGIN
    v_perfil_missao := public.fn_perfil_da_missao(v_aluno_id);

    FOR v_missao IN
      SELECT m.id, m.criterio, m.recompensa_tipo
        FROM public.missoes m
       WHERE m.ativa
         AND m.escopo <> 'guilda'
         AND m.criterio ->> 'metrica' = 'item_no_dia'
         AND m.criterio ->> 'item' = v_item
         AND m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
         AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
         AND (m.janela_fim    IS NULL OR m.janela_fim    >= now())
         AND m.classe_id IN (
               SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno_id
             )
         AND (m.perfil_alvo IS NULL OR lower(m.perfil_alvo) = v_perfil_missao)
         AND NOT EXISTS (
               SELECT 1 FROM public.missao_aluno ma
                WHERE ma.aluno_id = v_aluno_id AND ma.missao_id = m.id AND ma.status = 'concluida'
             )
    LOOP
      IF public.fn_avaliar_metrica(v_aluno_id, jsonb_build_object('concluiu_agora', v_item), v_missao.criterio) THEN
        -- Paga uma vez: so' quando a linha de fato virou concluida agora.
        INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)
        VALUES (v_aluno_id, v_missao.id, 'concluida', 100, now())
        ON CONFLICT (aluno_id, missao_id) DO UPDATE
          SET status = 'concluida', progresso = 100, concluida_em = now(), updated_at = now()
          WHERE public.missao_aluno.status <> 'concluida';
        GET DIAGNOSTICS v_mudou = ROW_COUNT;

        IF v_mudou > 0 AND v_missao.recompensa_tipo IS NOT NULL THEN
          PERFORM set_config('app.missao_premiando', 'on', true);
          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
          VALUES (v_aluno_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());
          PERFORM set_config('app.missao_premiando', '', true);
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.missao_premiando', '', true);
    RAISE WARNING 'avaliacao de missao de item do aluno % falhou: %', v_aluno_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_missao_item_concluido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conteudo_aluno_missao_item ON public.conteudo_aluno;
CREATE TRIGGER trg_conteudo_aluno_missao_item
  AFTER INSERT OR UPDATE OF status ON public.conteudo_aluno
  FOR EACH ROW
  WHEN (NEW.status::text = 'concluido')
  EXECUTE FUNCTION public.trg_missao_item_concluido('conteudo');

DROP TRIGGER IF EXISTS trg_atividade_aluno_missao_item ON public.atividade_aluno;
CREATE TRIGGER trg_atividade_aluno_missao_item
  AFTER INSERT OR UPDATE OF status ON public.atividade_aluno
  FOR EACH ROW
  WHEN (NEW.status::text = 'concluido')
  EXECUTE FUNCTION public.trg_missao_item_concluido('atividade');
"""

SEM_GATILHO_ITEM = """
DROP TRIGGER IF EXISTS trg_atividade_aluno_missao_item ON public.atividade_aluno;
DROP TRIGGER IF EXISTS trg_conteudo_aluno_missao_item ON public.conteudo_aluno;
DROP FUNCTION IF EXISTS public.trg_missao_item_concluido();
"""


def upgrade() -> None:
    op.execute(AVALIADOR)
    op.execute(GUARDA)
    op.execute(GERADOR)
    op.execute(GATILHO_ITEM)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(SEM_GATILHO_ITEM)
    op.execute(_modulo("20261103_04_missoes_diarias_por_turma.py").GERADOR)
    op.execute(_modulo("20261103_02_editar_texto_missao_diaria.py")._funcao(permitir_texto_diario=True))
    # O ramo `item_no_dia` do avaliador fica: e' aditivo, e sem missao que o use nunca roda.
    op.execute("NOTIFY pgrst, 'reload schema'")
