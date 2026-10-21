"""O ciclo de vida da guilda: o GRANT que a cadeia nunca deu (6 funções)

> **Correção de premissa (medida em 2026-10-20, depois de escrever esta migration).**
> Ela nasceu para "trazer seis RPCs de guilda para o Alembic", porque o portão
> `test_rpc_chamada_tem_migracao` as listava como criadas pelo painel do Supabase. **Era falso.**
> As seis são criadas pela cadeia desde setembro, por `docs/mobile/sql/20260912_03` e
> `20260913_07`, que as migrations `20260912_07` e `20260913_07` executam com
> `op.execute(path.read_text(...))`. O portão não as via porque lia o texto-fonte dos `.py` e
> procurava `CREATE FUNCTION` literal — ponto cego agora fechado, com teste.
>
> Conferido por medição: o md5 de `prosrc` da última definição da cadeia bate com o da produção
> para as seis. Não havia drift. **Nada de código faltava.**

## O que esta migration faz de verdade, então

Uma coisa só, e ela é real: **revogar o EXECUTE de `PUBLIC`/`anon` e conceder a
`authenticated` e `service_role`** — o conjunto que a produção tem, medido em `pg_proc.proacl`.
Nenhum `.sql` de `docs/mobile/sql/` faz isso: os REVOKE de lá são sobre TABELAS, não funções.

O que torna isso um buraco de verdade, medido:

- o `ALTER DEFAULT PRIVILEGES` do schema `public` na produção concede EXECUTE a `anon` em
  **toda função nova** — e é schema não versionado;
- na produção o `anon` está revogado nas seis, mas **na mão, fora da cadeia**. A prova é
  `social_par`, a única função do domínio que ainda carrega `=X/postgres` (PUBLIC);
- logo, **qualquer função nova** criada nesses domínios sem REVOKE explícito nasce executável
  pelo anônimo, hoje, na produção. É esse o risco alcançável, e é o que o teste de cobertura de
  `test_migration_guilda_social_grants.py` passou a cobrar.

> **Correção de escopo (revisão de 21/10).** A primeira versão deste parágrafo dizia que "um
> banco construído do zero ficava com as seis abertas ao anônimo". Esse cenário **não existe
> hoje**: medido, a cadeia do Alembic cria 83 tabelas mas **não cria o schema base** — nada de
> `alunos`, `classe`, `classe_aluno`, `perfil`, `questoes`, `topicos`, `professor`. A primeira
> revisão é `20260405_01`, de tabelas de checkpoint do LangGraph. `alembic upgrade head` sobre
> banco vazio aborta muito antes de chegar aqui, e `docs/architecture/schema-nao-versionado.md`
> já concluiu que o caminho é um baseline de `pg_dump --schema-only` + `alembic stamp`. O
> argumento acima vale sem depender daquele cenário: o default do schema concede a `anon`
> agora, na produção.

## E, de brinde, o texto passa a ser conferido

O corpo das seis é o texto exato de produção (`pg_get_functiondef`, 2026-10-20) em
`CREATE OR REPLACE`, e o teste confere o md5 de `prosrc` de cada uma. Isso não acrescenta
comportamento — aplicar é no-op nesse aspecto —, mas põe a **última palavra** sobre estas
funções em `alembic/versions/` em vez de num `.sql` de setembro, e faz drift futuro falhar num
teste em vez de aparecer na produção.

Molde: `20261021_17` e `_19`.

## Downgrade não remove nada

As seis existiam antes desta revisão. Mesma decisão da `_17` para `guilda_atualizar`: remover
derrubaria o recurso na produção para desfazer um commit que não muda comportamento. O
downgrade também **não devolve** o EXECUTE a `PUBLIC` — reabrir função `SECURITY DEFINER` ao
anônimo não é "voltar ao estado anterior", é criar um problema.

Revision ID: 20261021_21
Revises: 20261021_20
Create Date: 2026-10-20
"""

from alembic import op

