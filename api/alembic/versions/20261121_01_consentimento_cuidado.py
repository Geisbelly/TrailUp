"""Consentimento do modo de cuidado, com versao propria

O modo de cuidado usa sinais de uso e o que o aluno diz ao Guia para acolher quem esta em
crise ou sobrecarregado. E dado sensivel, entao so existe com o aceite do PROPRIO aluno e,
se menor, tambem o do responsavel. O desenho copia o ramo `pesquisa` de
`aluno_finalidade_permitida` (`20261024_02`) sem reescrever essa funcao.

## O que esta migracao cria

1. `consentimento_cuidado` -- o aceite do proprio aluno, mesmo padrao de
   `consentimento_pesquisa`: so cresce, carimbo `registrado_em` forcado por
   `trg_consentimento_carimbo`, revogar e INSERT de linha `rejected`. RLS ligada e a policy
   `consentimento_cuidado_aluno_sel` (`aluno_id = auth.uid()`) nascem aqui, no mesmo arquivo.
   O cliente so tem SELECT. Como os outros consentimentos depois da `20261024_03`, a prova
   sobrevive a conta: `ON DELETE SET NULL`, e `trg_consentimento_anonimiza` guarda so o hash
   do id (`titular_hash`), carimba `anonimizado_em` e limpa `origem`. A linha em
   `retencao_politica` apaga a prova anonimizada depois de 5 anos.
2. `consentimento_responsavel.cuidado_versao` -- a versao do termo de cuidado que o
   responsavel viu. A finalidade `cuidado` mora em `finalidades ->> 'cuidado'`, mas a
   normalizacao de `responsavel_registrar_no_aparelho` conhece so as cinco finalidades de
   antes: um novo registro por la apaga o `cuidado` (a ultima linha vale) e o responsavel
   precisa decidir de novo. E o lado seguro.
3. `consentimento_cuidado_versao_vigente()` -- a versao vigente do termo de cuidado.
4. `aluno_cuidado_permitido(uuid)` -- a regra, na mesma ordem do ramo `pesquisa`: modo
   restrito barra; sem aceite vigente do aluno barra; adulto passa; menor precisa do
   `cuidado` do responsavel na versao vigente.
5. `aluno_meu_cuidado_permitido()` -- a mesma regra, so para `auth.uid()`.
6. `aluno_registrar_consentimento_cuidado(...)` -- o aluno aceita ou revoga. Revogar apaga os
   momentos de cuidado do aluno, se a tabela ja existir (ela nasce na migracao seguinte).
7. `responsavel_registrar_cuidado(...)` -- o responsavel aceita ou revoga so o cuidado, no
   aparelho do aluno. Copia a ultima linha aceita e vigente do responsavel e muda so o
   `cuidado`: as outras finalidades e o modo restrito nao mexem. Nao reescreve
   `responsavel_registrar_no_aparelho`.

## Quem pode o que

| funcao | cliente (`authenticated`) | por que |
|---|---|---|
| `consentimento_cuidado_versao_vigente` | sim | constante, o app compara com a do termo |
| `aluno_meu_cuidado_permitido` | sim | so o proprio, `auth.uid()` |
| `aluno_registrar_consentimento_cuidado` | sim | so o proprio |
| `responsavel_registrar_cuidado` | sim | so para o proprio aluno logado |
| `aluno_cuidado_permitido` | **nao** | recebe qualquer uuid; so API (`postgres`) e `service_role` |

Nada aqui foi aplicado em producao.

Revision ID: 20261121_01
Revises: 20261120_05
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261121_01"
down_revision = "20261120_05"
branch_labels = None
depends_on = None

# O mobile tera a mesma string; o teste de estrutura confere o valor.
VERSAO_CUIDADO = "2026-11-20-cuid-v1"

_RELACOES = "'mae', 'pai', 'responsavel_legal', 'outro'"

TABELA_SQL = [
    """
    CREATE TABLE IF NOT EXISTS public.consentimento_cuidado (
      id             bigserial   PRIMARY KEY,
      aluno_id       uuid
                     REFERENCES public.alunos (id) ON DELETE SET NULL,
      versao         text        NOT NULL,
      status         text        NOT NULL
                     CHECK (status IN ('accepted', 'rejected')),
      decidido_em    timestamptz NOT NULL,
      registrado_em  timestamptz NOT NULL DEFAULT now(),
      origem         jsonb       NOT NULL DEFAULT '{}'::jsonb,
      titular_hash   text,
      anonimizado_em timestamptz,
      CONSTRAINT consentimento_cuidado_unico
        UNIQUE (aluno_id, versao, decidido_em)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS consentimento_cuidado_aluno_idx
      ON public.consentimento_cuidado (aluno_id, decidido_em DESC, id DESC)
    """,
    "ALTER TABLE public.consentimento_responsavel ADD COLUMN IF NOT EXISTS cuidado_versao text",
    "DROP TRIGGER IF EXISTS trg_consentimento_carimbo ON public.consentimento_cuidado",
    """
    CREATE TRIGGER trg_consentimento_carimbo
      BEFORE INSERT ON public.consentimento_cuidado
      FOR EACH ROW EXECUTE FUNCTION public.trg_consentimento_carimbo_do_servidor()
    """,
    "DROP TRIGGER IF EXISTS trg_consentimento_cuidado_anonimiza ON public.consentimento_cuidado",
    """
    CREATE TRIGGER trg_consentimento_cuidado_anonimiza
      BEFORE UPDATE OF aluno_id ON public.consentimento_cuidado
      FOR EACH ROW
      WHEN (OLD.aluno_id IS NOT NULL AND NEW.aluno_id IS NULL)
      EXECUTE FUNCTION public.trg_consentimento_anonimiza()
    """,
    """
    INSERT INTO public.retencao_politica
      (tabela, acao, coluna_tempo, dias, dias_pesquisa, filtro, ajuste, ordem, categoria, motivo)
    VALUES
      ('consentimento_cuidado', 'apagar', 'anonimizado_em', 1826, NULL, 't.aluno_id IS NULL', NULL, 120,
       'prova_consentimento', 'prova minima depois da conta apagada')
    ON CONFLICT (tabela, acao) DO NOTHING
    """,
    "ALTER TABLE public.consentimento_cuidado ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON public.consentimento_cuidado FROM PUBLIC, anon, authenticated",
    "GRANT SELECT ON public.consentimento_cuidado TO authenticated",
    "GRANT ALL ON public.consentimento_cuidado TO service_role",
    "DROP POLICY IF EXISTS consentimento_cuidado_aluno_sel ON public.consentimento_cuidado",
    """
    CREATE POLICY consentimento_cuidado_aluno_sel
      ON public.consentimento_cuidado
      FOR SELECT TO authenticated
      USING (aluno_id = auth.uid())
    """,
    "REVOKE ALL ON SEQUENCE public.consentimento_cuidado_id_seq FROM PUBLIC, anon, authenticated",
    "GRANT USAGE, SELECT ON SEQUENCE public.consentimento_cuidado_id_seq TO service_role",
]

FUNCOES_SQL = f"""
CREATE OR REPLACE FUNCTION public.consentimento_cuidado_versao_vigente()
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT '{VERSAO_CUIDADO}'::text $function$;

CREATE OR REPLACE FUNCTION public.aluno_cuidado_permitido(p_aluno uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_menor  boolean;
  v_ultimo public.consentimento_responsavel;
  v_aluno  public.consentimento_cuidado;
BEGIN
  IF public.aluno_modo_restrito(p_aluno) THEN
    RETURN false;
  END IF;
  v_menor := public.aluno_eh_menor(p_aluno);

  -- O aceite do PROPRIO aluno, na versao vigente...
  SELECT cc.* INTO v_aluno
    FROM public.consentimento_cuidado cc
   WHERE cc.aluno_id = p_aluno
   ORDER BY cc.decidido_em DESC, cc.id DESC
   LIMIT 1;
  IF NOT coalesce(
       v_aluno.status = 'accepted'
         AND v_aluno.versao = public.consentimento_cuidado_versao_vigente(),
       false) THEN
    RETURN false;
  END IF;
  IF NOT v_menor THEN
    RETURN true;
  END IF;
  -- ...e, se menor, tambem o do responsavel, na versao vigente do cuidado.
  v_ultimo := public.consentimento_responsavel_ultimo(p_aluno);
  RETURN coalesce(
    (v_ultimo.finalidades ->> 'cuidado') = 'true'
      AND v_ultimo.cuidado_versao = public.consentimento_cuidado_versao_vigente(),
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aluno_meu_cuidado_permitido()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.aluno_cuidado_permitido(auth.uid())
$function$;

CREATE OR REPLACE FUNCTION public.aluno_registrar_consentimento_cuidado(
  p_aceito boolean,
  p_versao text,
  p_decidido_em timestamptz,
  p_origem jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_decidido timestamptz := coalesce(p_decidido_em, now());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno nao encontrado', ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM public.consentimento_cuidado_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao do termo de cuidado desatualizada', ERRCODE = '22023';
  END IF;
  IF v_decidido > now() + INTERVAL '10 minutes' THEN
    RAISE EXCEPTION USING MESSAGE = 'decisao no futuro', ERRCODE = '22008';
  END IF;

  INSERT INTO public.consentimento_cuidado (aluno_id, versao, status, decidido_em, origem)
  VALUES (
    v_uid, p_versao,
    CASE WHEN coalesce(p_aceito, false) THEN 'accepted' ELSE 'rejected' END,
    v_decidido, coalesce(p_origem, '{{}}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT consentimento_cuidado_unico DO NOTHING;

  -- Revogar apaga o que o cuidado guardou. A tabela nasce na migracao seguinte.
  IF NOT coalesce(p_aceito, false)
     AND to_regclass('public.aluno_momento_cuidado') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.aluno_momento_cuidado WHERE aluno_id = $1' USING v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'permitido', public.aluno_cuidado_permitido(v_uid),
    'versao_vigente', public.consentimento_cuidado_versao_vigente()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_registrar_cuidado(
  p_aceito boolean,
  p_nome text,
  p_relacao text,
  p_declaracao boolean,
  p_decidido_em timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_ultimo   public.consentimento_responsavel;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_relacao  text := p_relacao;
  v_decl     boolean := coalesce(p_declaracao, false);
  v_decidido timestamptz := coalesce(p_decidido_em, now());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno nao encontrado', ERRCODE = '42501';
  END IF;
  IF v_decidido > now() + INTERVAL '10 minutes' THEN
    RAISE EXCEPTION USING MESSAGE = 'decisao no futuro', ERRCODE = '22008';
  END IF;

  -- O cuidado do responsavel se apoia no aceite geral dele, vigente. Sem ele, nao ha o que copiar.
  v_ultimo := public.consentimento_responsavel_ultimo(v_uid);
  IF NOT coalesce(
       v_ultimo.status = 'accepted'
         AND v_ultimo.versao = public.consentimento_responsavel_versao_vigente(),
       false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_aceite_do_responsavel');
  END IF;

  IF coalesce(p_aceito, false) THEN
    IF v_nome IS NULL OR char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
      RAISE EXCEPTION USING MESSAGE = 'nome do responsavel obrigatorio', ERRCODE = '22023';
    END IF;
    IF v_relacao IS NULL OR v_relacao NOT IN ({_RELACOES}) THEN
      RAISE EXCEPTION USING MESSAGE = 'relacao com o aluno invalida', ERRCODE = '22023';
    END IF;
    IF NOT v_decl THEN
      RAISE EXCEPTION USING
        MESSAGE = 'o responsavel precisa declarar que e o responsavel legal',
        ERRCODE = '22023';
    END IF;
  ELSE
    -- Revogar so o cuidado e sempre possivel; quem revoga nao precisa repetir os dados.
    v_nome := coalesce(v_nome, v_ultimo.nome_responsavel);
    v_relacao := coalesce(v_relacao, v_ultimo.relacao);
  END IF;

  INSERT INTO public.consentimento_responsavel (
    aluno_id, versao, status, metodo, finalidades, pesquisa_versao, cuidado_versao,
    nome_responsavel, relacao, declaracao, decidido_em, registrado_por, origem
  ) VALUES (
    v_uid, v_ultimo.versao, 'accepted', 'aparelho',
    v_ultimo.finalidades || jsonb_build_object('cuidado', coalesce(p_aceito, false)),
    v_ultimo.pesquisa_versao,
    public.consentimento_cuidado_versao_vigente(),
    v_nome, v_relacao, v_decl, v_decidido, v_uid,
    jsonb_build_object('canal', 'aparelho', 'finalidade', 'cuidado')
  )
  ON CONFLICT ON CONSTRAINT consentimento_responsavel_unico DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'permitido', public.aluno_cuidado_permitido(v_uid),
    'versao_vigente', public.consentimento_cuidado_versao_vigente()
  );
END;
$function$;
"""

FUNCOES_DO_CLIENTE = (
    "public.aluno_meu_cuidado_permitido()",
    "public.aluno_registrar_consentimento_cuidado(boolean, text, timestamptz, jsonb)",
    "public.responsavel_registrar_cuidado(boolean, text, text, boolean, timestamptz)",
)

FUNCAO_INTERNA = "public.aluno_cuidado_permitido(uuid)"


def _acl() -> list[str]:
    comandos = [
        "GRANT EXECUTE ON FUNCTION public.consentimento_cuidado_versao_vigente() TO authenticated, service_role",
        f"REVOKE ALL ON FUNCTION {FUNCAO_INTERNA} FROM PUBLIC, anon, authenticated",
        f"GRANT EXECUTE ON FUNCTION {FUNCAO_INTERNA} TO service_role",
    ]
    for assinatura in FUNCOES_DO_CLIENTE:
        comandos += [
            f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon",
            f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role",
        ]
    return comandos


def upgrade() -> None:
    for sql in TABELA_SQL:
        op.execute(sql)
    op.execute(FUNCOES_SQL)
    for sql in _acl():
        op.execute(sql)


def downgrade() -> None:
    for assinatura in FUNCOES_DO_CLIENTE:
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
    op.execute(f"DROP FUNCTION IF EXISTS {FUNCAO_INTERNA}")
    op.execute("DROP FUNCTION IF EXISTS public.consentimento_cuidado_versao_vigente()")
    op.execute("DROP TRIGGER IF EXISTS trg_consentimento_carimbo ON public.consentimento_cuidado")
    # AS TABELAS E A COLUNA FICAM: sao prova de consentimento, e apagar no downgrade
    # destruiria a evidencia (mesmo criterio de `20261024_02`).
