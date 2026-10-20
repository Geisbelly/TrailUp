"""Fase 6 do plano: a janela de formação de guilda chega ao console

As RPCs de escrita já existem e têm EXECUTE para `authenticated`: `guilda_configurar_turma`
(tamanho máximo e janela, só o professor da turma) e `guilda_atualizar` (nome e descrição, o
criador ou o professor). Nasceram em `20260912_07`, que executa o SQL de
`docs/mobile/sql/20260912_03_guildas_perfil_publico.sql`, um arquivo que o portão
`test_rpc_chamada_tem_migracao` não lê. Como o console passa a chamá-las, elas entram aqui no
Alembic. `guilda_atualizar` vai com o corpo **de produção, sem mudança** (md5 de `prosrc` conferido
em 2026-10-20). `guilda_configurar_turma` vai com uma mudança decidida (abaixo), e o downgrade a
devolve ao corpo de produção. Nenhuma das duas é removida no downgrade: existiam antes. `guilda_janela_aberta`, que a leitura usa, fica onde
está (`20260912_07`); o console não a chama direto.

O que faltava era o professor LER o estado:

- `guilda_config_turma` tem RLS ligada, zero policy e nenhum GRANT para o cliente (medido na
  produção em 2026-10-20). Isso é o desenho do domínio `guilda_*`: acesso só por RPC DEFINER
  (ver o spec de eventos/missões/ranks). Então a leitura é uma RPC também, não uma policy.
- `guilda_listar` só responde para colega de turma (`guilda_e_colega`), então o professor recebe
  lista vazia em silêncio, a mesma armadilha do PR #541.

`guilda_formacao_da_turma(p_classe_id)` devolve, numa chamada, a configuração (ou o default de
quem nunca configurou), se a janela está aberta AGORA pela mesma regra de `guilda_janela_aberta`,
o relógio do banco, e as guildas ativas com os membros atuais. Só o professor da turma (42501).

Medido antes de implementar, como o plano pedia: sem linha em `guilda_config_turma`,
`guilda_janela_aberta` devolve true. Turma que nunca configurou tem a formação SEMPRE aberta, e o
tamanho efetivo é 10 (`guilda_criar`: `LEAST(COALESCE(tamanho_maximo, 10), 10)`). A janela barra
criar, entrar, convidar e aceitar convite. Sair e dissolver não passam por ela.

`guilda_congelar_composicao` não precisa de chamador no console: `evento_classe_abrir` já a chama
ao abrir um evento com modalidade de guilda.

Decisões de 2026-10-20 aplicadas aqui:

- **Tamanho abaixo dos membros: bloqueia.** `guilda_configurar_turma` recusa um tamanho máximo menor
  que o número de membros da maior guilda ativa da turma, com `guilda_tamanho_abaixo_dos_membros`
  (22023), o texto em pt-BR no DETAIL e o mínimo permitido no HINT. Antes ela baixava
  `limite_membros` sem tirar ninguém e a guilda ficava acima do limite.
- **O aluno vê a janela no app.** `guilda_janela_da_turma(p_classe_id)` devolve só a janela e o
  tamanho para o colega da turma. Na produção nada expunha `guilda_config_turma` ao aluno: só o
  booleano de `guilda_janela_aberta`, sem as datas.
- Sair e dissolver continuam fora da janela, e "Fechar agora" não cancela convites pendentes
  (decidido: manter como está).

Depende de `20261021_16` (PR #568, que inclui o #567) só pela ordem da cadeia.

Revision ID: 20261021_17
Revises: 20261021_16
Create Date: 2026-10-20
"""

from __future__ import annotations

from alembic import op

revision = "20261021_17"
down_revision = "20261021_16"
branch_labels = None
depends_on = None


# Corpo de produção, sem mudança (`pg_get_functiondef`). GRANT como está na produção: EXECUTE só
# para `authenticated`.
VERSIONADAS = r"""
CREATE OR REPLACE FUNCTION public.guilda_atualizar(p_guilda_id uuid, p_nome text, p_descricao text DEFAULT NULL::text, p_emblema text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.guildas SET nome=btrim(p_nome), descricao=NULLIF(btrim(p_descricao),''), emblema=COALESCE(NULLIF(btrim(p_emblema),''),emblema), updated_at=now()
    WHERE id=p_guilda_id AND ativa AND (criado_por=auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_sem_permissao'; END IF;
  RETURN jsonb_build_object('status','updated','guilda_id',p_guilda_id);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_atualizar(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_atualizar(uuid, text, text, text) TO authenticated;
"""


