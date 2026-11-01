"""A alteração do professor em conteúdo ou atividade já vista chega ao aluno, e a IA decide a revisão

## Por quê

O editor de trilha grava direto em `conteudos`, `cards`, `atividades` e `questoes`, e o banco já
reagia a isso enfileirando a regeração do material (`fn_enqueue_class_delta_job`). Quem já tinha
aberto ou feito o item não ficava sabendo de nada: um gabarito corrigido, uma questão nova ou um
enunciado reescrito passavam calados, e a nota antiga continuava valendo sobre uma atividade que
não existia mais daquele jeito.

## Decisões de produto (01/11, Geisbelly)

1. **Relevância é da IA.** Toda mudança em texto, anexo, card, questão, alternativa, gabarito, pontos
   ou prazo entra na análise. A IA classifica como `cosmetica` (erro de digitação: sem destaque nem
   aviso) ou relevante.
2. **A revisão é decidida por aluno.** A IA olha o perfil e o desempenho de cada um e decide se aquele
   aluno precisa revisar a atividade. Vale para questão já respondida que mudou e para questão nova.
3. **Nota: a antiga vale até revisar; depois, a maior das duas.** Questão nova só entra na conta
   depois de respondida (a nota da atividade é a que o app grava ao responder).
4. **Gabarito corrigido: o banco recorrige as respostas guardadas, e a nota só sobe.**
5. **A decisão vale na hora; o professor vê o motivo e pode desfazer.**

Premissas, não perguntadas: a revisão é gratuita e não consome a segunda chance; revisão pendente
não vira 0 por prazo (quem a tem já entregou, e a regra do prazo só pega quem não entregou);
o destaque some quando o aluno abre o item; reordenar e cor de card não contam.

## O que muda

- `alteracao_professor`: uma linha por item alterado (conteúdo ou atividade), com o que mudou
  (`mudancas`: antes e depois só dos campos que mudaram), a classificação e o resumo da IA, e a fila
  da análise (`proxima_tentativa_em`, `tentativas`, `travado_em`, `ultimo_erro`).
- `alteracao_aluno`: uma linha por aluno que já tinha visto (`viu`) ou feito (`fez`) o item, com a
  decisão da IA (`decisao`), a do professor (`decisao_professor`), a que vale (`decisao_efetiva`,
  gerada), a nota de antes (`nota_anterior`/`maxima_anterior`), o destaque visto (`vista_em`) e a
  revisão feita (`revisada_em`).
- `fn_alteracao_professor_registrar()` (gatilho AFTER, por linha, nas quatro tabelas do editor e em
  `questao_gabarito`): registra a mudança, os alunos e, se o gabarito mudou, recorrige.
- Worker da API (`service_role`): `fn_alteracao_reivindicar`, `fn_alteracao_falhou`,
  `fn_alteracao_contexto` e `fn_alteracao_registrar_decisao`. Analisar é IA e fica na API; enfileirar,
  espaçar tentativas, decidir quem é afetado e entregar fica aqui.
- `alteracao_decidir` (professor) e `alteracao_marcar_vista` (aluno): RPCs do console e do app.
- O aviso sai pelo motor que já existe: `trg_alteracao_aluno_notificar` insere em `notificacoes_ia`, e
  `trg_notificacoes_ia_promover` leva à fila e à caixa de entrada. Nenhum caminho novo de entrega.
- `trailup_recalcular_nota_classe_aluno` passa a considerar a nota guardada quando a revisão foi
  pedida: vale a maior entre ela e a atual, na proporção dos pontos.

### Quem conta como "já viu" ou "já fez"

Só matriculados na turma. `conteudo_aluno` existe para todo matriculado (provisão da estrutura),
então a linha não basta: vale status diferente de `não iniciado`, percentual ou tempo maior que zero.
Na atividade, `fez` é concluída, com nota ou com resposta em `questao_aluno`.

### Só o professor da turma

O gatilho só registra quando quem grava é o dono da turma (`auth.uid()` = `classe.professor_id`).
A API grava como `service_role`, sem sessão, e não entra: enriquecimento, boss e regeração mexem em
`metadata` e não são alteração do professor. Cópia de turma não tem aluno, então também não entra.

### Coalescência

O editor salva várias linhas de uma vez (uma atividade com dez questões são onze UPDATEs). Enquanto
a análise não começou (`status = 'pendente_analise'` e sem trava), uma mudança nova no mesmo item se
junta à linha pendente e empurra a análise em `FOLGA` minutos. Linha já reivindicada pelo worker
não recebe mais nada: a mudança seguinte abre outra.

### Sem modelo, nada é inventado

Falha da análise espaça a próxima tentativa (`2^n` min, até `ESPERA_MAXIMA_MIN`). Depois de
`MAX_TENTATIVAS` a linha para de ser reivindicada e continua `pendente_analise`: o aluno não vê
destaque, e o professor vê a pendência no console e pode decidir à mão (`alteracao_decidir`).

### Gabarito (decisão 4)

Recorrigir só é seguro quando a resposta guardada casa sem ambiguidade com o gabarito novo. Só
questões objetivas de resposta única (`fn_alteracao_questao_objetiva`), comparando os dois lados
pela mesma normalização da correção do banco (`fn_questao_gabarito_em_texto` e
`fn_texto_comparavel`). Só vira `correta = true` o que estava `false`: quem acertou pelo gabarito
errado não perde. A atividade ganha os pontos da questão na tentativa que valeu; nunca perde.

### Revisão feita

A revisão conta como feita quando o aluno responde de novo, depois do pedido, as questões que
mudaram (ou todas, se a mudança foi na atividade e não nas questões). Atividade sem questão não
tem como ser refeita pelo app: a IA pode pedir, mas vira só destaque.

### Por que `SECURITY DEFINER`

O gatilho roda no papel de quem salva (`authenticated`), sem GRANT nas tabelas novas, e precisa ler
progresso de todos os alunos da turma. As funções do worker são só de `service_role`. As duas RPCs
de cliente conferem a sessão (`auth.uid()`) e a posse antes de tocar em linha.

### RLS

`alteracao_professor` (com o gabarito antes e depois): só o professor da turma lê. O aluno nunca
lê esta tabela. `alteracao_aluno`: o aluno lê as próprias linhas, o professor as da turma dele.
Ninguém escreve direto: só pelas RPCs. O `motivo` da IA é visível ao próprio aluno, e o prompt é
instruído a escrevê-lo como se o aluno fosse ler.

Revision ID: 20261101_12
Revises: 20261101_11
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_12"
down_revision = "20261101_11"
branch_labels = None
depends_on = None

FOLGA_MIN = 2
MAX_TENTATIVAS = 8
ESPERA_MAXIMA_MIN = 360
TIPOS_OBJETIVOS: tuple[str, ...] = (
    "multiple_choice",
    "multipla_escolha",
    "múltipla escolha",
    "multipla escolha",
    "true_false",
    "true or false",
    "true_or_false",
    "truefalse",
    "verdadeiro_falso",
    "verdadeiro ou falso",
    "verdadeiro/falso",
    "booleano",
)

CAMPOS = {
    "conteudos": ("titulo", "tipo", "conteudo", "metadata"),
    "cards": ("titulo", "descricao", "imagem_url"),
    "atividades": ("titulo", "descricao", "tipo", "pontuacao_maxima", "data_entrega", "metadata"),
    "questoes": ("enunciado", "tipo", "alternativas", "midia_url", "nota_estabelecida"),
}
TABELAS_DO_EDITOR = ("conteudos", "cards", "atividades", "questoes")


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def _array(valores: tuple[str, ...]) -> str:
    return f"ARRAY[{_lista(valores)}]::text[]"


TABELAS = f"""
CREATE TABLE IF NOT EXISTS public.alteracao_professor (
  id                   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classe_id            bigint NOT NULL REFERENCES public.classe (id) ON DELETE CASCADE,
  topico_id            bigint NOT NULL REFERENCES public.topicos (id) ON DELETE CASCADE,
  alvo_tipo            text NOT NULL CHECK (alvo_tipo IN ('conteudo', 'atividade')),
  conteudo_id          bigint REFERENCES public.conteudos (id) ON DELETE CASCADE,
  atividade_id         bigint REFERENCES public.atividades (id) ON DELETE CASCADE,
  mudancas             jsonb NOT NULL DEFAULT '[]'::jsonb,
  status               text NOT NULL DEFAULT 'pendente_analise'
                       CHECK (status IN ('pendente_analise', 'analisada')),
  classificacao        text CHECK (classificacao IN ('cosmetica', 'relevante')),
  resumo               text,
  motivo               text,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now() + interval '{FOLGA_MIN} minutes',
  tentativas           integer NOT NULL DEFAULT 0,
  travado_em           timestamptz,
  ultimo_erro          text,
  criada_em            timestamptz NOT NULL DEFAULT now(),
  atualizada_em        timestamptz NOT NULL DEFAULT now(),
  analisada_em         timestamptz,
  CONSTRAINT alteracao_professor_alvo_chk CHECK (
    (alvo_tipo = 'conteudo' AND conteudo_id IS NOT NULL AND atividade_id IS NULL)
    OR (alvo_tipo = 'atividade' AND atividade_id IS NOT NULL AND conteudo_id IS NULL))
);
CREATE INDEX IF NOT EXISTS alteracao_professor_fila_idx
  ON public.alteracao_professor (proxima_tentativa_em) WHERE status = 'pendente_analise';