revision = "20261021_21"
down_revision = "20261021_20"
branch_labels = None
depends_on = None


# --------------------------------------------------------------------------------------
# Texto exato de produção (`pg_get_functiondef`, 2026-10-20). Não editar sem medir de novo:
# o teste confere o md5 de `prosrc` de cada uma.
# --------------------------------------------------------------------------------------
VERSIONADAS = """
CREATE OR REPLACE FUNCTION public.guilda_convidar(p_guilda_id uuid, p_convidado_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid:=auth.uid(); v_g public.guildas%ROWTYPE; v_count integer; v_perfil text;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa
    AND EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=v_me AND left_at IS NULL) FOR UPDATE;
  IF NOT FOUND OR p_convidado_id IS NULL OR p_convidado_id=v_me THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_e_colega(p_convidado_id,v_g.classe_id) OR NOT public.guilda_janela_aberta(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  IF public.guilda_bloqueio_ativo(v_me,p_convidado_id) THEN RAISE EXCEPTION 'social_bloqueio_impede_guilda'; END IF;
  IF v_g.modo_perfil='perfil' THEN
    SELECT perfil_ativo INTO v_perfil FROM public.alunos WHERE id=p_convidado_id;
    IF v_perfil IS DISTINCT FROM v_g.perfil_alvo THEN RAISE EXCEPTION 'guilda_perfil_incompativel'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=p_convidado_id AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  INSERT INTO public.guilda_convites(guilda_id,classe_id,convidante_id,convidado_id) VALUES(p_guilda_id,v_g.classe_id,v_me,p_convidado_id)
    ON CONFLICT (guilda_id,convidado_id) WHERE status='pending' DO NOTHING;
  RETURN jsonb_build_object('status','pending','guilda_id',p_guilda_id,'convidado_id',p_convidado_id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_convidar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_convidar(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(p_convite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_i public.guilda_convites%ROWTYPE; v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_i FROM public.guilda_convites WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  IF NOT public.guilda_janela_aberta(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  SELECT * INTO v_g FROM public.guildas WHERE id=v_i.guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_nao_encontrada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_g.id,v_i.classe_id,auth.uid());
  UPDATE public.guilda_convites SET status='accepted',responded_at=now() WHERE id=v_i.id;
  RETURN jsonb_build_object('status','accepted','guilda_id',v_g.id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_aceitar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_aceitar_convite(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_recusar_convite(p_convite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.guilda_convites SET status='declined',responded_at=now() WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  RETURN jsonb_build_object('status','declined');
END $function$;

REVOKE ALL ON FUNCTION public.guilda_recusar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_recusar_convite(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_entrar(p_guilda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_g FROM public.guildas WHERE id=p_guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND OR NOT public.guilda_e_colega(auth.uid(),v_g.classe_id) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF NOT public.guilda_janela_aberta(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(p_guilda_id,v_g.classe_id,auth.uid());
  RETURN jsonb_build_object('status','joined','guilda_id',p_guilda_id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_entrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_entrar(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_sair(p_guilda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.guilda_membros SET left_at=now() WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_membro_nao_encontrado'; END IF;
  RETURN jsonb_build_object('status','left','guilda_id',p_guilda_id);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_sair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_sair(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guilda_dissolver(p_guilda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.guildas SET ativa=false,updated_at=now() WHERE id=p_guilda_id AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  UPDATE public.guilda_membros SET left_at=COALESCE(left_at,now()) WHERE guilda_id=p_guilda_id AND left_at IS NULL;
  UPDATE public.guilda_convites SET status='cancelled',responded_at=now() WHERE guilda_id=p_guilda_id AND status='pending';
  RETURN jsonb_build_object('status','dissolved','guilda_id',p_guilda_id);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_dissolver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_dissolver(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(VERSIONADAS)


def downgrade() -> None:
    # As seis existiam antes desta migration — ver o docstring. Remover derrubaria o recurso de
    # guildas na produção para desfazer um commit que não mudou comportamento nenhum.
    pass
