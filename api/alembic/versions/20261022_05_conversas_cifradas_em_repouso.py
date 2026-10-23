"""Conversas dos alunos cifradas em repouso (LGPD, issue #195)

## O que muda

O conteúdo das duas tabelas de conversa passa a ser gravado cifrado:

| tabela             | em claro antes        | cifrado agora                              |
|--------------------|-----------------------|--------------------------------------------|
| `guilda_mensagens` | `texto`, `conteudo`   | `texto_cifrado`, `conteudo_cifrado` (bytea)|
| `social_mensagens` | `texto`               | `texto_cifrado` (bytea)                    |

As colunas em claro **continuam existindo, mas sempre vazias** (`''` / `'{}'`), travadas por
CHECK. Assim nenhum escritor precisa mudar: um trigger `BEFORE INSERT OR UPDATE` cifra o que
chegar e esvazia o claro antes de a linha tocar o heap ou o WAL. O texto em claro nunca é
gravado.

Cifra: `extensions.pgp_sym_encrypt` (pgcrypto já instalado no schema `extensions`), AES-256,
`s2k-mode=1`. A chave é aleatória, então derivação iterada só custaria CPU por mensagem. Medido
num Postgres 17 local, 1000 mensagens de 500 caracteres: cifrar 7 ms com `s2k-mode=1` contra
274 ms no padrão; decifrar 5 ms.
A chave vive no Vault do Supabase com o nome **`chat_mensagens_chave`** e é lida pelo nome,
como `fn_enviar_contato` faz com `brevo_api_key`. Esta migration **não cria a chave** e não
contém valor nenhum dela.

Volume na produção (contagem, só leitura, 2026-10-23): 0 linhas em `guilda_mensagens` e 2 em
`social_mensagens`. O backfill é instantâneo.

Correções de premissa (medidas no catálogo da produção, só leitura, 2026-10-23):
`social_mensagens` não tem `conteudo` (o conteúdo do aluno é `texto` nas duas); não existe
terceira tabela de conversa; não há trigger, view, publication (Realtime) nem GRANT de tabela
para `anon`/`authenticated` nelas — as duas são **só de RPC**, com RLS ligada e zero policies,
por decisão: todo acesso passa por funções `SECURITY DEFINER` donas de `postgres`.

## Funções

Sete funções da produção tocam as tabelas. Só as três **leitoras** mudam:

- `guilda_chat_listar`: decifra `texto`/`conteudo` dentro da subconsulta com LIMIT. O planner
  avalia a decifra (COST 1000) acima do Sort, depois do LIMIT: no máximo 100 linhas decifradas
  por chamada (conferido com EXPLAIN VERBOSE e no teste e2e com uma cifra estragada fora do
  limite). Continua `LANGUAGE sql STABLE`, mesmo JSON de saída,
  mesmo `EXISTS` de membro ativo (`left_at IS NULL`) antes do LIMIT.
- `guilda_chat_questao_responder`: depois do `SELECT ... INTO v_m`, `v_m.conteudo` recebe o
  conteúdo decifrado; o resto do corpo é o de produção.
- `social_chat_listar`: `'texto'` sai decifrado; política de colega/bloqueio intacta.

As quatro **escritoras** (`guilda_chat_enviar`, `social_chat_enviar`, `guilda_desafio_criar`,
`arena_desafio_criar`) não mudam: o trigger cifra o INSERT delas.

Funções novas (todas com EXECUTE revogado de PUBLIC, anon, authenticated e service_role):
`chat_chave()`, `chat_cifrar(text, text)`, `chat_decifrar(bytea, text)` e os dois triggers.
Os triggers são `SECURITY DEFINER` para que um INSERT direto por `service_role` também seja
cifrado (sem isso ele falharia fechado, porque `chat_chave()` está revogada dele).

## Busca, ordenação, filtro

Nada no app filtra, ordena ou busca pelo conteúdo: as leituras usam `created_at`, ids, `tipo`
e a participação. Os índices (`guilda_mensagens_feed_idx`, `social_mensagens_par_idx`) não
incluem as colunas cifradas. O único uso de conteúdo como chave é `conteudo->>'id'` da questão,
feito depois de decifrar.

## Validação que saiu das CHECK

`social_mensagens_texto_check` (btrim entre 1 e 500) não pode valer sobre `''`, então é
removida e o trigger aplica a mesma regra, com o mesmo SQLSTATE (23514) e o mesmo nome de
constraint na mensagem. `guilda_mensagens_texto_check` (<= 500) fica, e o trigger repete a
regra antes de esvaziar.

## Antes do deploy (o upgrade falha sem isso)

`DATABASE_MIGRATIONS_ON_STARTUP` é True na produção: esta migration roda ao subir a API. Se o
segredo `chat_mensagens_chave` não existir no Vault, o upgrade aborta com
`segredo chat_mensagens_chave ausente no Vault` (nada muda, a transação volta) e a API não sobe.
Perder a chave é perder as mensagens: o plano Free não tem backup. Rotação da chave fica para
uma issue separada.

## O que isto protege, e o que não

Protege o dado **fora do banco vivo**: dump, backup e réplica guardam só bytea cifrado, e a
chave não vai junto. E o REVOKE fecha `chat_chave()`, `chat_cifrar` e `chat_decifrar` para
os papéis do cliente (`anon`, `authenticated`): nem uma RPC nova esquecida aberta os expõe.

**Não** protege contra quem tem privilégio no banco vivo. Na produção o `service_role` lê
`vault.decrypted_secrets` e executa `extensions.pgp_sym_decrypt`, então ele decifra sem
precisar de `chat_chave()` — o REVOKE dele aqui é só higiene, não barreira. O mesmo vale para
`postgres` e para quem entra no painel do Supabase.

## Lock

`SET LOCAL lock_timeout = '5s'` antes do primeiro `ALTER TABLE`, no upgrade e no downgrade: se
uma transação longa estiver segurando a tabela, a migration desiste em 5 s (a transação volta
inteira) em vez de enfileirar o ACCESS EXCLUSIVE e travar o chat atrás dela. No fim volta ao
padrão, para não valer para as migrations seguintes da mesma transação.

## Downgrade

Exige a chave, decifra de volta para as colunas em claro, restaura a CHECK original e os três
corpos de produção (md5 de `prosrc` conferido no teste) e remove colunas e funções novas.

Revision ID: 20261022_05
Revises: 20261022_04
Create Date: 2026-10-23
"""