CREATE INDEX IF NOT EXISTS alteracao_professor_classe_idx
  ON public.alteracao_professor (classe_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS alteracao_professor_conteudo_idx
  ON public.alteracao_professor (conteudo_id) WHERE conteudo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alteracao_professor_atividade_idx
  ON public.alteracao_professor (atividade_id) WHERE atividade_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.alteracao_aluno (
  id                    bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  alteracao_id          bigint NOT NULL REFERENCES public.alteracao_professor (id) ON DELETE CASCADE,
  aluno_id              uuid NOT NULL REFERENCES public.alunos (id) ON DELETE CASCADE,
  classe_id             bigint NOT NULL REFERENCES public.classe (id) ON DELETE CASCADE,
  topico_id             bigint NOT NULL,
  conteudo_id           bigint,
  atividade_id          bigint,
  situacao              text NOT NULL CHECK (situacao IN ('viu', 'fez')),
  decisao               text NOT NULL DEFAULT 'pendente_analise'
                        CHECK (decisao IN ('pendente_analise', 'cosmetica', 'destacar', 'revisar')),
  decisao_professor     text CHECK (decisao_professor IN ('cosmetica', 'destacar', 'revisar')),
  decisao_efetiva       text GENERATED ALWAYS AS (COALESCE(decisao_professor, decisao)) STORED,
  motivo                text,
  resumo                text,
  recorrigida           boolean NOT NULL DEFAULT false,
  revisar_desde         timestamptz,
  nota_anterior         numeric,
  maxima_anterior       numeric,
  nota_registrada_em    timestamptz,
  revisada_em           timestamptz,
  vista_em              timestamptz,
  notificada_como       text CHECK (notificada_como IN ('destacar', 'revisar')),
  decidida_em           timestamptz,
  decisao_professor_em  timestamptz,
  decisao_professor_por uuid,
  criada_em             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alteracao_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS alteracao_aluno_aluno_idx
  ON public.alteracao_aluno (aluno_id, classe_id);
CREATE INDEX IF NOT EXISTS alteracao_aluno_atividade_idx
  ON public.alteracao_aluno (aluno_id, atividade_id) WHERE atividade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alteracao_aluno_classe_idx
  ON public.alteracao_aluno (classe_id);

COMMENT ON TABLE public.alteracao_professor IS
  'O que o professor mudou num conteudo ou atividade que algum aluno ja tinha visto ou feito, e a
   analise da IA. Fila do worker da API. Guarda o gabarito antes e depois: o aluno nao le.';
COMMENT ON TABLE public.alteracao_aluno IS
  'O efeito de uma alteracao do professor em cada aluno: destaque, revisao pedida, nota de antes.
   Decisao da IA em decisao; a do professor, quando ha, em decisao_professor; vale decisao_efetiva.';

ALTER TABLE public.alteracao_professor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alteracao_aluno ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alteracao_professor, public.alteracao_aluno FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.alteracao_professor, public.alteracao_aluno TO authenticated;
GRANT ALL ON TABLE public.alteracao_professor, public.alteracao_aluno TO service_role;

DROP POLICY IF EXISTS alteracao_professor_professor_sel ON public.alteracao_professor;
CREATE POLICY alteracao_professor_professor_sel ON public.alteracao_professor
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS alteracao_aluno_sel ON public.alteracao_aluno;
CREATE POLICY alteracao_aluno_sel ON public.alteracao_aluno
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));

INSERT INTO public.retencao_politica
  (tabela, acao, coluna_tempo, coluna_aluno, dias, ordem, categoria, motivo)
VALUES
  ('alteracao_aluno', 'saida_turma', NULL, 'aluno_id', 365, 140, 'saida_turma',
   'nota de antes da revisao e decisao da IA sobre o aluno naquela turma; vale o ano letivo')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

