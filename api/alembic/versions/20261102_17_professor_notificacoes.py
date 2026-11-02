"""Notificações do professor: o que pede a atenção dele, avisado pelo banco

## O pedido

Geisbelly, no grupo: o console do professor "precisa de notificações para os professores".

## O que existia

Nada. `notificacoes` e todo o motor em volta (`notificacoes_ia` → `notificacoes_pendentes` → entrega,
push por `pg_net`) são do aluno: `aluno_id` em todas as colunas e RLS `notificacoes_aluno_*`. O
professor não tinha tabela, o console não tinha sino e o Realtime só publicava tabelas de aluno.

## O que muda

`public.professor_notificacoes`, uma linha por **assunto**, não por ocorrência. Quatro gatilhos a
preenchem (regra de fronteira do repositório: encanamento é do banco, a API não entra):

| tipo | quando | destino no console |
|---|---|---|
| `recomendacao_ia` | nasce uma sugestão pendente em `intervencoes` | Recomendações |
| `entrega_para_avaliar` | um aluno responde uma atividade dissertativa (`questao_aluno`) | Notas |
| `geracao_falhou` | um job de personalização termina `failed` ou `partial` | Personalizações |
| `evento_encerrado` | um evento da turma passa a `encerrado` | Eventos |

**Coalescência.** Cada notificação tem uma `dedupe_key` e é única por `(professor_id, dedupe_key)`. Uma
nova ocorrência do mesmo assunto não cria outra linha: soma em `contagem`, reabre a notificação
(`lida_em` volta a nulo) e atualiza o texto. Sem isso, 30 alunos entregando a mesma dissertação
fariam 30 avisos. A chave de cada tipo: lote de geração (ou o id do alerta), atividade no dia,
turma no dia (falhas de geração) e o evento.

**Nunca atrapalha quem a causa.** A função que grava (`fn_professor_notificar`) engole qualquer erro
e só emite `WARNING`: aluno respondendo, IA gravando insight e job terminando não podem falhar
porque o aviso ao professor falhou (mesmo princípio do gatilho de matrícula, `20261011_02`).

**Autorização.** RLS ligada, com policy de SELECT/UPDATE/DELETE só da própria linha
(`professor_id = auth.uid()`) e **nenhuma de INSERT**: só as funções `SECURITY DEFINER` gravam. O
GRANT por coluna deixa o professor mudar apenas `lida_em`, o mesmo desenho de `intervencoes`. As
funções ficam sem EXECUTE para `PUBLIC`, `anon` e `authenticated`: são alcançadas só pelos gatilhos.

**Realtime.** A tabela entra na publicação `supabase_realtime`; sem isso o canal assina e nenhum
evento chega (ver `20261003_04`).

## O que ficou de fora, de propósito

- **Risco de reprovação** (#135) não notifica: é calculado na hora por `professor_risco_reprovacao_turma`,
  não há evento de banco para ligar um gatilho. Avisar exigiria uma varredura agendada.
- **E-mail e push.** Só dentro do console, numa primeira versão.
"""

from __future__ import annotations

from alembic import op

revision = "20261102_17"
down_revision = "20261102_16"
branch_labels = None
depends_on = None


TABELA = """
CREATE TABLE IF NOT EXISTS public.professor_notificacoes (
  id             bigserial PRIMARY KEY,
  professor_id   uuid        NOT NULL REFERENCES public.professor (id) ON DELETE CASCADE,
  classe_id      bigint      REFERENCES public.classe (id) ON DELETE CASCADE,
  tipo           text        NOT NULL,
  titulo         text        NOT NULL,
  corpo          text        NOT NULL DEFAULT '',
  destino        text,
  contagem       integer     NOT NULL DEFAULT 1,
  dedupe_key     text        NOT NULL,
  lida_em        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professor_notificacoes_tipo_ck CHECK (
    tipo IN ('recomendacao_ia', 'entrega_para_avaliar', 'geracao_falhou', 'evento_encerrado')
  ),
  CONSTRAINT professor_notificacoes_destino_ck CHECK (
    destino IS NULL OR destino IN ('recomendacoes', 'notas', 'personalizacoes', 'eventos')
  ),
  CONSTRAINT professor_notificacoes_contagem_ck CHECK (contagem >= 1),
  CONSTRAINT professor_notificacoes_titulo_ck CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 160),
  CONSTRAINT professor_notificacoes_corpo_ck CHECK (char_length(corpo) <= 500),
  CONSTRAINT professor_notificacoes_dedupe_uq UNIQUE (professor_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS professor_notificacoes_caixa_idx
  ON public.professor_notificacoes (professor_id, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS professor_notificacoes_nao_lidas_idx
  ON public.professor_notificacoes (professor_id) WHERE lida_em IS NULL;
CREATE INDEX IF NOT EXISTS professor_notificacoes_classe_idx
  ON public.professor_notificacoes (classe_id);

ALTER TABLE public.professor_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professor_notificacoes_sel ON public.professor_notificacoes;
CREATE POLICY professor_notificacoes_sel ON public.professor_notificacoes
  FOR SELECT TO authenticated USING (professor_id = auth.uid());

DROP POLICY IF EXISTS professor_notificacoes_upd ON public.professor_notificacoes;
CREATE POLICY professor_notificacoes_upd ON public.professor_notificacoes
  FOR UPDATE TO authenticated USING (professor_id = auth.uid()) WITH CHECK (professor_id = auth.uid());

DROP POLICY IF EXISTS professor_notificacoes_del ON public.professor_notificacoes;
CREATE POLICY professor_notificacoes_del ON public.professor_notificacoes
  FOR DELETE TO authenticated USING (professor_id = auth.uid());

-- A policy decide QUAIS linhas; o GRANT por coluna decide QUAIS campos. Sem INSERT para o cliente:
-- quem grava são as funções SECURITY DEFINER abaixo.
REVOKE ALL ON public.professor_notificacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.professor_notificacoes TO authenticated;
GRANT UPDATE (lida_em) ON public.professor_notificacoes TO authenticated;
"""