from alembic import op

revision = "20261022_05"
down_revision = "20261022_04"
branch_labels = None
depends_on = None

CHAVE_VAULT = "chat_mensagens_chave"


# ---------------------------------------------------------------------------- utilitários
HELPERS = """
CREATE OR REPLACE FUNCTION public.chat_chave()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
DECLARE v_chave text;
BEGIN
  SELECT decrypted_secret INTO v_chave FROM vault.decrypted_secrets WHERE name = 'chat_mensagens_chave';
  IF v_chave IS NULL OR v_chave = '' THEN
    RAISE EXCEPTION USING MESSAGE = 'segredo chat_mensagens_chave ausente no Vault';
  END IF;
  RETURN v_chave;
END $function$;

CREATE OR REPLACE FUNCTION public.chat_cifrar(p_texto text, p_chave text)
 RETURNS bytea
 LANGUAGE sql
 VOLATILE STRICT
 SET search_path TO 'extensions', 'pg_temp'
AS $function$
  SELECT extensions.pgp_sym_encrypt(p_texto, p_chave, 'cipher-algo=aes256, s2k-mode=1');
$function$;

CREATE OR REPLACE FUNCTION public.chat_decifrar(p_dado bytea, p_chave text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 COST 1000
 SET search_path TO 'extensions', 'pg_temp'
AS $function$
  SELECT extensions.pgp_sym_decrypt(p_dado, p_chave);
$function$;

REVOKE ALL ON FUNCTION public.chat_chave() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.chat_cifrar(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.chat_decifrar(bytea, text) FROM PUBLIC, anon, authenticated, service_role;

DO $do$ BEGIN PERFORM public.chat_chave(); END $do$;
"""

LOCK_TIMEOUT = "SET LOCAL lock_timeout = '5s';"
LOCK_TIMEOUT_PADRAO = "SET LOCAL lock_timeout TO DEFAULT;"

