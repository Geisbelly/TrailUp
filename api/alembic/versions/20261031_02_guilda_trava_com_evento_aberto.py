"""Guilda: com evento de guilda aberto ninguém entra em guilda, e o aluno pontua por uma só (#153)

## O que estava errado

A #153 decidiu: "Aberto o evento, ninguém troca de guilda." A apuração já é imune (pontua contra a
cópia `guilda_evento_snapshot`, tirada na mesma transação que abre o evento, `20261025_04`), mas as
RPCs de formação não olhavam evento nenhum. Com um evento de guilda aberto, o aluno criava guilda,
entrava, convidava e aceitava convite normalmente: a composição viva divergia da congelada, e quem
entrava aparecia na guilda sem pontuar por ela no evento, sem nenhum aviso.

E a corrida que a issue pede para fechar ("gravar a cópia e marcar o evento como aberto têm que
estar na mesma transação") só estava fechada de um lado. Uma entrada que leu "nenhum evento aberto"
antes de a abertura confirmar podia gravar o membro DEPOIS que a cópia foi tirada.

## O que muda

- `fn_guilda_composicao_congelada(turma)`: toma uma trava consultiva por turma e diz se há evento
  `aberto` com `modalidade_guilda`. Helper interno (só `service_role`), como os da `20261021_25`.
- `guilda_criar`, `guilda_convidar`, `guilda_aceitar_convite` e `guilda_entrar` chamam a função logo
  depois da checagem da janela e levantam `guilda_evento_aberto`. São os quatro caminhos que POEM
  alguém numa guilda; sem eles não há troca.
- `fn_guilda_congelar_composicao` toma a mesma trava antes de copiar. Com as duas pontas na trava, ou
  a entrada termina antes e entra na cópia, ou a cópia termina antes e a entrada vê o evento aberto.
- `fn_guilda_congelar_composicao` passa a pôr cada aluno em UMA guilda da cópia: a primeira em que
  ele entrou (empate: o id da guilda). Decisão de 31/10: o aluno pode estar em várias guildas da
  turma (#197), mas no evento os pontos dele contam para uma só. Antes, a cópia o punha em todas, e
  a apuração (que soma sobre a cópia) creditava os mesmos pontos a cada uma. A regra mora na cópia
  porque é ela que a apuração, o "durante" e o resultado leem.

O resto de cada corpo é o texto exato de produção (`pg_get_functiondef`, 31/10, só leitura; conferido
igual ao da `20261021_21` nas três que ela versiona).

## O que fica de fora, de propósito

- **Sair e dissolver continuam livres.** O app já os trata como fora da janela (`guildWindowModel.ts`:
  "Sair e dissolver não dependem da janela"), sair não muda a pontuação do evento (a apuração lê a
  cópia; `20261025_03` mantém os pontos de quem saiu), e prender o aluno numa guilda durante o
  evento seria pior que o problema, por exemplo depois de um bloqueio.
- **Um aluno em várias guildas da turma** continua permitido fora do evento: é o recurso da #197
  (`docs/mobile/sql/20260913_07_multiplas_guildas_por_aluno.sql`). Só a pontuação do evento passa a
  escolher uma.

Em produção (31/10): nenhum evento e nenhuma guilda ainda, então nada muda para quem já usa.

Revision ID: 20261031_02
Revises: 20261031_01
Create Date: 2026-10-31
"""

from alembic import op

revision = "20261031_02"
down_revision = "20261031_01"
branch_labels = None
depends_on = None

HELPER = r"""
CREATE OR REPLACE FUNCTION public.fn_guilda_composicao_congelada(p_classe_id bigint)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Trava por turma ANTES de olhar o evento, e a mesma que `fn_guilda_congelar_composicao` toma.
  -- Sem ela, uma entrada que leu "nenhum evento aberto" pode gravar o membro depois que a cópia
  -- foi tirada: guilda com um membro que não pontua, sem erro em lugar nenhum (#153).
  PERFORM pg_advisory_xact_lock(hashtext('guilda_composicao:' || p_classe_id::text));
  RETURN EXISTS (
    SELECT 1 FROM public.eventos_classe e
     WHERE e.classe_id = p_classe_id AND e.status = 'aberto' AND e.modalidade_guilda
  );
END
$function$;

-- Helper interno: só os `SECURITY DEFINER` de guilda o chamam (mesmo critério da `20261021_25`).
REVOKE ALL ON FUNCTION public.fn_guilda_composicao_congelada(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_guilda_composicao_congelada(bigint) TO service_role;
"""

# Texto de produção (31/10) com a guarda logo depois da janela.
FORMACAO = r"""
CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL::text, p_emblema text DEFAULT 'constellation'::text, p_logo_url text DEFAULT NULL::text, p_modo_perfil text DEFAULT 'misto'::text, p_perfil_alvo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid:=auth.uid(); v_class bigint; v_id uuid; v_limit integer; v_modo text:=lower(btrim(COALESCE(p_modo_perfil,'misto'))); v_perfil text:=NULLIF(btrim(p_perfil_alvo),'');
BEGIN
  v_class:=public.guilda_classe_atual(p_classe_id);
  IF v_class IS NULL OR NOT public.guilda_e_colega(v_me,v_class) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_modo NOT IN ('misto','perfil') OR (v_modo='perfil' AND v_perfil IS NULL) THEN RAISE EXCEPTION 'guilda_configuracao_invalida'; END IF;
  IF NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF public.fn_guilda_composicao_congelada(v_class) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
  SELECT LEAST(COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),10),10) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,logo_url,modo_perfil,perfil_alvo,limite_membros,criado_por)
  VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),NULLIF(btrim(p_logo_url),''),v_modo,v_perfil,v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) TO authenticated, service_role;

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
  IF public.fn_guilda_composicao_congelada(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
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
  IF public.fn_guilda_composicao_congelada(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
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
  IF public.fn_guilda_composicao_congelada(v_g.classe_id) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
  IF EXISTS (SELECT 1 FROM public.guilda_membros WHERE guilda_id=p_guilda_id AND aluno_id=auth.uid() AND left_at IS NULL) THEN RAISE EXCEPTION 'guilda_membro_existente'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(p_guilda_id,v_g.classe_id,auth.uid());
  RETURN jsonb_build_object('status','joined','guilda_id',p_guilda_id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_entrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_entrar(uuid) TO authenticated, service_role;

"""

