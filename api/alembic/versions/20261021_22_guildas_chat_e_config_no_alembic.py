"""Chat e configuração da guilda: o GRANT que a cadeia nunca deu (4 funções)

> **Correção de premissa (medida em 2026-10-20).** Como a `20261021_21`, esta migration nasceu
> para "trazer quatro RPCs para o Alembic" — e **as quatro já nascem da cadeia**:
> `guilda_chat_listar`/`_chat_enviar` em `docs/mobile/sql/20260913_01`, depois `20260913_03`;
> `guilda_chat_questao_responder` em `20260913_03`; `guilda_atualizar_config` em `20260913_06`.
> O portão `test_rpc_chamada_tem_migracao` não as via porque lia só o texto-fonte dos `.py`, e
> estas migrations executam um `.sql` externo. Ponto cego fechado lá, com teste.
>
> Medido: o md5 de `prosrc` da última definição da cadeia bate com a produção nas quatro. Não
> havia drift, e nada de código faltava.

## O que esta migration faz de verdade

**Revogar o EXECUTE de `PUBLIC`/`anon` e conceder a `authenticated` e `service_role`** — que
nenhum `.sql` de `docs/mobile/sql/` faz (os REVOKE de lá são sobre TABELAS). O risco é presente
e medido: o `ALTER DEFAULT PRIVILEGES` do schema `public` concede EXECUTE a `anon` em **toda
função nova**, é schema não versionado, e na produção o `anon` está revogado nestas quatro
**na mão, fora da cadeia**. Qualquer função nova nesses domínios sem REVOKE explícito nasce
executável pelo anônimo.

> **Correção de escopo (revisão de 21/10):** este parágrafo dizia "um banco novo nasce com as
> quatro abertas ao anônimo". Medido, esse cenário não existe hoje — a cadeia cria 83 tabelas
> mas **não** o schema base (`alunos`, `classe`, `questoes`...), e esta migration é uma das que
> nem chegariam a rodar: `guilda_chat_listar` é `LANGUAGE sql`, e corpo de função SQL é validado
> na criação, lendo `public.alunos` e `public.questoes`. Ver `20261021_21` e
> `docs/architecture/schema-nao-versionado.md`.

O corpo vai junto, verbatim, com md5 conferido no teste: não muda comportamento, mas põe a
última palavra sobre estas funções em `alembic/versions/` e faz drift futuro falhar num teste.

## O detalhe de transcrição que mais importa aqui

**`guilda_chat_listar` é `LANGUAGE sql` e `STABLE`** — a única das dez que não é plpgsql. Perder
o `STABLE` a tornaria `VOLATILE` (o padrão), tirando a possibilidade de ser inlined e mudando o
plano de quem a chama, **sem erro nenhum aparecer**. Teste cobra; conferido na produção
(`provolatile = 's'`, `lanname = 'sql'`).

Ela é também a mais sensível em privilégio: lê `guilda_mensagens` e `alunos` como `postgres`, e
a autorização inteira é o `EXISTS` sobre `guilda_membros`, dentro da subconsulta e antes do
LIMIT. Quem não é membro não recebe linha.

## Observação que NÃO é corrigida aqui

`guilda_chat_questao_responder` faz `(v_m.conteudo->>'id')::bigint` **sem** a guarda
`~ '^[0-9]+$'` que a `guilda_chat_listar` aplica ao mesmo campo. Hoje não estoura porque
`guilda_chat_enviar` é o único caminho que grava `tipo='questao'` e valida o id antes de inserir
(`NULLIF(p_conteudo->>'id','')::bigint` + `fn_questao_liberada`). Mas as duas leitoras do mesmo
campo discordam sobre confiar nele, e quem inserir em `guilda_mensagens` por outro caminho
encontra 22P02 numa e silêncio na outra.

Fica registrado, não consertado: mudar isso é decisão de produto com migration própria.

## Downgrade não remove nada

As quatro existiam antes. Mesma decisão da `_17` e da `_21` — e o downgrade também não devolve
o EXECUTE a `PUBLIC`: reabrir função `SECURITY DEFINER` ao anônimo não é voltar atrás, é criar
um problema.

Revision ID: 20261021_22
Revises: 20261021_21
Create Date: 2026-10-20
"""

from alembic import op

revision = "20261021_22"
down_revision = "20261021_21"
branch_labels = None
depends_on = None


# --------------------------------------------------------------------------------------
# Texto exato de produção (`pg_get_functiondef`, 2026-10-20). Não editar sem medir de novo:
# o teste confere o md5 de `prosrc` de cada uma.
# --------------------------------------------------------------------------------------
VERSIONADAS = """
CREATE OR REPLACE FUNCTION public.guilda_atualizar_config(p_guilda_id uuid, p_nome text, p_descricao text DEFAULT NULL::text, p_emblema text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_modo_perfil text DEFAULT 'misto'::text, p_perfil_alvo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_modo text:=lower(btrim(COALESCE(p_modo_perfil,'misto'))); v_perfil text:=NULLIF(btrim(p_perfil_alvo),'');
BEGIN
  IF v_modo NOT IN ('misto','perfil') OR (v_modo='perfil' AND v_perfil IS NULL) THEN RAISE EXCEPTION 'guilda_configuracao_invalida'; END IF;
  UPDATE public.guildas SET nome=btrim(p_nome), descricao=NULLIF(btrim(p_descricao),''),
    emblema=COALESCE(NULLIF(btrim(p_emblema),''),emblema), logo_url=NULLIF(btrim(p_logo_url),''),
    modo_perfil=v_modo, perfil_alvo=v_perfil, updated_at=now()
   WHERE id=p_guilda_id AND ativa AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  RETURN jsonb_build_object('status','updated','guilda_id',p_guilda_id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_atualizar_config(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_atualizar_config(uuid, text, text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_chat_enviar(p_guilda_id uuid, p_tipo text DEFAULT 'text'::text, p_texto text DEFAULT ''::text, p_conteudo jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_g public.guildas%ROWTYPE; v_tipo text:=lower(btrim(p_tipo)); v_id bigint;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_tipo NOT IN ('text','desafio','questao') OR char_length(btrim(COALESCE(p_texto,''))) > 500 THEN RAISE EXCEPTION 'guilda_mensagem_invalida'; END IF;
  IF v_tipo='questao' THEN v_id:=NULLIF(p_conteudo->>'id','')::bigint; IF v_id IS NULL OR NOT public.fn_questao_liberada(v_id) THEN RAISE EXCEPTION 'guilda_questao_nao_liberada'; END IF; END IF;
  INSERT INTO public.guilda_mensagens(guilda_id,classe_id,autor_id,tipo,texto,conteudo) VALUES(p_guilda_id,v_g.classe_id,auth.uid(),v_tipo,btrim(p_texto),COALESCE(p_conteudo,'{}'::jsonb));
  RETURN jsonb_build_object('status','sent');
END $function$;

REVOKE ALL ON FUNCTION public.guilda_chat_enviar(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_chat_enviar(uuid, text, text, jsonb) TO authenticated, service_role;

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

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(VERSIONADAS)


def downgrade() -> None:
    # As quatro existiam antes desta migration — ver o docstring. Remover derrubaria o chat da
    # guilda na produção para desfazer um commit que não mudou comportamento nenhum.
    pass