COLUNAS_E_BACKFILL = """
ALTER TABLE public.guilda_mensagens ADD COLUMN texto_cifrado bytea, ADD COLUMN conteudo_cifrado bytea;
UPDATE public.guilda_mensagens m
   SET texto_cifrado = public.chat_cifrar(m.texto, k.chave),
       conteudo_cifrado = public.chat_cifrar(m.conteudo::text, k.chave),
       texto = '', conteudo = '{}'::jsonb
  FROM (SELECT public.chat_chave() AS chave) k;
ALTER TABLE public.guilda_mensagens
  ALTER COLUMN texto_cifrado SET NOT NULL,
  ALTER COLUMN conteudo_cifrado SET NOT NULL,
  ADD CONSTRAINT guilda_mensagens_em_claro_vazio_check CHECK (texto = '' AND conteudo = '{}'::jsonb);

ALTER TABLE public.social_mensagens ADD COLUMN texto_cifrado bytea;
ALTER TABLE public.social_mensagens DROP CONSTRAINT social_mensagens_texto_check;
UPDATE public.social_mensagens m
   SET texto_cifrado = public.chat_cifrar(m.texto, k.chave), texto = ''
  FROM (SELECT public.chat_chave() AS chave) k;
ALTER TABLE public.social_mensagens
  ALTER COLUMN texto_cifrado SET NOT NULL,
  ADD CONSTRAINT social_mensagens_em_claro_vazio_check CHECK (texto = '');

COMMENT ON COLUMN public.guilda_mensagens.texto IS 'Sempre vazio. Conteúdo em texto_cifrado (pgp_sym, chave Vault chat_mensagens_chave). Ver 20261022_05.';
COMMENT ON COLUMN public.guilda_mensagens.conteudo IS 'Sempre {}. Conteúdo em conteudo_cifrado (jsonb como texto, cifrado). Ver 20261022_05.';
COMMENT ON COLUMN public.social_mensagens.texto IS 'Sempre vazio. Conteúdo em texto_cifrado (pgp_sym, chave Vault chat_mensagens_chave). Ver 20261022_05.';
"""

TRIGGERS = """
CREATE OR REPLACE FUNCTION public.chat_guilda_mensagens_cifrar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_chave text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.texto IS NOT DISTINCT FROM OLD.texto AND NEW.conteudo IS NOT DISTINCT FROM OLD.conteudo THEN
    RETURN NEW;
  END IF;
  IF NEW.texto IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', COLUMN = 'texto', TABLE = 'guilda_mensagens', SCHEMA = 'public',
      MESSAGE = 'null value in column "texto" of relation "guilda_mensagens" violates not-null constraint';
  END IF;
  IF NEW.conteudo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', COLUMN = 'conteudo', TABLE = 'guilda_mensagens', SCHEMA = 'public',
      MESSAGE = 'null value in column "conteudo" of relation "guilda_mensagens" violates not-null constraint';
  END IF;
  IF char_length(NEW.texto) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'guilda_mensagens_texto_check', TABLE = 'guilda_mensagens', SCHEMA = 'public',
      MESSAGE = 'new row for relation "guilda_mensagens" violates check constraint "guilda_mensagens_texto_check"';
  END IF;
  v_chave := public.chat_chave();
  IF TG_OP = 'INSERT' OR NEW.texto IS DISTINCT FROM OLD.texto THEN
    NEW.texto_cifrado := public.chat_cifrar(NEW.texto, v_chave);
    NEW.texto := '';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN
    NEW.conteudo_cifrado := public.chat_cifrar(NEW.conteudo::text, v_chave);
    NEW.conteudo := '{}'::jsonb;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.chat_social_mensagens_cifrar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.texto IS NOT DISTINCT FROM OLD.texto THEN
    RETURN NEW;
  END IF;
  IF NEW.texto IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', COLUMN = 'texto', TABLE = 'social_mensagens', SCHEMA = 'public',
      MESSAGE = 'null value in column "texto" of relation "social_mensagens" violates not-null constraint';
  END IF;
  IF char_length(btrim(NEW.texto)) < 1 OR char_length(btrim(NEW.texto)) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'social_mensagens_texto_check', TABLE = 'social_mensagens', SCHEMA = 'public',
      MESSAGE = 'new row for relation "social_mensagens" violates check constraint "social_mensagens_texto_check"';
  END IF;
  NEW.texto_cifrado := public.chat_cifrar(NEW.texto, public.chat_chave());
  NEW.texto := '';
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.chat_guilda_mensagens_cifrar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.chat_social_mensagens_cifrar() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guilda_mensagens_cifrar BEFORE INSERT OR UPDATE ON public.guilda_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chat_guilda_mensagens_cifrar();
CREATE TRIGGER social_mensagens_cifrar BEFORE INSERT OR UPDATE ON public.social_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.chat_social_mensagens_cifrar();
"""

