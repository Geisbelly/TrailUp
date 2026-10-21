"""As duas últimas RPCs fora da cadeia: perfil e cadastro do aluno

Fecha a dívida de schema não versionado que sobrou depois da medição da `20261021_23`. De 22
entradas que o portão `test_rpc_chamada_tem_migracao` registrava, 19 eram ponto cego do parser
(ver o docstring dele) e 3 eram dívida real. Estas são duas delas:

- `fn_atualizar_aluno_perfil(...)` — o aluno edita o próprio perfil;
- `fn_cadastrar_aluno_com_perfis(...)` — o cadastro cria `alunos`, `aluno_perfil`,
  `iaDescricao` e as linhas de `professor_aluno`.

A terceira, `fn_auth_email_exists`, **continua de fora de propósito**: é a issue #329 (permite
enumerar e-mail cadastrado sem autenticar), e versionar o texto atual seria registrar o defeito
em vez de corrigi-lo. Ela sai de `FORA_DO_ALEMBIC` quando a correção for escrita.

## As duas são diferentes uma da outra — e isso decide o GRANT

| | `fn_atualizar_aluno_perfil` | `fn_cadastrar_aluno_com_perfis` |
| --- | --- | --- |
| segurança | `SECURITY DEFINER` | **`SECURITY INVOKER`** |
| `search_path` | `'public', 'auth'` | `'public', 'pg_temp'` |
| quem executa hoje | `authenticated`, `service_role` | `PUBLIC` (logo, `anon` também) |

`SECURITY DEFINER` com EXECUTE para o anônimo é bypass de RLS, então a primeira leva
`REVOKE ALL ... FROM PUBLIC, anon` — a regra da `_23`. A segunda **não**: sendo
`SECURITY INVOKER`, a RLS do chamador continua valendo, e `anon` precisa dela porque o cadastro
roda no caminho de signup. Então ela recebe `GRANT` explícito para `anon`, `authenticated` e
`service_role` — para funcionar num Postgres comum, onde o `ALTER DEFAULT PRIVILEGES` da
produção não existe — e **o PUBLIC fica como está**. Estreitar PUBLIC aqui seria decisão de
outra pessoa: só quem sabe que papéis chamam o signup pode dizer se algum fica de fora.

> `fn_atualizar_aluno_perfil` tem `search_path` = `'public', 'auth'`, **sem `pg_temp`**, que não
> é o padrão da casa. Vai verbatim: trocar mexe na resolução de nome de uma função que grava em
> `alunos`, e não é o assunto desta migration. Fica anotado.

## Quebra de linha: a única diferença deliberada em relação à produção

As duas foram escritas no painel do Supabase, no Windows, e o `prosrc` guardado tem **CRLF** —
52 e 76 `\\r` respectivamente. Os corpos aqui estão normalizados para **LF**, porque o repo é
UTF-8 sem BOM com LF e gravar CRLF escapado num `.py` tornaria o texto ilegível justamente onde
a revisão precisa ler.

Isso é visível no md5, e o teste cobra a forma certa: o md5 do corpo daqui bate com
`md5(replace(prosrc, E'\\r\\n', E'\\n'))` da produção, não com `md5(prosrc)`. Ou seja, a
diferença é exatamente a quebra de linha — nenhum `\\r` desta base aparece dentro de literal de
texto, só como terminador, e o plpgsql não distingue.

Medido na produção, em transação abortada: aplicar estes corpos deixa
`md5(replace(prosrc, E'\\r\\n', E'\\n'))` igual ao de antes nas duas.

## Depende de schema que a cadeia não cria (medido na revisão de 21/10)

`fn_atualizar_aluno_perfil` declara `p_modo_resposta modo_resposta_type` e `RETURNS alunos`; as
duas são resolvidas **em tempo de CREATE**. Nenhuma migração cria o enum `modo_resposta_type`
nem a tabela `alunos` — a cadeia cria 83 tabelas, e o schema base não está entre elas. Então
`alembic upgrade head` sobre um banco vazio aborta aqui com `undefined_object`.

Não é defeito introduzido por esta migration: a `_22` tem a mesma dependência (corpo de função
`LANGUAGE sql` é validado na criação e lê `public.alunos`), e dezenas de migrações anteriores
pressupõem o mesmo. Fica escrito porque é a prova concreta de que "banco construído do zero"
não é o argumento certo para este trabalho — ver `docs/architecture/schema-nao-versionado.md`,
que já aponta o baseline de `pg_dump --schema-only` como caminho.

## Armadilha do SQL offline, de novo

`fn_atualizar_aluno_perfil` tem `RAISE EXCEPTION 'Modo de resposta "%" inválido...'` e
`'Aluno % não encontrado...'`. `alembic upgrade --sql` dobra `%`, e `%%` numa mensagem de
`RAISE` sai literal no texto do erro. Aplicar é por `alembic upgrade head`.

## Downgrade não remove nada

As duas existiam antes desta revisão — vêm do painel. Remover derrubaria a edição de perfil e o
cadastro na produção para desfazer um commit que não muda comportamento.

Revision ID: 20261021_24
Revises: 20261021_23
Create Date: 2026-10-20
"""

from alembic import op

revision = "20261021_24"
down_revision = "20261021_23"
branch_labels = None
depends_on = None