NOTIFICAR = """
CREATE OR REPLACE FUNCTION public.fn_professor_notificar(
  p_professor uuid,
  p_classe    bigint,
  p_tipo      text,
  p_titulo    text,
  p_corpo     text,
  p_destino   text,
  p_dedupe    text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_professor IS NULL OR p_dedupe IS NULL THEN
    RETURN;
  END IF;

  -- Mesmo assunto de novo: soma, reabre e atualiza o texto, em vez de criar outra linha.
  INSERT INTO public.professor_notificacoes AS n
    (professor_id, classe_id, tipo, titulo, corpo, destino, dedupe_key)
  VALUES
    (p_professor, p_classe, p_tipo, p_titulo, left(coalesce(p_corpo, ''), 500), p_destino, p_dedupe)
  ON CONFLICT (professor_id, dedupe_key) DO UPDATE
    SET contagem      = n.contagem + 1,
        lida_em       = NULL,
        titulo        = EXCLUDED.titulo,
        corpo         = EXCLUDED.corpo,
        atualizado_em = now();
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca pode derrubar a transação de quem o causou.
  RAISE WARNING 'professor_notificacoes: %', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_professor_notificar(uuid, bigint, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
"""


RECOMENDACAO = """
CREATE OR REPLACE FUNCTION public.fn_professor_notifica_recomendacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_professor uuid;
  v_turma     text;
  v_chave     text;
BEGIN
  IF NEW.natureza <> 'sugestao' OR NEW.status <> 'pending' OR NEW.classe_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT c.professor_id, coalesce(nullif(btrim(c.descricao), ''), 'a turma ' || c.id)
      INTO v_professor, v_turma
      FROM public.classe c WHERE c.id = NEW.classe_id;
    -- Um lote da IA grava várias linhas de uma vez: um aviso por lote. O alerta por aluno não tem
    -- lote e nasce sozinho, então a chave é a própria linha.
    v_chave := 'rec:' || NEW.classe_id || ':' || coalesce(CAST(NEW.geracao_id AS text), 'alerta:' || NEW.id);
    PERFORM public.fn_professor_notificar(
      v_professor, NEW.classe_id, 'recomendacao_ia',
      'Recomendações da IA aguardando decisão',
      'A IA propôs algo para ' || v_turma || '. Aceite ou ignore na aba Recomendações.',
      'recomendacoes', v_chave);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'professor_notificacoes (recomendacao): %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_professor_notifica_recomendacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_intervencoes_notifica_professor ON public.intervencoes;
CREATE TRIGGER trg_intervencoes_notifica_professor
  AFTER INSERT ON public.intervencoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_professor_notifica_recomendacao();
"""