CONGELAR = r"""
CREATE OR REPLACE FUNCTION public.fn_guilda_congelar_composicao(p_evento_id text, p_classe_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- SEM checagem de professor de proposito: a abertura pela varredura nao tem sessao. Quem chama
  -- pelo cliente passa por `guilda_congelar_composicao`, que confere a posse e delega para ca.
  -- A mesma trava de `fn_guilda_composicao_congelada`: quem entra em guilda nesta turma espera a
  -- cópia terminar (e então vê o evento aberto), ou a cópia espera a entrada terminar (e a vê).
  PERFORM pg_advisory_xact_lock(hashtext('guilda_composicao:' || p_classe_id::text));
  -- Uma guilda por aluno no evento: a primeira em que ele entrou (empate: o id da guilda). O aluno
  -- pode estar em várias guildas da turma (#197), mas os pontos dele no evento contam para uma só.
  -- Quem lê o evento (apuração, durante, resultado) lê esta cópia, então a regra vale para todos.
  INSERT INTO public.guilda_evento_snapshot (evento_id, classe_id, guilda_id, aluno_id, aluno_nome, posicao)
  SELECT p_evento_id, x.classe_id, x.guilda_id, x.aluno_id, x.nome,
         row_number() OVER (PARTITION BY x.guilda_id ORDER BY x.joined_at)::integer
    FROM (
      SELECT DISTINCT ON (m.aluno_id) g.classe_id, g.id AS guilda_id, m.aluno_id, a.nome, m.joined_at
        FROM public.guildas g
        JOIN public.guilda_membros m ON m.guilda_id = g.id AND m.left_at IS NULL
        JOIN public.alunos a ON a.id = m.aluno_id
       WHERE g.classe_id = p_classe_id AND g.ativa
       ORDER BY m.aluno_id, m.joined_at, g.id
    ) x
  ON CONFLICT (evento_id, guilda_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guilda_congelar_composicao(text, bigint) FROM PUBLIC, anon, authenticated;
"""

# Volta ao texto de produção de 31/10.
FORMACAO_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.guilda_criar(p_classe_id bigint, p_nome text, p_descricao text DEFAULT NULL::text, p_emblema text DEFAULT 'constellation'::text, p_logo_url text DEFAULT NULL::text, p_modo_perfil text DEFAULT 'misto'::text, p_perfil_alvo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_me uuid:=auth.uid(); v_class bigint; v_id uuid; v_limit integer; v_modo text:=lower(btrim(COALESCE(p_modo_perfil,'misto'))); v_perfil text:=NULLIF(btrim(p_perfil_alvo),'');
BEGIN
  v_class:=public.guilda_classe_atual(p_classe_id);
  IF v_class IS NULL OR NOT public.guilda_e_colega(v_me,v_class) THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  IF v_modo NOT IN ('misto','perfil') OR (v_modo='perfil' AND v_perfil IS NULL) THEN RAISE EXCEPTION 'guilda_configuracao_invalida'; END IF;
  IF NOT public.guilda_janela_aberta(v_class) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  SELECT LEAST(COALESCE((SELECT tamanho_maximo FROM public.guilda_config_turma WHERE classe_id=v_class),10),10) INTO v_limit;
  INSERT INTO public.guildas(classe_id,nome,descricao,emblema,logo_url,modo_perfil,perfil_alvo,limite_membros,criado_por)
  VALUES(v_class,btrim(p_nome),NULLIF(btrim(p_descricao),''),COALESCE(NULLIF(btrim(p_emblema),''),'constellation'),NULLIF(btrim(p_logo_url),''),v_modo,v_perfil,v_limit,v_me) RETURNING id INTO v_id;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_id,v_class,v_me);
  RETURN jsonb_build_object('guilda_id',v_id,'status','created');
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) TO authenticated, service_role;

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

"""

CONGELAR_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.fn_guilda_congelar_composicao(p_evento_id text, p_classe_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- SEM checagem de professor de proposito: a abertura pela varredura nao tem sessao. Quem chama
  -- pelo cliente passa por `guilda_congelar_composicao`, que confere a posse e delega para ca.
  INSERT INTO public.guilda_evento_snapshot (evento_id, classe_id, guilda_id, aluno_id, aluno_nome, posicao)
  SELECT p_evento_id, g.classe_id, g.id, m.aluno_id, a.nome,
         row_number() OVER (PARTITION BY g.id ORDER BY m.joined_at)::integer
    FROM public.guildas g
    JOIN public.guilda_membros m ON m.guilda_id = g.id AND m.left_at IS NULL
    JOIN public.alunos a ON a.id = m.aluno_id
   WHERE g.classe_id = p_classe_id AND g.ativa
  ON CONFLICT (evento_id, guilda_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guilda_congelar_composicao(text, bigint) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(HELPER)
    op.execute(FORMACAO)
    op.execute(CONGELAR)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(FORMACAO_ANTERIOR)
    op.execute(CONGELAR_ANTERIOR)
    op.execute("DROP FUNCTION IF EXISTS public.fn_guilda_composicao_congelada(bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
