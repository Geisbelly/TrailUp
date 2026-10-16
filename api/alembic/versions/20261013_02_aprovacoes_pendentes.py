"""aprovacoes_pendentes(): a fila de cadastros, com o e-mail, só para o dono

A tela Aprovações do protótipo V9 mostra o e-mail de quem pediu acesso e avisa quando
é de uma instituição diferente da do dono. O e-mail mora em `auth.users`, que o
cliente não lê; `professor` não tem a coluna. A saída é uma função SECURITY DEFINER
que junta as duas tabelas — e que por isso confere QUEM chama antes de devolver
qualquer linha.

**Quem é o dono.** O console decide isso com uma constante no cliente (`OWNER_EMAIL`),
o que serve para esconder a aba, mas não protege dado nenhum. Aqui o dono vem de
`app_config` (chave `dono_email`, `publico = false`, então nenhum cliente lê a chave) e a
conferência é feita no banco, contra o e-mail do JWT: `app_e_dono()`. O valor semeado
é o mesmo e-mail que o console e a `fn_enviar_contato` já usam.

`aprovacoes_pendentes()`:
- recusa com 42501 quem não é o dono, ANTES de ler `auth.users`;
- devolve só quem tem `liberado` diferente de true, do mais antigo para o mais novo
  (a ordem da tela: quem espera há mais tempo aparece primeiro);
- não devolve nada além do que a tela mostra (sem hash, sem metadata do usuário).

EXECUTE só para `authenticated`; `anon` e `PUBLIC` ficam de fora.

Revision ID: 20261013_02
Revises: 20261013_01
Create Date: 2026-10-13
"""

from alembic import op

revision = "20261013_02"
down_revision = "20261013_01"
branch_labels = None
depends_on = None


SQL = r"""
INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES (
  'dono_email',
  'geisbelly19@gmail.com',
  'E-mail do dono do sistema: unico que ve e decide a fila de aprovacoes de professor. '
  || 'Espelha OWNER_EMAIL do console; a conferencia de verdade e feita no banco.',
  false
)
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_e_dono()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) <> ''
     AND lower(coalesce(auth.jwt() ->> 'email', '')) =
         lower(coalesce((SELECT valor FROM public.app_config WHERE chave = 'dono_email'), ''));
$function$;

REVOKE ALL ON FUNCTION public.app_e_dono() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_e_dono() TO authenticated;

CREATE OR REPLACE FUNCTION public.aprovacoes_pendentes()
RETURNS TABLE (
  id uuid,
  nome text,
  instituicao text,
  disciplina text,
  descricao text,
  created_at timestamptz,
  email text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  -- A conferência vem ANTES de qualquer leitura de auth.users.
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Apenas o dono do sistema acessa a fila de aprovacoes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome::text, p.instituicao::text, p.disciplina::text, p.descricao::text, p.created_at,
         u.email::text
    FROM public.professor p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.liberado IS NOT TRUE
   ORDER BY p.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.aprovacoes_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovacoes_pendentes() TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.aprovacoes_pendentes()")
    op.execute("DROP FUNCTION IF EXISTS public.app_e_dono()")
    op.execute("DELETE FROM public.app_config WHERE chave = 'dono_email'")
    op.execute("NOTIFY pgrst, 'reload schema'")