ENTREGA = """
CREATE OR REPLACE FUNCTION public.fn_professor_notifica_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_professor uuid;
  v_classe    bigint;
  v_titulo    text;
  v_tipo      text;
BEGIN
  IF NEW.atividade_id IS NULL OR NEW.resposta IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT t.classe_id, c.professor_id, a.titulo,
           lower(coalesce(nullif(btrim(a.tipo), ''), 'essay'))
      INTO v_classe, v_professor, v_titulo, v_tipo
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
      JOIN public.classe  c ON c.id = t.classe_id
     WHERE a.id = NEW.atividade_id;
    -- Mesmo critério da fila de Notas (`notas_fila`): só o que o professor precisa corrigir.
    IF v_professor IS NULL OR v_tipo NOT IN ('essay', 'dissertativa', 'questao', 'texto') THEN
      RETURN NEW;
    END IF;
    -- Uma atividade com 30 entregas no dia é um aviso, não 30.
    PERFORM public.fn_professor_notificar(
      v_professor, v_classe, 'entrega_para_avaliar',
      'Entregas para avaliar',
      'Há respostas novas em "' || coalesce(v_titulo, 'atividade') || '" esperando a sua nota.',
      'notas',
      'entrega:' || NEW.atividade_id || ':' || CAST((now() AT TIME ZONE 'America/Sao_Paulo')::date AS text));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'professor_notificacoes (entrega): %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_professor_notifica_entrega() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_questao_aluno_notifica_professor ON public.questao_aluno;
CREATE TRIGGER trg_questao_aluno_notifica_professor
  AFTER INSERT ON public.questao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_professor_notifica_entrega();
"""


GERACAO = """
CREATE OR REPLACE FUNCTION public.fn_professor_notifica_geracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_professor uuid;
  v_turma     text;
BEGIN
  IF NEW.status NOT IN ('failed', 'partial') OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.classe_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Missão diária e limpeza de aluno são rotina do sistema: o professor não age sobre elas.
  IF NEW.kind IN ('missao_diaria', 'student_cleanup') THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT c.professor_id, coalesce(nullif(btrim(c.descricao), ''), 'a turma ' || c.id)
      INTO v_professor, v_turma
      FROM public.classe c WHERE c.id = NEW.classe_id;
    -- Um job que falha e é reprocessado gera vários avisos iguais: um por turma e dia.
    PERFORM public.fn_professor_notificar(
      v_professor, NEW.classe_id, 'geracao_falhou',
      'Falha na geração de material',
      'A geração do material de ' || v_turma || ' terminou com falhas. Veja em Personalizações e use Reprocessar falhas.',
      'personalizacoes',
      'geracao:' || NEW.classe_id || ':' || CAST((now() AT TIME ZONE 'America/Sao_Paulo')::date AS text));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'professor_notificacoes (geracao): %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_professor_notifica_geracao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personalizacao_jobs_notifica_professor ON public.personalizacao_jobs;
CREATE TRIGGER trg_personalizacao_jobs_notifica_professor
  AFTER UPDATE OF status ON public.personalizacao_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_professor_notifica_geracao();
"""


EVENTO = """
CREATE OR REPLACE FUNCTION public.fn_professor_notifica_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_professor uuid;
BEGIN
  IF NEW.status <> 'encerrado' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT c.professor_id INTO v_professor FROM public.classe c WHERE c.id = NEW.classe_id;
    PERFORM public.fn_professor_notificar(
      v_professor, NEW.classe_id, 'evento_encerrado',
      'Evento encerrado',
      '"' || NEW.titulo || '" foi encerrado e apurado. Veja o resultado em Eventos.',
      'eventos',
      'evento:' || NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'professor_notificacoes (evento): %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_professor_notifica_evento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_eventos_classe_notifica_professor ON public.eventos_classe;
CREATE TRIGGER trg_eventos_classe_notifica_professor
  AFTER UPDATE OF status ON public.eventos_classe
  FOR EACH ROW EXECUTE FUNCTION public.fn_professor_notifica_evento();
"""


REALTIME = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables pt
        WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
          AND pt.tablename = 'professor_notificacoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professor_notificacoes;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(NOTIFICAR)
    op.execute(RECOMENDACAO)
    op.execute(ENTREGA)
    op.execute(GERACAO)
    op.execute(EVENTO)
    op.execute(REALTIME)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_eventos_classe_notifica_professor ON public.eventos_classe")
    op.execute("DROP TRIGGER IF EXISTS trg_personalizacao_jobs_notifica_professor ON public.personalizacao_jobs")
    op.execute("DROP TRIGGER IF EXISTS trg_questao_aluno_notifica_professor ON public.questao_aluno")
    op.execute("DROP TRIGGER IF EXISTS trg_intervencoes_notifica_professor ON public.intervencoes")
    op.execute("DROP FUNCTION IF EXISTS public.fn_professor_notifica_evento()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_professor_notifica_geracao()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_professor_notifica_entrega()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_professor_notifica_recomendacao()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_professor_notificar(uuid, bigint, text, text, text, text, text)")
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication_tables pt
                      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
                        AND pt.tablename = 'professor_notificacoes') THEN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.professor_notificacoes;
          END IF;
        END $$;
        """
    )
    op.execute("DROP TABLE IF EXISTS public.professor_notificacoes")