# `guilda_configurar_turma` como está na produção (md5 de `prosrc` conferido em 2026-10-20). Só o
# downgrade a usa, para devolver a função ao estado de antes.
CONFIGURAR_PRODUCAO = r"""
CREATE OR REPLACE FUNCTION public.guilda_configurar_turma(p_classe_id bigint, p_tamanho_maximo integer, p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_classe_id NOT IN (SELECT public.app_classes_do_professor()) OR p_tamanho_maximo NOT BETWEEN 2 AND 10 OR (p_fim IS NOT NULL AND p_inicio IS NOT NULL AND p_fim <= p_inicio) THEN RAISE EXCEPTION 'guilda_config_invalida'; END IF;
  INSERT INTO public.guilda_config_turma(classe_id,tamanho_maximo,formacao_inicio,formacao_fim,updated_at) VALUES(p_classe_id,p_tamanho_maximo,p_inicio,p_fim,now())
  ON CONFLICT (classe_id) DO UPDATE SET tamanho_maximo=EXCLUDED.tamanho_maximo,formacao_inicio=EXCLUDED.formacao_inicio,formacao_fim=EXCLUDED.formacao_fim,updated_at=now();
  UPDATE public.guildas SET limite_membros=p_tamanho_maximo,updated_at=now() WHERE classe_id=p_classe_id AND ativa;
  RETURN jsonb_build_object('status','updated','classe_id',p_classe_id);
END $function$;
"""


# A mesma função, com a decisão 2: recusa tamanho menor que a maior guilda ativa da turma. Ninguém é
# tirado de guilda; o professor vê o mínimo permitido (`HINT`) e escolhe.
CONFIGURAR = r"""
CREATE OR REPLACE FUNCTION public.guilda_configurar_turma(p_classe_id bigint, p_tamanho_maximo integer, p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_maior integer;
BEGIN
  IF p_classe_id NOT IN (SELECT public.app_classes_do_professor()) OR p_tamanho_maximo NOT BETWEEN 2 AND 10 OR (p_fim IS NOT NULL AND p_inicio IS NOT NULL AND p_fim <= p_inicio) THEN RAISE EXCEPTION 'guilda_config_invalida'; END IF;
  -- Decisão de 2026-10-20: o tamanho não fica abaixo da maior guilda ativa da turma.
  -- Trava as guildas ativas antes de contar: `guilda_entrar` e `guilda_aceitar_convite` pegam a
  -- mesma linha FOR UPDATE antes de contar os membros, então ninguém entra entre a conta e o UPDATE.
  PERFORM 1 FROM public.guildas WHERE classe_id = p_classe_id AND ativa ORDER BY id FOR UPDATE;
  SELECT COALESCE(max(x.n), 0) INTO v_maior
    FROM (SELECT count(*) AS n
            FROM public.guilda_membros m
            JOIN public.guildas g ON g.id = m.guilda_id
           WHERE g.classe_id = p_classe_id AND g.ativa AND m.left_at IS NULL
           GROUP BY m.guilda_id) x;
  IF p_tamanho_maximo < v_maior THEN
    RAISE EXCEPTION 'guilda_tamanho_abaixo_dos_membros'
      USING ERRCODE = '22023',
            DETAIL = format('A maior guilda da turma tem %s membros. O tamanho máximo não pode ficar abaixo de %s.', v_maior, v_maior),
            HINT = v_maior::text;
  END IF;
  INSERT INTO public.guilda_config_turma(classe_id,tamanho_maximo,formacao_inicio,formacao_fim,updated_at) VALUES(p_classe_id,p_tamanho_maximo,p_inicio,p_fim,now())
  ON CONFLICT (classe_id) DO UPDATE SET tamanho_maximo=EXCLUDED.tamanho_maximo,formacao_inicio=EXCLUDED.formacao_inicio,formacao_fim=EXCLUDED.formacao_fim,updated_at=now();
  UPDATE public.guildas SET limite_membros=p_tamanho_maximo,updated_at=now() WHERE classe_id=p_classe_id AND ativa;
  RETURN jsonb_build_object('status','updated','classe_id',p_classe_id);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_configurar_turma(bigint, integer, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_configurar_turma(bigint, integer, timestamp with time zone, timestamp with time zone) TO authenticated;
"""