# ------------------------------------------------------------------- leitoras (upgrade)
GUILDA_LEITORAS = """
CREATE OR REPLACE FUNCTION public.guilda_chat_listar(p_guilda_id uuid, p_limite integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'guilda_id',m.guilda_id,'autor_id',m.autor_id,'autor_nome',a.nome,'autor_foto_url',a.foto_url,'tipo',m.tipo,
    'texto',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN 'Questão bloqueada para você' ELSE m.texto END,
    'conteudo',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN jsonb_build_object('id',m.conteudo->>'id','bloqueada',true) ELSE m.conteudo || CASE WHEN q.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('enunciado',q.enunciado,'tipo',q.tipo,'alternativas',q.alternativas,'atividade_id',q.atividade_id) END END,
    'created_at',m.created_at) ORDER BY m.created_at), '[]'::jsonb)
  FROM (SELECT m.id,m.guilda_id,m.autor_id,m.tipo,m.created_at,public.chat_decifrar(m.texto_cifrado,(SELECT public.chat_chave())) AS texto,public.chat_decifrar(m.conteudo_cifrado,(SELECT public.chat_chave()))::jsonb AS conteudo FROM public.guilda_mensagens m WHERE m.guilda_id=p_guilda_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL) ORDER BY m.created_at DESC LIMIT GREATEST(1,LEAST(p_limite,100))) m
  JOIN public.alunos a ON a.id=m.autor_id LEFT JOIN public.questoes q ON m.tipo='questao' AND q.id=CASE WHEN (m.conteudo->>'id') ~ '^[0-9]+$' THEN (m.conteudo->>'id')::bigint ELSE NULL END;
$function$;

REVOKE ALL ON FUNCTION public.guilda_chat_listar(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_chat_listar(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_chat_questao_responder(p_mensagem_id uuid, p_resposta text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q public.questoes%ROWTYPE; v_m public.guilda_mensagens%ROWTYPE; v_resposta text:=btrim(COALESCE(p_resposta,'')); v_correta boolean; v_tentativa integer;
BEGIN
  SELECT * INTO v_m FROM public.guilda_mensagens m WHERE m.id=p_mensagem_id AND m.tipo='questao' AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL);
  IF FOUND THEN v_m.conteudo := public.chat_decifrar(v_m.conteudo_cifrado, public.chat_chave())::jsonb; END IF;
  IF NOT FOUND OR NOT public.fn_questao_liberada((v_m.conteudo->>'id')::bigint) THEN RAISE EXCEPTION 'guilda_questao_sem_permissao'; END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id=(v_m.conteudo->>'id')::bigint;
  IF v_resposta='' THEN RAISE EXCEPTION 'guilda_resposta_invalida'; END IF;
  v_correta=lower(v_resposta)=lower(btrim(v_q.resposta_correta::text));
  SELECT COALESCE(max(tentativa),0)+1 INTO v_tentativa FROM public.questao_aluno WHERE aluno_id=auth.uid() AND questao_id=v_q.id;
  INSERT INTO public.questao_aluno(aluno_id,questao_id,atividade_id,tentativa,resposta,correta,acertos_percentual) VALUES(auth.uid(),v_q.id,v_q.atividade_id,v_tentativa,v_resposta,v_correta,CASE WHEN v_correta THEN 100 ELSE 0 END);
  RETURN jsonb_build_object('correta',v_correta,'tipo',v_q.tipo);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_chat_questao_responder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_chat_questao_responder(uuid, text) TO authenticated, service_role;
"""


# Cópia literal de `20260913_10` (CHAT_POLICY e `_function`): o corpo de produção da
# `social_chat_listar` sai daqui, então qualquer diferença muda o md5 que o teste confere.
CHAT_POLICY = """
  IF NOT EXISTS (
    SELECT 1
      FROM public.classe_aluno mine
      JOIN public.classe_aluno other ON other.classe_id = mine.classe_id
     WHERE mine.aluno_id = auth.uid()
       AND other.aluno_id = p_destinatario_id
  ) THEN RAISE EXCEPTION 'social_chat_fora_da_turma'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.social_relacionamentos r
     WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id)
       AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id)
       AND r.status='blocked'
  ) THEN RAISE EXCEPTION 'social_chat_bloqueado'; END IF;
"""