# Texto de produção (`pg_get_functiondef`, 2026-10-20), com CRLF -> LF. Ver o docstring: o teste
# confere o md5 contra a versão normalizada do `prosrc` real.
VERSIONADAS = """
CREATE OR REPLACE FUNCTION public.fn_atualizar_aluno_perfil(p_nome_completo text DEFAULT NULL::text, p_apelido text DEFAULT NULL::text, p_modooperacao_nome text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_foto_url text DEFAULT NULL::text, p_banner_url text DEFAULT NULL::text, p_modo_resposta modo_resposta_type DEFAULT NULL::modo_resposta_type)
 RETURNS alunos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_modo_id    bigint;
  v_aluno      public.alunos;
  v_user_id    uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- valida modo_resposta, se enviado
  IF p_modo_resposta IS NOT NULL THEN
    IF p_modo_resposta NOT IN ('imediato', 'pensante') THEN
      RAISE EXCEPTION
        'Modo de resposta "%" inválido. Use "imediato" ou "pensante".',
        p_modo_resposta;
    END IF;
  END IF;

  -- busca modo de operação pelo nome (se enviado)
  IF p_modooperacao_nome IS NOT NULL THEN
    SELECT id
    INTO v_modo_id
    FROM public."modoOperacao"
    WHERE nome = p_modooperacao_nome
    LIMIT 1;

    IF v_modo_id IS NULL THEN
      RAISE EXCEPTION 'Modo de operação "%" não encontrado', p_modooperacao_nome;
    END IF;
  END IF;

  UPDATE public.alunos
  SET
    nome            = COALESCE(p_nome_completo, nome),
    apelido         = COALESCE(p_apelido, apelido),
    modooperacao_id = COALESCE(v_modo_id, modooperacao_id),
    descricao       = COALESCE(p_descricao, descricao),
    foto_url        = COALESCE(p_foto_url, foto_url),
    banner_url      = COALESCE(p_banner_url, banner_url),
    modo_resposta   = COALESCE(p_modo_resposta, modo_resposta) -- AQUI
  WHERE id = v_user_id
  RETURNING * INTO v_aluno;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno % não encontrado ou não permitido pela política RLS', v_user_id;
  END IF;

  RETURN v_aluno;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_atualizar_aluno_perfil(text, text, text, text, text, text, modo_resposta_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_aluno_perfil(text, text, text, text, text, text, modo_resposta_type) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_cadastrar_aluno_com_perfis(p_auth_user_id uuid, p_nome_completo text, p_email text, p_apelido text, p_modooperacao_nome text, p_perfis jsonb)
 RETURNS alunos
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE
  v_modo_id   bigint;
  v_aluno     public.alunos;
  v_item      jsonb;
  v_perfil_id bigint;
  v_afinidade numeric;
BEGIN
  -- 0) Se o aluno já existir, retorna
  SELECT *
  INTO v_aluno
  FROM public.alunos
  WHERE id = p_auth_user_id;

  IF FOUND THEN
    RETURN v_aluno;
  END IF;

  -- 1) Buscar modo de operação
  SELECT mo.id
  INTO v_modo_id
  FROM public."modoOperacao" mo
  WHERE mo.nome = p_modooperacao_nome
  LIMIT 1;

  IF v_modo_id IS NULL THEN
    RAISE EXCEPTION 'Modo de operação "%" não encontrado em modoOperacao.nome', p_modooperacao_nome;
  END IF;

  -- 2) Criar aluno
  INSERT INTO public.alunos (id, nome, email, apelido, descricao, modooperacao_id)
  VALUES (p_auth_user_id, p_nome_completo, p_email, p_apelido, 'Novo aluno', v_modo_id)
  RETURNING * INTO v_aluno;

  -- 3) Criar aluno_perfil
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(p_perfis)
  LOOP
    SELECT p.id
    INTO v_perfil_id
    FROM public.perfil p
    WHERE p.nome = v_item->>'nome'
    LIMIT 1;

    IF v_perfil_id IS NULL THEN
      RAISE EXCEPTION 'Perfil "%" não encontrado em perfil.nome', v_item->>'nome';
    END IF;

    v_afinidade := COALESCE((v_item->>'afinidade')::numeric, 0);

    INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade)
    VALUES (p_auth_user_id, v_perfil_id, v_afinidade);
  END LOOP;

  -- 4) iaDescricao
  INSERT INTO public."iaDescricao" (
    aluno_id,
    "recomendacaoTrilha",
    "modoOperacao",
    insights,
    "perfisDetectados"
  )
  VALUES (
    p_auth_user_id,
    'Recomendações ainda não geradas',
    p_modooperacao_nome,
    '{}'::json,
    p_perfis
  );

  -- 5) professor_aluno
  INSERT INTO public.professor_aluno (professor_id, aluno_id, has_acesso)
  SELECT p.id, p_auth_user_id, false
  FROM public.professor p
  ON CONFLICT (professor_id, aluno_id) DO NOTHING;

  RETURN v_aluno;
END;$function$;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_aluno_com_perfis(uuid, text, text, text, text, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(VERSIONADAS)


def downgrade() -> None:
    # As duas existiam antes desta migration (vieram do painel) — ver o docstring.
    pass