DIFF = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_diff(p_antes jsonb, p_depois jsonb, p_campos text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public, pg_temp
AS $function$
  -- Só os campos que mudaram, com o valor de antes e o de depois. NULL quando nada mudou.
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
           'campos', jsonb_agg(c ORDER BY c),
           'antes',  jsonb_object_agg(c, COALESCE(p_antes -> c, 'null'::jsonb)),
           'depois', jsonb_object_agg(c, COALESCE(p_depois -> c, 'null'::jsonb))) END
    FROM unnest(p_campos) AS c
   WHERE (p_antes -> c) IS DISTINCT FROM (p_depois -> c);
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_diff(jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
"""

OBJETIVA = f"""
CREATE OR REPLACE FUNCTION public.fn_alteracao_questao_objetiva(p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public, pg_temp
AS $function$
  SELECT lower(btrim(COALESCE(p_tipo, ''))) IN ({_lista(TIPOS_OBJETIVOS)});
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_questao_objetiva(text) FROM PUBLIC, anon, authenticated;
"""


AFETADOS = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_alunos_afetados(
  p_classe bigint, p_conteudo bigint, p_atividade bigint
)
 RETURNS TABLE (aluno_id uuid, situacao text)
 LANGUAGE sql
 STABLE
 SET search_path = public, pg_temp
AS $function$
  -- conteudo_aluno existe para todo matriculado (provisao da estrutura): a linha nao prova que viu.
  SELECT ca.aluno_id,
         CASE WHEN ca.status::text = 'concluido' THEN 'fez' ELSE 'viu' END
    FROM public.conteudo_aluno ca
   WHERE p_conteudo IS NOT NULL
     AND ca.conteudo_id = p_conteudo
     AND ca.aluno_id IN (SELECT m.aluno_id FROM public.classe_aluno m WHERE m.classe_id = p_classe)
     AND (COALESCE(ca.status::text, '') NOT IN ('', 'não iniciado')
          OR COALESCE(ca.percentual_concluido, 0) > 0
          OR COALESCE(ca.tempo_gasto_min, 0) > 0)
  UNION ALL
  SELECT m.aluno_id,
         CASE WHEN aa.status::text = 'concluido' OR aa.pontuacao_obtida IS NOT NULL OR x.respondeu
              THEN 'fez' ELSE 'viu' END
    FROM public.classe_aluno m
    LEFT JOIN public.atividade_aluno aa ON aa.aluno_id = m.aluno_id AND aa.atividade_id = p_atividade
    CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.questao_aluno qa
                      WHERE qa.aluno_id = m.aluno_id AND qa.atividade_id = p_atividade) AS respondeu
    ) x
   WHERE p_atividade IS NOT NULL
     AND m.classe_id = p_classe
     AND m.aluno_id IS NOT NULL
     AND (COALESCE(aa.status::text, '') NOT IN ('', 'não iniciado')
          OR aa.pontuacao_obtida IS NOT NULL
          OR COALESCE(aa.percentual_concluido, 0) > 0
          OR x.respondeu);
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_alunos_afetados(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
"""

ACERTO_MEDIO = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_acerto_medio(p_aluno uuid, p_atividade bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path = public, pg_temp
AS $function$
  -- A mesma conta do app (QuestionActivity): media dos acertos das questoes respondidas, cada uma
  -- pela tentativa mais recente.
  SELECT avg(COALESCE(u.acertos_percentual, CASE WHEN u.correta THEN 100 ELSE 0 END))
    FROM (
      SELECT DISTINCT ON (qa.questao_id) qa.acertos_percentual, qa.correta
        FROM public.questao_aluno qa
       WHERE qa.aluno_id = p_aluno AND qa.atividade_id = p_atividade
       ORDER BY qa.questao_id, qa.tentativa DESC, qa.criado_em DESC
    ) u;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_acerto_medio(uuid, bigint) FROM PUBLIC, anon, authenticated;
"""

RECORRIGIR = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_recorrigir_questao(p_questao_id bigint, p_gabarito text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_atividade bigint;
  v_alts      jsonb;
  v_tipo      text;
  v_gab       text;
  v_aluno     uuid;
  v_antes     numeric;
  v_depois    numeric;
  v_obtida    numeric;
  v_acertos   numeric;
  v_maximo    numeric;
  v_bruto     numeric;
  v_fator     numeric;
BEGIN
  SELECT q.atividade_id, q.alternativas, q.tipo::text INTO v_atividade, v_alts, v_tipo
    FROM public.questoes q WHERE q.id = p_questao_id;
  IF NOT FOUND OR btrim(COALESCE(p_gabarito, '')) = '' THEN RETURN; END IF;
  -- Só objetiva de resposta única: casar a resposta guardada com o gabarito novo tem de ser certo.
  IF NOT public.fn_alteracao_questao_objetiva(v_tipo) THEN RETURN; END IF;

  v_gab := public.fn_texto_comparavel(public.fn_questao_gabarito_em_texto(v_alts, p_gabarito));
  IF COALESCE(v_gab, '') = '' THEN RETURN; END IF;

  FOR v_aluno IN
    SELECT DISTINCT qa.aluno_id
      FROM public.questao_aluno qa
     WHERE qa.questao_id = p_questao_id
       AND qa.correta = false
       AND public.fn_texto_comparavel(public.fn_questao_gabarito_em_texto(v_alts, qa.resposta)) = v_gab
  LOOP
    v_antes := public.fn_alteracao_acerto_medio(v_aluno, v_atividade);

    -- Só sobe: o que estava errado e casa com o gabarito novo vira certo; o que estava certo fica.
    -- O peso é o que o app daria: 20 com o gabarito já visto, 50 em nova tentativa, senão 100.
    UPDATE public.questao_aluno qa
       SET correta = true,
           acertos_percentual = CASE
             WHEN EXISTS (SELECT 1 FROM public.questao_gabarito_revelado r
                           WHERE r.aluno_id = qa.aluno_id AND r.questao_id = qa.questao_id) THEN 20
             WHEN qa.tentativa > 1 THEN 50
             ELSE 100 END
     WHERE qa.questao_id = p_questao_id
       AND qa.aluno_id = v_aluno
       AND qa.correta = false
       AND public.fn_texto_comparavel(public.fn_questao_gabarito_em_texto(v_alts, qa.resposta)) = v_gab;

    v_depois := public.fn_alteracao_acerto_medio(v_aluno, v_atividade);

    SELECT aa.pontuacao_obtida, aa.acertos_percentual,
           COALESCE(NULLIF(aa.pontuacao_maxima, 0), a.pontuacao_maxima)
      INTO v_obtida, v_acertos, v_maximo
      FROM public.atividade_aluno aa
      JOIN public.atividades a ON a.id = aa.atividade_id
     WHERE aa.aluno_id = v_aluno AND aa.atividade_id = v_atividade;

    -- Atividade ainda sem nota: o app calcula quando o aluno terminar, já com a resposta certa.
    IF FOUND AND v_obtida IS NOT NULL AND COALESCE(v_maximo, 0) > 0
       AND COALESCE(v_depois, 0) > COALESCE(v_antes, 0) THEN
      -- Mantém a proporção de penalidade que o app aplicou (tempo, nova tentativa, gabarito visto).
      v_bruto := v_maximo * COALESCE(v_antes, 0) / 100;
      v_fator := CASE WHEN v_bruto > 0 THEN LEAST(1, v_obtida / v_bruto) ELSE 1 END;
      UPDATE public.atividade_aluno aa
         SET pontuacao_obtida = GREATEST(v_obtida, round(v_maximo * v_depois / 100 * v_fator, 2)),
             acertos_percentual = GREATEST(COALESCE(v_acertos, 0), round(v_depois, 2)),
             avaliacao_metadata = COALESCE(aa.avaliacao_metadata, '{}'::jsonb)
               || jsonb_build_object('recorrecao', jsonb_build_object(
                    'questao_id', p_questao_id, 'em', now(), 'pontuacao_anterior', v_obtida))
       WHERE aa.aluno_id = v_aluno AND aa.atividade_id = v_atividade;
    END IF;

    RETURN NEXT v_aluno;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_recorrigir_questao(bigint, text) FROM PUBLIC, anon, authenticated;
"""

REGISTRAR = (
    f"""
CREATE OR REPLACE FUNCTION public.fn_alteracao_professor_registrar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_autor     uuid := auth.uid();
  v_antes     jsonb;
  v_depois    jsonb;
  v_linha     jsonb;
  v_campos    text[];
  v_entradas  jsonb := '[]'::jsonb;
  v_entrada   jsonb;
  v_diff      jsonb;
  v_questao   bigint;
  v_gab_antes text;
  v_gab_novo  text;
  v_conteudo  bigint;
  v_atividade bigint;
  v_topico    bigint;
  v_classe    bigint;
  v_id        bigint;
BEGIN
  -- Sem sessão é a API (service_role) ou o banco: enriquecimento, boss e regeração não são o professor.
  IF v_autor IS NULL THEN RETURN NULL; END IF;
  -- Item novo ou apagado inteiro: ninguém o viu nesta forma.
  IF TG_TABLE_NAME IN ('conteudos', 'atividades') AND TG_OP <> 'UPDATE' THEN RETURN NULL; END IF;

  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_depois := to_jsonb(NEW); END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_antes := to_jsonb(OLD); END IF;
    v_linha := COALESCE(v_depois, v_antes);

    IF TG_TABLE_NAME = 'conteudos' THEN
      v_conteudo := (v_linha ->> 'id')::bigint;
      v_campos := {_array(CAMPOS["conteudos"])};
    ELSIF TG_TABLE_NAME = 'cards' THEN
      v_conteudo := (v_linha ->> 'conteudo_id')::bigint;
      v_campos := {_array(CAMPOS["cards"])};
    ELSIF TG_TABLE_NAME = 'atividades' THEN
      v_atividade := (v_linha ->> 'id')::bigint;
      v_campos := {_array(CAMPOS["atividades"])};
    ELSIF TG_TABLE_NAME = 'questoes' THEN
      v_atividade := (v_linha ->> 'atividade_id')::bigint;
      v_questao := (v_linha ->> 'id')::bigint;
      v_campos := {_array(CAMPOS["questoes"])};
      v_gab_antes := v_antes ->> 'resposta_correta';
      v_gab_novo := v_depois ->> 'resposta_correta';
    ELSE
      -- questao_gabarito: o gabarito pode morar só aqui (trg_questoes_espelha_gabarito).
      v_questao := (v_linha ->> 'questao_id')::bigint;
      SELECT q.atividade_id INTO v_atividade FROM public.questoes q WHERE q.id = v_questao;
      v_gab_antes := v_antes ->> 'resposta_correta';
      v_gab_novo := v_depois ->> 'resposta_correta';
    END IF;

    IF v_conteudo IS NOT NULL THEN
      SELECT c.topico_id INTO v_topico FROM public.conteudos c WHERE c.id = v_conteudo;
    ELSIF v_atividade IS NOT NULL THEN
      SELECT a.topico_id INTO v_topico FROM public.atividades a WHERE a.id = v_atividade;
    END IF;
    -- Pai apagado na mesma cascata: não há item a destacar.
    IF v_topico IS NULL THEN RETURN NULL; END IF;
    SELECT t.classe_id INTO v_classe FROM public.topicos t WHERE t.id = v_topico;

    -- Só o professor da turma. Cópia de turma (duplicar_*) não tem aluno e para no passo seguinte.
    IF NOT EXISTS (SELECT 1 FROM public.classe c WHERE c.id = v_classe AND c.professor_id = v_autor) THEN
      RETURN NULL;
    END IF;

    IF v_campos IS NOT NULL THEN
      v_diff := public.fn_alteracao_diff(v_antes, v_depois, v_campos);
      IF v_diff IS NOT NULL THEN
        v_entradas := v_entradas || jsonb_build_array(
          jsonb_build_object('tabela', TG_TABLE_NAME, 'id', (v_linha ->> 'id')::bigint, 'op', TG_OP) || v_diff);
      END IF;
    END IF;

    -- O gabarito vira uma entrada própria, com a mesma forma pelas duas origens, para não duplicar.
    IF btrim(COALESCE(v_gab_antes, '')) IS DISTINCT FROM btrim(COALESCE(v_gab_novo, ''))
       AND btrim(COALESCE(v_gab_novo, '')) <> '' THEN
      v_entradas := v_entradas || jsonb_build_array(jsonb_build_object(
        'tabela', 'questoes', 'id', v_questao, 'op', 'UPDATE',
        'campos', jsonb_build_array('resposta_correta'),
        'antes', jsonb_build_object('resposta_correta', v_gab_antes),
        'depois', jsonb_build_object('resposta_correta', v_gab_novo)));
    ELSE
      v_gab_novo := NULL;
    END IF;

    IF jsonb_array_length(v_entradas) = 0 THEN RETURN NULL; END IF;

    -- Ninguém viu nem fez: o aluno vai abrir a versão nova, não há o que destacar.
    IF NOT EXISTS (SELECT 1 FROM public.fn_alteracao_alunos_afetados(v_classe, v_conteudo, v_atividade)) THEN
      RETURN NULL;
    END IF;

    -- Coalescência: junta na linha pendente do mesmo item que o worker ainda não pegou.
    SELECT ap.id INTO v_id
      FROM public.alteracao_professor ap
     WHERE ap.status = 'pendente_analise'
       AND ap.travado_em IS NULL
       AND ap.conteudo_id IS NOT DISTINCT FROM v_conteudo
       AND ap.atividade_id IS NOT DISTINCT FROM v_atividade
     ORDER BY ap.criada_em DESC
     LIMIT 1
       FOR UPDATE;

    IF v_id IS NULL THEN
      INSERT INTO public.alteracao_professor (classe_id, topico_id, alvo_tipo, conteudo_id, atividade_id)
      VALUES (v_classe, v_topico, CASE WHEN v_conteudo IS NOT NULL THEN 'conteudo' ELSE 'atividade' END,
              v_conteudo, v_atividade)
      RETURNING id INTO v_id;
    END IF;

    FOR v_entrada IN SELECT e FROM jsonb_array_elements(v_entradas) AS e LOOP
      UPDATE public.alteracao_professor ap
         SET mudancas = ap.mudancas || jsonb_build_array(v_entrada)
       WHERE ap.id = v_id AND NOT ap.mudancas @> jsonb_build_array(v_entrada);
    END LOOP;
    UPDATE public.alteracao_professor ap
       SET proxima_tentativa_em = now() + interval '{FOLGA_MIN} minutes', atualizada_em = now()
     WHERE ap.id = v_id;

    INSERT INTO public.alteracao_aluno
      (alteracao_id, aluno_id, classe_id, topico_id, conteudo_id, atividade_id, situacao)
    SELECT v_id, f.aluno_id, v_classe, v_topico, v_conteudo, v_atividade, f.situacao
      FROM public.fn_alteracao_alunos_afetados(v_classe, v_conteudo, v_atividade) f
    ON CONFLICT (alteracao_id, aluno_id) DO UPDATE
       SET situacao = CASE WHEN EXCLUDED.situacao = 'fez' THEN 'fez' ELSE public.alteracao_aluno.situacao END;

    -- Gabarito corrigido (decisão 4): recorrige e marca quem ganhou.
    IF v_gab_novo IS NOT NULL THEN
      UPDATE public.alteracao_aluno r
         SET recorrigida = true
       WHERE r.alteracao_id = v_id
         AND r.aluno_id IN (SELECT public.fn_alteracao_recorrigir_questao(v_questao, v_gab_novo));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Falhar aqui não pode desfazer o que o professor salvou.
    -- Mensagem sem placeholder: o SQL offline do Alembic dobra o sinal de porcento.
    RAISE WARNING USING MESSAGE = 'alteracao do professor nao registrada em ' || TG_TABLE_NAME || ': ' || SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_professor_registrar() FROM PUBLIC, anon, authenticated;
"""
    + "".join(
        f"""
DROP TRIGGER IF EXISTS trg_{t}_alteracao_professor ON public.{t};
CREATE TRIGGER trg_{t}_alteracao_professor
  AFTER INSERT OR UPDATE OR DELETE ON public.{t}
  FOR EACH ROW EXECUTE FUNCTION public.fn_alteracao_professor_registrar();
"""
        for t in TABELAS_DO_EDITOR
    )
    + """
DROP TRIGGER IF EXISTS trg_questao_gabarito_alteracao_professor ON public.questao_gabarito;
CREATE TRIGGER trg_questao_gabarito_alteracao_professor
  AFTER INSERT OR UPDATE OF resposta_correta ON public.questao_gabarito
  FOR EACH ROW EXECUTE FUNCTION public.fn_alteracao_professor_registrar();
"""
)

QUESTOES_A_REVISAR = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_questoes_a_revisar(p_alteracao_id bigint)
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE
 SET search_path = public, pg_temp
AS $function$
  -- As questões que mudaram e ainda existem; se a mudança foi na atividade e não nas questões, todas.
  WITH ap AS (
    SELECT a.atividade_id, a.mudancas FROM public.alteracao_professor a WHERE a.id = p_alteracao_id
  ), mudadas AS (
    SELECT q.id
      FROM ap
      JOIN public.questoes q ON q.atividade_id = ap.atividade_id
     WHERE q.id IN (SELECT (e ->> 'id')::bigint
                      FROM jsonb_array_elements(ap.mudancas) AS e
                     WHERE e ->> 'tabela' = 'questoes')
  )
  SELECT id FROM mudadas
  UNION ALL
  SELECT q.id
    FROM ap JOIN public.questoes q ON q.atividade_id = ap.atividade_id
   WHERE NOT EXISTS (SELECT 1 FROM mudadas);
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_questoes_a_revisar(bigint) FROM PUBLIC, anon, authenticated;
"""

ALUNO_ANTES = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_aluno_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_efetiva  text := COALESCE(NEW.decisao_professor, NEW.decisao);
  v_anterior text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_anterior := COALESCE(OLD.decisao_professor, OLD.decisao);
    IF NEW.decisao IS DISTINCT FROM OLD.decisao AND NEW.decisao <> 'pendente_analise' THEN
      NEW.decidida_em := now();
    END IF;
  END IF;

  IF v_efetiva = 'revisar' AND v_anterior IS DISTINCT FROM 'revisar' THEN
    -- A revisão conta a partir de agora: resposta dada antes do pedido não a cumpre.
    NEW.revisar_desde := now();
    NEW.revisada_em := NULL;
    -- A nota de antes (decisão 3), uma vez só: é ela que nunca se perde.
    IF NEW.nota_registrada_em IS NULL THEN
      SELECT aa.pontuacao_obtida, COALESCE(NULLIF(aa.pontuacao_maxima, 0), a.pontuacao_maxima)
        INTO NEW.nota_anterior, NEW.maxima_anterior
        FROM public.atividades a
        LEFT JOIN public.atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = NEW.aluno_id
       WHERE a.id = NEW.atividade_id;
      NEW.nota_registrada_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_aluno_antes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alteracao_aluno_antes ON public.alteracao_aluno;
CREATE TRIGGER trg_alteracao_aluno_antes
  BEFORE INSERT OR UPDATE ON public.alteracao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_alteracao_aluno_antes();
"""

NOTIFICAR = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_aluno_notificar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_efetiva text := NEW.decisao_efetiva;
  v_titulo  text;
  v_resumo  text;
  v_assunto text;
  v_corpo   text;
BEGIN
  IF v_efetiva NOT IN ('destacar', 'revisar') THEN RETURN NULL; END IF;
  -- Uma vez por nível: destaque, e depois revisão se ela vier (o professor pode subir).
  IF NEW.notificada_como = 'revisar' OR (NEW.notificada_como = 'destacar' AND v_efetiva = 'destacar') THEN
    RETURN NULL;
  END IF;
  -- Já abriu a versão nova: o destaque não tem mais o que avisar. A revisão sempre avisa.
  IF v_efetiva = 'destacar' AND NEW.vista_em IS NOT NULL THEN RETURN NULL; END IF;

  BEGIN
    IF NEW.conteudo_id IS NOT NULL THEN
      SELECT c.titulo INTO v_titulo FROM public.conteudos c WHERE c.id = NEW.conteudo_id;
    ELSE
      SELECT a.titulo INTO v_titulo FROM public.atividades a WHERE a.id = NEW.atividade_id;
    END IF;
    v_titulo := COALESCE(NULLIF(btrim(v_titulo), ''), 'um item da trilha');
    v_resumo := NULLIF(btrim(COALESCE(NEW.resumo, '')), '');

    IF v_efetiva = 'revisar' THEN
      v_assunto := 'Atividade para revisar';
      v_corpo := 'O professor mudou “' || v_titulo || '”.'
                 || COALESCE(' ' || v_resumo, '')
                 || ' Refaça quando puder: a sua nota de antes continua garantida.';
    ELSE
      v_assunto := CASE WHEN NEW.conteudo_id IS NOT NULL THEN 'Material atualizado' ELSE 'Atividade atualizada' END;
      v_corpo := 'O professor atualizou “' || v_titulo || '”.' || COALESCE(' ' || v_resumo, '');
    END IF;

    INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, origem, prioridade, motivo)
    VALUES (
      NEW.aluno_id, 'alteracao_professor',
      jsonb_build_object(
        'motivo', 'alteracao:' || NEW.id::text || ':' || v_efetiva,
        'gatilho', 'horario',
        'decisao', v_efetiva,
        'alteracao_id', NEW.alteracao_id,
        'classe_id', NEW.classe_id,
        'topico_id', NEW.topico_id,
        'conteudo_id', NEW.conteudo_id,
        'atividade_id', NEW.atividade_id,
        'rota', '/trilha/' || NEW.topico_id::text),
      v_assunto, v_corpo, 'professor',
      CASE WHEN v_efetiva = 'revisar' THEN 2 ELSE 1 END,
      'alteração do professor');

    UPDATE public.alteracao_aluno SET notificada_como = v_efetiva WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    -- O aviso é consequência; perdê-lo não pode desfazer a decisão.
    RAISE WARNING USING MESSAGE = 'aviso de alteracao nao enfileirado: ' || SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_aluno_notificar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alteracao_aluno_notificar ON public.alteracao_aluno;
CREATE TRIGGER trg_alteracao_aluno_notificar
  AFTER INSERT OR UPDATE OF decisao, decisao_professor ON public.alteracao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_alteracao_aluno_notificar();
"""

REVISAO_RESPONDIDA = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_revisao_respondida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  BEGIN
    UPDATE public.alteracao_aluno r
       SET revisada_em = now()
     WHERE r.aluno_id = NEW.aluno_id
       AND r.atividade_id = NEW.atividade_id
       AND r.decisao_efetiva = 'revisar'
       AND r.revisada_em IS NULL
       AND r.revisar_desde IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.fn_alteracao_questoes_a_revisar(r.alteracao_id) AS q(questao_id)
              WHERE NOT EXISTS (
                      SELECT 1 FROM public.questao_aluno qa
                       WHERE qa.aluno_id = NEW.aluno_id
                         AND qa.questao_id = q.questao_id
                         AND qa.criado_em >= r.revisar_desde));
  EXCEPTION WHEN OTHERS THEN
    -- A resposta do aluno vale mais que a marca de revisão: ela fica.
    RAISE WARNING USING MESSAGE = 'revisao nao marcada: ' || SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_revisao_respondida() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_questao_aluno_revisao_respondida ON public.questao_aluno;
CREATE TRIGGER trg_questao_aluno_revisao_respondida
  AFTER INSERT ON public.questao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_alteracao_revisao_respondida();
"""

WORKER = f"""
CREATE OR REPLACE FUNCTION public.fn_alteracao_reivindicar(
  p_limite integer, p_trava_seg integer, p_classe_ids bigint[] DEFAULT NULL
)
 RETURNS SETOF bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT ap.id
      FROM public.alteracao_professor ap
     WHERE ap.status = 'pendente_analise'
       AND ap.proxima_tentativa_em <= now()
       AND ap.tentativas < {MAX_TENTATIVAS}
       AND (ap.travado_em IS NULL OR ap.travado_em < now() - make_interval(secs => p_trava_seg))
       AND (p_classe_ids IS NULL OR ap.classe_id = ANY (p_classe_ids))
     ORDER BY ap.proxima_tentativa_em, ap.id
     LIMIT p_limite
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.alteracao_professor ap
     SET travado_em = now(), tentativas = ap.tentativas + 1
    FROM alvo
   WHERE ap.id = alvo.id
  RETURNING ap.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_reivindicar(integer, integer, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_alteracao_reivindicar(integer, integer, bigint[]) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_alteracao_falhou(p_id bigint, p_erro text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Sem modelo, nada é inventado: a linha continua pendente_analise. Esgotadas as tentativas, ela
  -- para de ser reivindicada e espera o professor decidir à mão no console.
  UPDATE public.alteracao_professor ap
     SET travado_em = NULL,
         ultimo_erro = left(COALESCE(p_erro, ''), 500),
         proxima_tentativa_em = now() + make_interval(
           mins => LEAST({ESPERA_MAXIMA_MIN}, power(2, ap.tentativas)::int))
   WHERE ap.id = p_id AND ap.status = 'pendente_analise';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_falhou(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_alteracao_falhou(bigint, text) TO service_role;
"""

CONTEXTO = r"""
CREATE OR REPLACE FUNCTION public.fn_alteracao_contexto(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  WITH ap AS (
    SELECT * FROM public.alteracao_professor WHERE id = p_id
  ), questoes_mudadas AS (
    SELECT DISTINCT (e ->> 'id')::bigint AS id
      FROM ap, jsonb_array_elements(ap.mudancas) AS e
     WHERE e ->> 'tabela' = 'questoes'
  ), perfis AS (
    -- Perfil dominante como em listar_alunos_classe_com_perfil_dominante: afinidade desc, nulos por
    -- último, desempate pelo nome; sem linha, mastermind.
    SELECT ap2.aluno_id,
           (array_agg(lower(p.nome) ORDER BY
              CASE WHEN ap2.afinidade::text ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN btrim(ap2.afinidade::text)::numeric END
              DESC NULLS LAST, p.nome ASC))[1] AS dominante,
           jsonb_object_agg(lower(p.nome),
              CASE WHEN ap2.afinidade::text ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN btrim(ap2.afinidade::text)::numeric END)
             AS afinidades
      FROM public.aluno_perfil ap2
      JOIN public.perfil p ON p.id = ap2.perfil_id
     WHERE ap2.aluno_id IN (SELECT r.aluno_id FROM public.alteracao_aluno r WHERE r.alteracao_id = p_id)
     GROUP BY ap2.aluno_id
  )
  SELECT jsonb_build_object(
    'alteracao', jsonb_build_object('id', ap.id, 'alvo_tipo', ap.alvo_tipo, 'mudancas', ap.mudancas),
    'topico', (SELECT jsonb_build_object('id', t.id, 'nome', t.nome) FROM public.topicos t WHERE t.id = ap.topico_id),
    'alvo', CASE WHEN ap.alvo_tipo = 'conteudo' THEN (
        SELECT jsonb_build_object('id', c.id, 'titulo', c.titulo, 'tipo', c.tipo,
                                  'texto', left(COALESCE(c.conteudo, ''), 4000))
          FROM public.conteudos c WHERE c.id = ap.conteudo_id)
      ELSE (
        SELECT jsonb_build_object('id', a.id, 'titulo', a.titulo, 'tipo', a.tipo,
                                  'descricao', left(COALESCE(a.descricao, ''), 2000),
                                  'pontuacao_maxima', a.pontuacao_maxima, 'data_entrega', a.data_entrega,
                                  'questoes', COALESCE((
                                    SELECT jsonb_agg(jsonb_build_object(
                                             'id', q.id, 'tipo', q.tipo,
                                             'enunciado', left(COALESCE(q.enunciado, ''), 1000),
                                             'alternativas', q.alternativas,
                                             'mudou', q.id IN (SELECT id FROM questoes_mudadas))
                                           ORDER BY q.id)
                                      FROM public.questoes q WHERE q.atividade_id = a.id), '[]'::jsonb))
          FROM public.atividades a WHERE a.id = ap.atividade_id)
      END,
    'alunos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'aluno_id', r.aluno_id,
               'situacao', r.situacao,
               'recorrigida', r.recorrigida,
               'perfil_dominante', COALESCE(pf.dominante, 'mastermind'),
               'afinidades', COALESCE(pf.afinidades, '{}'::jsonb),
               'nota_media_turma', m."notaMedia",
               'nota_na_atividade', CASE WHEN COALESCE(NULLIF(aa.pontuacao_maxima, 0), at.pontuacao_maxima, 0) > 0
                                         AND aa.pontuacao_obtida IS NOT NULL
                                    THEN round(10 * aa.pontuacao_obtida
                                               / COALESCE(NULLIF(aa.pontuacao_maxima, 0), at.pontuacao_maxima), 2) END,
               'acertos_percentual', aa.acertos_percentual,
               'respostas_nas_questoes_mudadas', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object('questao_id', u.questao_id, 'correta', u.correta))
                   FROM (SELECT DISTINCT ON (qa.questao_id) qa.questao_id, qa.correta
                           FROM public.questao_aluno qa
                          WHERE qa.aluno_id = r.aluno_id AND qa.atividade_id = ap.atividade_id
                            AND qa.questao_id IN (SELECT id FROM questoes_mudadas)
                          ORDER BY qa.questao_id, qa.tentativa DESC, qa.criado_em DESC) u), '[]'::jsonb))
             ORDER BY r.id)
        FROM public.alteracao_aluno r
        LEFT JOIN perfis pf ON pf.aluno_id = r.aluno_id
        LEFT JOIN public.classe_aluno m ON m.aluno_id = r.aluno_id AND m.classe_id = r.classe_id
        LEFT JOIN public.atividades at ON at.id = ap.atividade_id
        LEFT JOIN public.atividade_aluno aa ON aa.aluno_id = r.aluno_id AND aa.atividade_id = ap.atividade_id
       WHERE r.alteracao_id = ap.id), '[]'::jsonb))
    FROM ap;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_contexto(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_alteracao_contexto(bigint) TO service_role;
"""

DECISAO = """
CREATE OR REPLACE FUNCTION public.fn_alteracao_registrar_decisao(
  p_id bigint, p_classificacao text, p_resumo text, p_motivo text, p_alunos jsonb
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ap         record;
  v_tem_questao boolean;
  v_n          integer;
BEGIN
  IF p_classificacao NOT IN ('cosmetica', 'relevante') THEN
    RAISE EXCEPTION 'classificacao invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ap FROM public.alteracao_professor WHERE id = p_id FOR UPDATE;
  -- Já decidida (outro worker, ou chamada repetida): nada a fazer.
  IF NOT FOUND OR v_ap.status <> 'pendente_analise' THEN RETURN 0; END IF;

  v_tem_questao := v_ap.atividade_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.questoes q WHERE q.atividade_id = v_ap.atividade_id);

  UPDATE public.alteracao_professor
     SET status = 'analisada', classificacao = p_classificacao,
         resumo = left(NULLIF(btrim(COALESCE(p_resumo, '')), ''), 280),
         motivo = left(NULLIF(btrim(COALESCE(p_motivo, '')), ''), 500),
         analisada_em = now(), travado_em = NULL, ultimo_erro = NULL
   WHERE id = p_id;

  -- Revisão só para quem fez uma atividade que o app consegue refazer (tem questão). Aluno que a
  -- IA não citou fica com destaque: na dúvida, avisar sem obrigar.
  UPDATE public.alteracao_aluno r
     SET decisao = CASE
                     WHEN p_classificacao = 'cosmetica' THEN 'cosmetica'
                     WHEN v_tem_questao AND r.situacao = 'fez'
                          AND COALESCE((d.item ->> 'revisar')::boolean, false) THEN 'revisar'
                     ELSE 'destacar'
                   END,
         motivo = left(NULLIF(btrim(COALESCE(d.item ->> 'motivo', '')), ''), 500),
         resumo = CASE WHEN p_classificacao = 'cosmetica' THEN NULL
                       ELSE left(NULLIF(btrim(COALESCE(p_resumo, '')), ''), 280) END
    FROM (SELECT r2.id,
                 (SELECT e FROM jsonb_array_elements(COALESCE(p_alunos, '[]'::jsonb)) AS e
                   WHERE e ->> 'aluno_id' = r2.aluno_id::text LIMIT 1) AS item
            FROM public.alteracao_aluno r2 WHERE r2.alteracao_id = p_id) d
   WHERE r.id = d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_alteracao_registrar_decisao(bigint, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_alteracao_registrar_decisao(bigint, text, text, text, jsonb) TO service_role;
"""

RPCS = """
CREATE OR REPLACE FUNCTION public.alteracao_decidir(
  p_alteracao_id bigint, p_aluno_id uuid DEFAULT NULL, p_decisao text DEFAULT 'ia'
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ap          record;
  v_tem_questao boolean;
  v_n           integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF p_decisao IS NULL OR p_decisao NOT IN ('cosmetica', 'destacar', 'revisar', 'ia') THEN
    RAISE EXCEPTION 'decisao invalida' USING ERRCODE = '22023';
  END IF;

  -- Posse antes de tocar em qualquer linha de aluno.
  SELECT * INTO v_ap FROM public.alteracao_professor ap
   WHERE ap.id = p_alteracao_id
     AND EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = ap.classe_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alteracao nao encontrada ou sem permissao.' USING ERRCODE = '42501';
  END IF;

  v_tem_questao := v_ap.atividade_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.questoes q WHERE q.atividade_id = v_ap.atividade_id);
  IF p_decisao = 'revisar' AND NOT v_tem_questao THEN
    RAISE EXCEPTION 'So atividade com questao pode ser revisada pelo app.' USING ERRCODE = '22023';
  END IF;

  -- 'ia' devolve a decisão à IA (apaga a do professor). Revisão só vale para quem fez.
  UPDATE public.alteracao_aluno r
     SET decisao_professor = NULLIF(p_decisao, 'ia'),
         decisao_professor_em = now(),
         decisao_professor_por = auth.uid()
   WHERE r.alteracao_id = p_alteracao_id
     AND (p_aluno_id IS NULL OR r.aluno_id = p_aluno_id)
     AND (p_decisao <> 'revisar' OR r.situacao = 'fez');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.alteracao_decidir(bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alteracao_decidir(bigint, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.alteracao_marcar_vista(
  p_conteudo_id bigint DEFAULT NULL, p_atividade_id bigint DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_n     integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  -- Só as linhas do próprio aluno. A revisão pendente não some por abrir: só por refazer.
  UPDATE public.alteracao_aluno r
     SET vista_em = now()
   WHERE r.aluno_id = v_aluno
     AND r.vista_em IS NULL
     AND ((p_conteudo_id IS NOT NULL AND r.conteudo_id = p_conteudo_id)
          OR (p_atividade_id IS NOT NULL AND r.atividade_id = p_atividade_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.alteracao_marcar_vista(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alteracao_marcar_vista(bigint, bigint) TO authenticated;
"""

REALTIME = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables pt
                      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
                        AND pt.tablename = 'alteracao_aluno') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alteracao_aluno;
  END IF;
END $$;
"""

REALTIME_FORA = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables pt
              WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
                AND pt.tablename = 'alteracao_aluno') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.alteracao_aluno;
  END IF;
END $$;
"""


def _nota_anterior() -> str:
    """O texto da `20261101_10`, de onde esta parte e para onde o downgrade volta."""
    caminho = Path(__file__).with_name("20261101_10_nota_media_da_matricula.py")
    spec = importlib.util.spec_from_file_location("nota_media_20261101_10", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    # Só a primeira função: o resto do bloco (guarda da nota, varredura do prazo) não muda aqui.
    fim = "$function$;\n"
    return modulo.NOTA[: modulo.NOTA.index(fim) + len(fim)]


ANCORA_CASO = "               WHEN aa.pontuacao_obtida IS NOT NULL THEN aa.pontuacao_obtida\n"
CASO_COM_REVISAO = (
    "               -- Revisão pedida (20261101_12): a nota de antes vale até refazer, depois a maior.\n"
    "               WHEN aa.pontuacao_obtida IS NOT NULL OR rv.anterior IS NOT NULL\n"
    "                 THEN GREATEST(aa.pontuacao_obtida,\n"
    "                               rv.anterior * COALESCE(NULLIF(aa.pontuacao_maxima, 0), a.pontuacao_maxima))\n"
)
ANCORA_JUNCAO = "        LEFT JOIN public.atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno\n"
JUNCAO_COM_REVISAO = ANCORA_JUNCAO + (
    "        LEFT JOIN LATERAL (\n"
    "          SELECT max(r.nota_anterior / NULLIF(r.maxima_anterior, 0)) AS anterior\n"
    "            FROM public.alteracao_aluno r\n"
    "           WHERE r.aluno_id = p_aluno AND r.atividade_id = a.id AND r.nota_registrada_em IS NOT NULL\n"
    "        ) rv ON true\n"
)


def _nota_com_revisao() -> str:
    texto = _nota_anterior()
    # Falha alto se a 20261101_10 mudar: substituir no escuro deixaria a conta sem a revisão.
    assert texto.count(ANCORA_CASO) == 1, "20261101_10 sem a âncora do CASE"
    assert texto.count(ANCORA_JUNCAO) == 1, "20261101_10 sem a âncora do LEFT JOIN"
    return texto.replace(ANCORA_CASO, CASO_COM_REVISAO).replace(ANCORA_JUNCAO, JUNCAO_COM_REVISAO)


DOWNGRADE = (
    """
DROP TRIGGER IF EXISTS trg_questao_aluno_revisao_respondida ON public.questao_aluno;
DROP TRIGGER IF EXISTS trg_questao_gabarito_alteracao_professor ON public.questao_gabarito;
"""
    + "".join(f"DROP TRIGGER IF EXISTS trg_{t}_alteracao_professor ON public.{t};\n" for t in TABELAS_DO_EDITOR)
    + """
DROP FUNCTION IF EXISTS public.alteracao_marcar_vista(bigint, bigint);
DROP FUNCTION IF EXISTS public.alteracao_decidir(bigint, uuid, text);
DROP FUNCTION IF EXISTS public.fn_alteracao_registrar_decisao(bigint, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.fn_alteracao_contexto(bigint);
DROP FUNCTION IF EXISTS public.fn_alteracao_falhou(bigint, text);
DROP FUNCTION IF EXISTS public.fn_alteracao_reivindicar(integer, integer, bigint[]);
DROP FUNCTION IF EXISTS public.fn_alteracao_revisao_respondida();
DROP FUNCTION IF EXISTS public.fn_alteracao_professor_registrar();
DROP FUNCTION IF EXISTS public.fn_alteracao_recorrigir_questao(bigint, text);
DROP FUNCTION IF EXISTS public.fn_alteracao_acerto_medio(uuid, bigint);
DROP FUNCTION IF EXISTS public.fn_alteracao_alunos_afetados(bigint, bigint, bigint);
DROP FUNCTION IF EXISTS public.fn_alteracao_questao_objetiva(text);
DROP FUNCTION IF EXISTS public.fn_alteracao_diff(jsonb, jsonb, text[]);
DELETE FROM public.retencao_politica WHERE tabela = 'alteracao_aluno';
DROP TABLE IF EXISTS public.alteracao_aluno;
DROP TABLE IF EXISTS public.alteracao_professor;
DROP FUNCTION IF EXISTS public.fn_alteracao_questoes_a_revisar(bigint);
DROP FUNCTION IF EXISTS public.fn_alteracao_aluno_notificar();
DROP FUNCTION IF EXISTS public.fn_alteracao_aluno_antes();
"""
)


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(DIFF)
    op.execute(OBJETIVA)
    op.execute(AFETADOS)
    op.execute(ACERTO_MEDIO)
    op.execute(RECORRIGIR)
    op.execute(QUESTOES_A_REVISAR)
    op.execute(REGISTRAR)
    op.execute(ALUNO_ANTES)
    op.execute(NOTIFICAR)
    op.execute(REVISAO_RESPONDIDA)
    op.execute(WORKER)
    op.execute(CONTEXTO)
    op.execute(DECISAO)
    op.execute(RPCS)
    op.execute(_nota_com_revisao())
    op.execute(REALTIME)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # A recorreção do gabarito fica: é correção de verdade, e desfazê-la tiraria ponto de quem acertou.
    op.execute(_nota_anterior())
    op.execute(REALTIME_FORA)
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