def _social_listar(action: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.social_chat_listar(p_destinatario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE 
BEGIN
  IF auth.uid() IS NULL OR p_destinatario_id IS NULL OR p_destinatario_id = auth.uid()
    THEN RAISE EXCEPTION 'social_chat_destinatario_invalido'; END IF;
  
{CHAT_POLICY}
  {action}
END;
$fn$;

REVOKE ALL ON FUNCTION public.social_chat_listar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_chat_listar(uuid) TO authenticated, service_role;
"""


SOCIAL_LISTAR = """
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'remetente_id',m.remetente_id,'destinatario_id',m.destinatario_id,
    'texto',public.chat_decifrar(m.texto_cifrado,(SELECT public.chat_chave())),'created_at',m.created_at,'remetente_nome',a.nome,
    'remetente_foto_url',a.foto_url
  ) ORDER BY m.created_at)
    FROM public.social_mensagens m
    JOIN public.alunos a ON a.id=m.remetente_id
   WHERE (m.remetente_id=auth.uid() AND m.destinatario_id=p_destinatario_id)
      OR (m.remetente_id=p_destinatario_id AND m.destinatario_id=auth.uid())), '[]'::jsonb);
"""

UPGRADE_SQL = [
    HELPERS,
    LOCK_TIMEOUT,
    COLUNAS_E_BACKFILL,
    TRIGGERS,
    GUILDA_LEITORAS,
    _social_listar(SOCIAL_LISTAR),
    LOCK_TIMEOUT_PADRAO,
    "NOTIFY pgrst, 'reload schema';",
]


def upgrade() -> None:
    for sql in UPGRADE_SQL:
        op.execute(sql)


def downgrade() -> None:
    for sql in DOWNGRADE_SQL:
        op.execute(sql)


# ------------------------------------------------------------------------- downgrade
# Daqui para baixo é só reversão. Fica depois do `downgrade()` de propósito: os portões
# `test_rpc_chamada_tem_migracao` e `test_definer_exposto_sem_sessao` leem apenas o texto
# anterior a ele como "o que o upgrade emite".

# Texto exato de produção das duas leitoras da guilda (igual ao da `20261021_22`).
GUILDA_LEITORAS_ANTES = """
CREATE OR REPLACE FUNCTION public.guilda_chat_listar(p_guilda_id uuid, p_limite integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'guilda_id',m.guilda_id,'autor_id',m.autor_id,'autor_nome',a.nome,'autor_foto_url',a.foto_url,'tipo',m.tipo,
    'texto',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN 'Questão bloqueada para você' ELSE m.texto END,
    'conteudo',CASE WHEN m.tipo='questao' AND (q.id IS NULL OR NOT public.fn_questao_liberada(q.id)) THEN jsonb_build_object('id',m.conteudo->>'id','bloqueada',true) ELSE m.conteudo || CASE WHEN q.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('enunciado',q.enunciado,'tipo',q.tipo,'alternativas',q.alternativas,'atividade_id',q.atividade_id) END END,
    'created_at',m.created_at) ORDER BY m.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.guilda_mensagens m WHERE m.guilda_id=p_guilda_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL) ORDER BY m.created_at DESC LIMIT GREATEST(1,LEAST(p_limite,100))) m
  JOIN public.alunos a ON a.id=m.autor_id LEFT JOIN public.questoes q ON m.tipo='questao' AND q.id=CASE WHEN (m.conteudo->>'id') ~ '^[0-9]+$' THEN (m.conteudo->>'id')::bigint ELSE NULL END;
$function$;

