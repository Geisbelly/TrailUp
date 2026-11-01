"""Mensagens não lidas: contador por conversa e aviso de mensagem privada

O chat privado (`social_mensagens`) e o da guilda (`guilda_mensagens`) não sabiam o que o aluno
já tinha lido: não havia contador nem aviso de mensagem recebida. Tudo aqui é banco, nenhuma
linha na API: contar e marcar é encanamento, e avisar já tem motor no Postgres
(`social_notificar_evento` → `notificacoes` + `notificacoes_enviar_push`).

## O que entra

- **`chat_leitura`**: até quando o aluno leu cada conversa. Uma linha por
  `(aluno, tipo, conversa)`, com `tipo` `privado` (a conversa é o outro aluno) ou `guilda` (a
  conversa é a guilda). O aluno lê só as próprias linhas (`chat_leitura_propria_sel`). Escrever
  é só por `chat_marcar_lido`, que nunca anda a marca para trás. Por isso `authenticated` não
  tem INSERT/UPDATE/DELETE na tabela.
- **`chat_nao_lidas()`**: quantas mensagens o aluno ainda não leu em cada conversa e quando
  chegou a última. Conta só o que os OUTROS mandaram. Na guilda conta só o que chegou depois de o
  aluno entrar e enquanto ele é membro. Remetente bloqueado não conta.
- **`chat_marcar_lido(tipo, conversa)`**: o app chama ao abrir e ao fechar a conversa. Na guilda,
  só membro ativo marca.
- **Aviso de mensagem privada** (`social_mensagens_notificar`, AFTER INSERT): vai para a caixa
  de entrada e para o push.
  - **Sem o texto da mensagem**: as conversas são cifradas em repouso (`20261022_05`) e os
    alunos são menores.
  - **Um aviso por leva não lida, não um por mensagem.** A chave de dedupe é
    `chat:<remetente>:<lido_ate>`. Enquanto o aluno não abre a conversa, as mensagens seguintes
    do mesmo colega caem no mesmo aviso, e o índice único de `notificacoes` descarta as repetidas.
    Ao abrir, `lido_ate` anda e a próxima mensagem avisa de novo.
  - **Falhar ao avisar não derruba a mensagem**: o bloco de exceção engole o erro com um
    `WARNING`.
  - A guilda não manda push: avisar todo membro a cada mensagem seria barulho. Ela tem só o
    contador.

## Mensagens antigas contam como lidas

Sem marca, tudo o que já existe apareceria como não lido na primeira abertura. O backfill grava
`lido_ate = now()` para toda conversa privada que já tem mensagem e para toda guilda com membro
ativo.

## RLS

`chat_leitura` nasce com RLS (o `ensure_rls` liga em todo `CREATE TABLE`) e com a policy de SELECT
no mesmo commit, e com a linha em `retencao_politica` (`vida_da_conta`). As duas RPCs são `SECURITY DEFINER` e decidem por `auth.uid()`: não recebem o
aluno por parâmetro, então ninguém conta nem marca a conversa de outro.

Revision ID: 20261102_06
Revises: 20261102_05
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261102_06"
down_revision = "20261102_05"
branch_labels = None
depends_on = None

UPGRADE = r"""
CREATE TABLE IF NOT EXISTS public.chat_leitura (
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('privado', 'guilda')),
  conversa_id uuid NOT NULL,
  lido_ate timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, tipo, conversa_id)
);
ALTER TABLE public.chat_leitura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_leitura_propria_sel ON public.chat_leitura;
CREATE POLICY chat_leitura_propria_sel ON public.chat_leitura
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
REVOKE ALL ON public.chat_leitura FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chat_leitura FROM authenticated;
GRANT SELECT ON public.chat_leitura TO authenticated;

-- Marcador de leitura do próprio aluno: sai com a conta (CASCADE em alunos), como aluno_introducao.
INSERT INTO public.retencao_politica (tabela, acao, categoria, motivo) VALUES
  ('chat_leitura', 'vida_da_conta', 'vida_da_conta', 'até onde o aluno leu cada conversa; removido com a conta')
ON CONFLICT (tabela, acao) DO NOTHING;

-- Mensagens anteriores contam como lidas.
INSERT INTO public.chat_leitura (aluno_id, tipo, conversa_id, lido_ate)
SELECT DISTINCT m.destinatario_id, 'privado', m.remetente_id, now()
  FROM public.social_mensagens m
ON CONFLICT (aluno_id, tipo, conversa_id) DO NOTHING;

INSERT INTO public.chat_leitura (aluno_id, tipo, conversa_id, lido_ate)
SELECT DISTINCT mem.aluno_id, 'guilda', mem.guilda_id, now()
  FROM public.guilda_membros mem
 WHERE mem.left_at IS NULL AND mem.aluno_id IS NOT NULL