# Leitura do aluno (decisão 4: o aluno vê a janela no app). Só a janela e o tamanho, nada de membros:
# as guildas o app já lê por `guilda_listar`. Colega da turma (`guilda_e_colega`), senão 42501.
JANELA_DO_ALUNO = r"""
CREATE OR REPLACE FUNCTION public.guilda_janela_da_turma(p_classe_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cfg public.guilda_config_turma%ROWTYPE;
  v_configurada boolean;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT public.guilda_e_colega(auth.uid(), p_classe_id) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.guilda_config_turma c WHERE c.classe_id = p_classe_id;
  v_configurada := FOUND;

  RETURN jsonb_build_object(
    'classe_id', p_classe_id,
    'configurada', v_configurada,
    'tamanho_maximo', COALESCE(v_cfg.tamanho_maximo, 10),
    'formacao_inicio', v_cfg.formacao_inicio,
    'formacao_fim', v_cfg.formacao_fim,
    'janela_aberta', public.guilda_janela_aberta(p_classe_id),
    'agora', now()
  );
END
$function$;

REVOKE ALL ON FUNCTION public.guilda_janela_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_janela_da_turma(bigint) TO authenticated;
"""


LEITURA = r"""
CREATE OR REPLACE FUNCTION public.guilda_formacao_da_turma(p_classe_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cfg public.guilda_config_turma%ROWTYPE;
  v_configurada boolean;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.guilda_config_turma c WHERE c.classe_id = p_classe_id;
  v_configurada := FOUND;

  RETURN jsonb_build_object(
    'classe_id', p_classe_id,
    'configurada', v_configurada,
    -- O default de quem nunca configurou é o que `guilda_criar` usa: 10.
    'tamanho_maximo', COALESCE(v_cfg.tamanho_maximo, 10),
    'formacao_inicio', v_cfg.formacao_inicio,
    'formacao_fim', v_cfg.formacao_fim,
    -- A mesma função que barra criar/entrar/convidar/aceitar: a tela não reimplementa a regra.
    'janela_aberta', public.guilda_janela_aberta(p_classe_id),
    'agora', now(),
    'alunos_na_turma', (SELECT count(*)::integer FROM public.classe_aluno ca WHERE ca.classe_id = p_classe_id),
    'alunos_sem_guilda', (
      SELECT count(*)::integer
        FROM public.classe_aluno ca
       WHERE ca.classe_id = p_classe_id
         AND NOT EXISTS (
           SELECT 1
             FROM public.guilda_membros m
             JOIN public.guildas g ON g.id = m.guilda_id AND g.ativa
            WHERE m.aluno_id = ca.aluno_id AND m.left_at IS NULL AND g.classe_id = p_classe_id
         )
    ),
    'guildas', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', g.id,
                 'nome', g.nome,
                 'descricao', g.descricao,
                 'emblema', g.emblema,
                 'limite_membros', g.limite_membros,
                 'modo_perfil', g.modo_perfil,
                 'perfil_alvo', g.perfil_alvo,
                 'criada_em', g.created_at,
                 'membros', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('aluno_id', m.aluno_id, 'nome', a.nome, 'entrou_em', m.joined_at)
                            ORDER BY m.joined_at
                          )
                     FROM public.guilda_membros m
                     LEFT JOIN public.alunos a ON a.id = m.aluno_id
                    WHERE m.guilda_id = g.id AND m.left_at IS NULL AND m.aluno_id IS NOT NULL
                 ), '[]'::jsonb)
               )
               ORDER BY g.created_at, g.id
             )
        FROM public.guildas g
       WHERE g.classe_id = p_classe_id AND g.ativa
    ), '[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.guilda_formacao_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_formacao_da_turma(bigint) TO authenticated;
"""


def upgrade() -> None:
    op.execute(VERSIONADAS)
    op.execute(CONFIGURAR)
    op.execute(LEITURA)
    op.execute(JANELA_DO_ALUNO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # As leituras saem; `guilda_configurar_turma` volta ao corpo de produção (sem a checagem de
    # tamanho). `guilda_atualizar` não muda: já existia igual antes desta revisão.
    op.execute("DROP FUNCTION IF EXISTS public.guilda_janela_da_turma(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.guilda_formacao_da_turma(bigint)")
    op.execute(CONFIGURAR_PRODUCAO)
    op.execute("NOTIFY pgrst, 'reload schema'")
