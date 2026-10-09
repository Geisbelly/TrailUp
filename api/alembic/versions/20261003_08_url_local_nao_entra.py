"""O banco recusa URL de loopback em material do aluno (#189)

A #189 relatava uma apresentacao gravada como
`http://localhost:3002/api/v1/decks/...` -- 1 das 24 do banco. Para o aluno e'
material que nunca carrega, e falha do pior jeito: nao e' 404, e' conexao
recusada, sem dizer por que.

Dos dois itens da issue, **o primeiro morreu**: conferi ao vivo e hoje nao ha
nenhum material com `localhost` (`conteudo_personalizado` esta vazia -- a base
de personalizacao foi limpa desde que a issue foi escrita). Nao ha linha para
regerar.

Sobra o item 2, que a propria issue propoe: o banco recusar no INSERT em vez de
alguem descobrir semanas depois na tela de um aluno. A URL vem de variavel de
ambiente no momento da geracao, entao isso volta a acontecer sempre que alguem
gerar com `BRAINHEXPDF_API_URL` apontando para a propria maquina.

## Por que NAO e' `materiais::text ILIKE '%localhost%'`

Porque o TrailUp ensina tecnologia. Uma aula sobre servidor web legitimamente
contem "abra http://localhost:3000 no navegador" dentro do markdown -- e um
CHECK sobre o texto inteiro do JSONB recusaria o material, transformando a
protecao num bug pior que o original.

Entao a funcao olha **so as chaves que guardam URL**: `arquivo_url`, `url`,
`audio_url`, `apresentacao_url` no nivel do material, e `arquivo_url`/`url`
dentro de `partes[]` (a forma de `MaterialPart` em
`microservice/src/services/supabaseService.ts`).

Tres decisoes do regex, cada uma com um caso de teste:

- exige **esquema** (`^[a-z][a-z0-9+.-]*://`), entao `storage_path` relativo
  como `conteudo_aluno/localhost/x.html` passa -- nao e' URL;
- ancora o host e exige fim ou `/` depois, entao
  `https://localhost.cdn.trailup.app/d.html` passa -- host legitimo que apenas
  COMECA com "localhost";
- cobre `localhost`, `127.0.0.0/8`, `0.0.0.0` e `[::1]`.

Conferido ao vivo, 9 casos, todos com o veredito esperado -- inclusive os dois
que decidem o desenho (aula que menciona localhost passa; `arquivo_url` em
localhost barra).

`fontes_personalizacao.arquivo_url` ganha o mesmo CHECK: e' coluna de URL de
verdade (upload/link do professor), e o mesmo descuido de ambiente a atinge.

As duas constraints entram VALID porque conferi que nao ha linha ofensora --
nao ha linha nenhuma. Em base com dado, entrariam `NOT VALID` primeiro.

Revision ID: 20261003_08
Revises: 20261003_07
Create Date: 2026-10-07
"""

from alembic import op

revision = "20261003_08"
down_revision = "20261003_07"
branch_labels = None
depends_on = None

_LOOPBACK = (
    r"^[a-z][a-z0-9+.-]*://"
    r"(localhost|127(\.[0-9]{1,3}){3}|0\.0\.0\.0|\[::1\])"
    r"(:[0-9]+)?(/|$)"
)


def upgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.fn_materiais_com_url_local(p_materiais jsonb)
        RETURNS boolean
        LANGUAGE sql
        IMMUTABLE
        SET search_path TO 'public', 'pg_temp'
        AS $function$
          SELECT coalesce(bool_or(
                   valor ~* '{_LOOPBACK}'
                 ), false)
            FROM (
              SELECT m.value -> k AS v
                FROM jsonb_each(coalesce(p_materiais, '{{}}'::jsonb)) m,
                     unnest(array['arquivo_url','url','audio_url','apresentacao_url']) k
               WHERE jsonb_typeof(m.value) = 'object'
              UNION ALL
              SELECT p.value -> k
                FROM jsonb_each(coalesce(p_materiais, '{{}}'::jsonb)) m,
                     jsonb_array_elements(
                       CASE WHEN jsonb_typeof(m.value -> 'partes') = 'array'
                            THEN m.value -> 'partes' ELSE '[]'::jsonb END) p,
                     unnest(array['arquivo_url','url']) k
               WHERE jsonb_typeof(m.value) = 'object'
            ) q,
            LATERAL (
              SELECT CASE WHEN jsonb_typeof(q.v) = 'string' THEN q.v #>> '{{}}' END AS valor
            ) x;
        $function$
        """
    )
    # Funcao de CHECK nao precisa estar na superficie REST do cliente.
    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.fn_materiais_com_url_local(jsonb)"
        " FROM PUBLIC, anon, authenticated"
    )

    op.execute(
        """
        ALTER TABLE public.conteudo_personalizado
          DROP CONSTRAINT IF EXISTS conteudo_personalizado_sem_url_local
        """
    )
    op.execute(
        """
        ALTER TABLE public.conteudo_personalizado
          ADD CONSTRAINT conteudo_personalizado_sem_url_local
          CHECK (NOT public.fn_materiais_com_url_local(materiais))
        """
    )

    op.execute(
        """
        ALTER TABLE public.fontes_personalizacao
          DROP CONSTRAINT IF EXISTS fontes_personalizacao_sem_url_local
        """
    )
    op.execute(
        f"""
        ALTER TABLE public.fontes_personalizacao
          ADD CONSTRAINT fontes_personalizacao_sem_url_local
          CHECK (arquivo_url IS NULL OR arquivo_url !~* '{_LOOPBACK}')
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public.fontes_personalizacao"
        " DROP CONSTRAINT IF EXISTS fontes_personalizacao_sem_url_local"
    )
    op.execute(
        "ALTER TABLE public.conteudo_personalizado"
        " DROP CONSTRAINT IF EXISTS conteudo_personalizado_sem_url_local"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_materiais_com_url_local(jsonb)")