ON CONFLICT (aluno_id, tipo, conversa_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.chat_nao_lidas()
RETURNS TABLE (tipo text, conversa_id uuid, nao_lidas integer, ultima_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT 'privado'::text, m.remetente_id, count(*)::integer, max(m.created_at)
    FROM public.social_mensagens m
    LEFT JOIN public.chat_leitura l
      ON l.aluno_id = m.destinatario_id AND l.tipo = 'privado' AND l.conversa_id = m.remetente_id
   WHERE m.destinatario_id = auth.uid()
     AND m.created_at > COALESCE(l.lido_ate, '-infinity'::timestamptz)
     AND NOT EXISTS (
       SELECT 1 FROM public.social_relacionamentos r
        WHERE r.aluno_a_id = LEAST(m.remetente_id, m.destinatario_id)
          AND r.aluno_b_id = GREATEST(m.remetente_id, m.destinatario_id)
          AND r.status = 'blocked'
     )
   GROUP BY m.remetente_id
  UNION ALL
  SELECT 'guilda'::text, gm.guilda_id, count(*)::integer, max(gm.created_at)
    FROM public.guilda_membros mem
    JOIN public.guilda_mensagens gm
      ON gm.guilda_id = mem.guilda_id
     AND gm.autor_id <> mem.aluno_id
     AND gm.created_at > mem.joined_at
    LEFT JOIN public.chat_leitura l
      ON l.aluno_id = mem.aluno_id AND l.tipo = 'guilda' AND l.conversa_id = mem.guilda_id
   WHERE mem.aluno_id = auth.uid()
     AND mem.left_at IS NULL
     AND gm.created_at > COALESCE(l.lido_ate, '-infinity'::timestamptz)
   GROUP BY gm.guilda_id;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_marcar_lido(p_tipo text, p_conversa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'chat_sem_sessao';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('privado', 'guilda') OR p_conversa_id IS NULL THEN
    RAISE EXCEPTION 'chat_conversa_invalida';
  END IF;
  IF p_tipo = 'guilda' AND NOT EXISTS (
    SELECT 1 FROM public.guilda_membros
     WHERE guilda_id = p_conversa_id AND aluno_id = v_me AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'chat_conversa_invalida';
  END IF;
  INSERT INTO public.chat_leitura (aluno_id, tipo, conversa_id, lido_ate)
  VALUES (v_me, p_tipo, p_conversa_id, now())
  ON CONFLICT (aluno_id, tipo, conversa_id)
    DO UPDATE SET lido_ate = GREATEST(public.chat_leitura.lido_ate, EXCLUDED.lido_ate);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_privado_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_nome text;
  v_lido timestamptz;
BEGIN
  SELECT l.lido_ate INTO v_lido
    FROM public.chat_leitura l
   WHERE l.aluno_id = NEW.destinatario_id AND l.tipo = 'privado' AND l.conversa_id = NEW.remetente_id;
  SELECT COALESCE(NULLIF(btrim(a.apelido), ''), NULLIF(split_part(btrim(a.nome), ' ', 1), ''))
    INTO v_nome
    FROM public.alunos a
   WHERE a.id = NEW.remetente_id;
  PERFORM public.social_notificar_evento(
    NEW.destinatario_id,
    'Nova mensagem',
    COALESCE(v_nome, 'Um colega') || ' mandou uma mensagem para você.',
    'chat_privado',
    'chat:' || NEW.remetente_id::text || ':' || COALESCE(floor(extract(epoch FROM v_lido))::bigint::text, '0'),
    jsonb_build_object('remetente_id', NEW.remetente_id)
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING USING MESSAGE = 'chat_privado_notificar: ' || SQLERRM;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS social_mensagens_notificar ON public.social_mensagens;
CREATE TRIGGER social_mensagens_notificar AFTER INSERT ON public.social_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chat_privado_notificar();

REVOKE EXECUTE ON FUNCTION public.chat_nao_lidas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_marcar_lido(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_nao_lidas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_marcar_lido(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_privado_notificar() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
"""

DOWNGRADE = r"""
DROP TRIGGER IF EXISTS social_mensagens_notificar ON public.social_mensagens;
DROP FUNCTION IF EXISTS public.chat_privado_notificar();
DROP FUNCTION IF EXISTS public.chat_marcar_lido(text, uuid);
DROP FUNCTION IF EXISTS public.chat_nao_lidas();
DELETE FROM public.retencao_politica WHERE tabela = 'chat_leitura';
DROP TABLE IF EXISTS public.chat_leitura;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    op.execute(DOWNGRADE)