REVOKE ALL ON FUNCTION public.guilda_chat_listar(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_chat_listar(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_chat_questao_responder(p_mensagem_id uuid, p_resposta text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q public.questoes%ROWTYPE; v_m public.guilda_mensagens%ROWTYPE; v_resposta text:=btrim(COALESCE(p_resposta,'')); v_correta boolean; v_tentativa integer;
BEGIN
  SELECT * INTO v_m FROM public.guilda_mensagens m WHERE m.id=p_mensagem_id AND m.tipo='questao' AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=m.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL);
  IF NOT FOUND OR NOT public.fn_questao_liberada((v_m.conteudo->>'id')::bigint) THEN RAISE EXCEPTION 'guilda_questao_sem_permissao'; END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id=(v_m.conteudo->>'id')::bigint;
  IF v_resposta='' THEN RAISE EXCEPTION 'guilda_resposta_invalida'; END IF;
  v_correta=lower(v_resposta)=lower(btrim(v_q.resposta_correta::text));
  SELECT COALESCE(max(tentativa),0)+1 INTO v_tentativa FROM public.questao_aluno WHERE aluno_id=auth.uid() AND questao_id=v_q.id;
  INSERT INTO public.questao_aluno(aluno_id,questao_id,atividade_id,tentativa,resposta,correta,acertos_percentual) VALUES(auth.uid(),v_q.id,v_q.atividade_id,v_tentativa,v_resposta,v_correta,CASE WHEN v_correta THEN 100 ELSE 0 END);
  RETURN jsonb_build_object('correta',v_correta,'tipo',v_q.tipo);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_chat_questao_responder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_chat_questao_responder(uuid, text) TO authenticated, service_role;
"""

# Literal de `20260913_10.LISTAR`.
SOCIAL_LISTAR_ANTES = """
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'remetente_id',m.remetente_id,'destinatario_id',m.destinatario_id,
    'texto',m.texto,'created_at',m.created_at,'remetente_nome',a.nome,
    'remetente_foto_url',a.foto_url
  ) ORDER BY m.created_at)
    FROM public.social_mensagens m
    JOIN public.alunos a ON a.id=m.remetente_id
   WHERE (m.remetente_id=auth.uid() AND m.destinatario_id=p_destinatario_id)
      OR (m.remetente_id=p_destinatario_id AND m.destinatario_id=auth.uid())), '[]'::jsonb);
"""

DECIFRA_DE_VOLTA = """
DO $do$ BEGIN PERFORM public.chat_chave(); END $do$;

DROP TRIGGER IF EXISTS guilda_mensagens_cifrar ON public.guilda_mensagens;
DROP TRIGGER IF EXISTS social_mensagens_cifrar ON public.social_mensagens;

ALTER TABLE public.guilda_mensagens DROP CONSTRAINT guilda_mensagens_em_claro_vazio_check;
UPDATE public.guilda_mensagens m
   SET texto = public.chat_decifrar(m.texto_cifrado, k.chave),
       conteudo = public.chat_decifrar(m.conteudo_cifrado, k.chave)::jsonb
  FROM (SELECT public.chat_chave() AS chave) k;

ALTER TABLE public.social_mensagens DROP CONSTRAINT social_mensagens_em_claro_vazio_check;
UPDATE public.social_mensagens m
   SET texto = public.chat_decifrar(m.texto_cifrado, k.chave)
  FROM (SELECT public.chat_chave() AS chave) k;
ALTER TABLE public.social_mensagens ADD CONSTRAINT social_mensagens_texto_check
  CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 500)));

COMMENT ON COLUMN public.guilda_mensagens.texto IS NULL;
COMMENT ON COLUMN public.guilda_mensagens.conteudo IS NULL;
COMMENT ON COLUMN public.social_mensagens.texto IS NULL;
"""

REMOVE_NOVOS = """
ALTER TABLE public.guilda_mensagens DROP COLUMN texto_cifrado, DROP COLUMN conteudo_cifrado;
ALTER TABLE public.social_mensagens DROP COLUMN texto_cifrado;
DROP FUNCTION public.chat_guilda_mensagens_cifrar();
DROP FUNCTION public.chat_social_mensagens_cifrar();
DROP FUNCTION public.chat_decifrar(bytea, text);
DROP FUNCTION public.chat_cifrar(text, text);
DROP FUNCTION public.chat_chave();
"""

DOWNGRADE_SQL = [
    LOCK_TIMEOUT,
    DECIFRA_DE_VOLTA,
    GUILDA_LEITORAS_ANTES,
    _social_listar(SOCIAL_LISTAR_ANTES),
    REMOVE_NOVOS,
    LOCK_TIMEOUT_PADRAO,
    "NOTIFY pgrst, 'reload schema';",
]
