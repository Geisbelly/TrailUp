"""Consentimento do responsavel pelo aluno menor e finalidade de pesquisa (#195)

O que faltava da #195 na parte de consentimento:

- **Art. 14 da LGPD.** Dado de crianca e adolescente so com consentimento
  especifico e destacado de um dos pais ou do responsavel. O app nao sabia a
  idade de ninguem e o unico texto sobre isso era "18 anos ou consentimento
  parental" no termo da web.
- **Pesquisa.** `alunos.consentimento_pesquisa`, citada na issue, nunca existiu
  no banco (vinha do `database-schema.ts` que o #537 apagou). Nada impedia uma
  analise do TCC de usar dado de quem nao consentiu.

## O que esta migracao cria

1. `aluno_nascimento` -- a data de nascimento, **fora de `alunos`** de
   proposito: `alunos` e legivel pelos colegas de turma
   (`alunos_posse_sel` -> `app_pode_ver_aluno` -> `app_colegas_de_turma`), e
   a data de nascimento de um menor nao pode ir para o ranking. Aqui o aluno le
   so a propria linha e ninguem escreve direto: so a RPC
   `aluno_registrar_data_nascimento`, que grava uma vez (corrigir depois e com
   a escola, por `service_role`, para o menor nao "envelhecer" e sair do modo
   restrito sozinho).
2. `consentimento_responsavel` -- prova do consentimento do responsavel, no
   padrao do #339 (`20261003_10`): so cresce, carimbo `registrado_em` forcado
   por trigger, revogar e INSERT de linha `rejected`. `metodo` aceita
   `aparelho` (o responsavel aceita no aparelho do aluno, desenho A) e `papel`
   (o professor registra o termo assinado, desenho C); a constraint tem nome
   proprio para trocar por uma que aceite `email` depois. O cliente NAO tem
   INSERT: so as RPCs gravam, e elas carimbam versao, metodo e quem registrou.
3. `consentimento_pesquisa` -- o aceite do proprio aluno para a pesquisa, com
   versao propria (`consentimento_pesquisa_versao_vigente()`), mesmo padrao.
4. `aluno_modo_restrito(uuid)` -- verdadeiro quando nao se sabe a data de
   nascimento, ou quando o aluno e menor de 18 e o ultimo registro do
   responsavel nao e um aceite da versao vigente. Quem nao informou a data fica
   restrito ate informar (decisao conservadora: sem data, nao da para saber se
   e menor).
5. `aluno_finalidade_permitida(uuid, finalidade)` -- a pergunta que a API e as
   policies fazem: camera, telemetria, emocional, mentor ou pesquisa.
6. `vw_alunos_pesquisa_elegiveis` -- a UNICA porta para dado de aluno em
   pesquisa. So `service_role` le.
7. Policies RESTRITIVAS de INSERT/UPDATE nas quatro tabelas de telemetria de
   comportamento: o mobile tem um caminho que grava direto no Supabase quando a
   API falha (`persistTelemetryBatchDirect`), entao barrar so na API nao
   bastava.

## Quem pode o que

| funcao | cliente (`authenticated`) | por que |
|---|---|---|
| `aluno_registrar_data_nascimento` | sim | so a propria, `auth.uid()` |
| `responsavel_registrar_no_aparelho` | sim | so para o proprio aluno logado |
| `aluno_registrar_consentimento_pesquisa` | sim | so o proprio |
| `aluno_meu_consentimento` | sim | so o proprio |
| `aluno_minha_finalidade_permitida` | sim | usada nas policies; so o proprio |
| `professor_registrar_termo_papel` | sim | so aluno matriculado em turma do professor |
| `professor_termos_da_turma` | sim | so turma do professor; devolve situacao, nunca a data |
| `aluno_modo_restrito`, `aluno_finalidade_permitida`, `aluno_eh_menor` | **nao** | recebem qualquer uuid; so API (`postgres`) e `service_role` |

Nada aqui foi aplicado em producao. Os alunos que ja existem nao tem data de
nascimento: depois desta migracao eles ficam em modo restrito ate informar a
data no app (e, se menores, ate o responsavel aceitar).

Revision ID: 20261024_02
Revises: 20261024_01
Create Date: 2026-10-24
"""

from alembic import op

revision = "20261024_02"
down_revision = "20261024_01"
branch_labels = None
depends_on = None

# Versoes vigentes dos dois termos. O mobile tem as mesmas strings em
# `mobile/src/utils/consentimentoResponsavel.ts`; o teste confere que batem.
VERSAO_RESPONSAVEL = "2026-10-24-resp-v1"
VERSAO_PESQUISA = "2026-10-24-pesq-v1"

FINALIDADES = ("camera", "telemetria", "emocional", "mentor", "pesquisa")
RELACOES = ("mae", "pai", "responsavel_legal", "outro")

TABELAS_DE_TELEMETRIA = (
    "telemetria_sessoes",
    "telemetria_lotes",
    "telemetria_eventos_app",
    "telemetria_time_metric_entries",
)

FUNCOES_INTERNAS = (
    "public.aluno_eh_menor(uuid)",
    "public.aluno_modo_restrito(uuid)",
    "public.aluno_finalidade_permitida(uuid, text)",
    "public.consentimento_responsavel_ultimo(uuid)",
)

FUNCOES_DO_CLIENTE = (
    "public.aluno_minha_finalidade_permitida(text)",
    "public.aluno_meu_consentimento()",
    "public.aluno_registrar_data_nascimento(date)",
    "public.responsavel_registrar_no_aparelho(text, boolean, text, text, boolean, jsonb, text, timestamptz, jsonb)",
    "public.aluno_registrar_consentimento_pesquisa(boolean, text, timestamptz, jsonb)",
    "public.professor_registrar_termo_papel(uuid, text, date, text, text, jsonb, text, boolean)",
    "public.professor_termos_da_turma(bigint)",
)

_LISTA_FINALIDADES = ", ".join(f"'{f}'" for f in FINALIDADES)
_LISTA_RELACOES = ", ".join(f"'{r}'" for r in RELACOES)

# Normaliza o jsonb de finalidades para as cinco chaves, todas booleanas.
# Chave ausente ou valor que nao seja `true` vira false -- o default e nao.
_NORMALIZA = "jsonb_build_object(" + ", ".join(
    f"'{f}', coalesce((p_finalidades ->> '{f}') = 'true', false)" for f in FINALIDADES
) + ")"

_SEM_FINALIDADES = "jsonb_build_object(" + ", ".join(f"'{f}', false" for f in FINALIDADES) + ")"


def _tabelas() -> list[str]:
    return [
        """
        CREATE TABLE IF NOT EXISTS public.aluno_nascimento (
          aluno_id        uuid        PRIMARY KEY
                          REFERENCES public.alunos (id) ON DELETE CASCADE,
          data_nascimento date        NOT NULL
                          CONSTRAINT aluno_nascimento_data_plausivel
                          CHECK (data_nascimento >= DATE '1900-01-01'),
          registrado_em   timestamptz NOT NULL DEFAULT now(),
          registrado_por  uuid        NOT NULL
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS public.consentimento_responsavel (
          id                bigserial   PRIMARY KEY,
          aluno_id          uuid        NOT NULL
                            REFERENCES public.alunos (id) ON DELETE CASCADE,
          -- Versao do termo do responsavel que estava na tela / no papel.
          versao            text        NOT NULL,
          status            text        NOT NULL
                            CHECK (status IN ('accepted', 'rejected')),
          metodo            text        NOT NULL
                            CONSTRAINT consentimento_responsavel_metodo
                            CHECK (metodo IN ('aparelho', 'papel')),
          -- As cinco finalidades, uma a uma: {_LISTA_FINALIDADES}.
          finalidades       jsonb       NOT NULL DEFAULT '{{}}'::jsonb,
          -- A pesquisa tem termo e versao proprios.
          pesquisa_versao   text,
          nome_responsavel  text,
          relacao           text
                            CHECK (relacao IS NULL OR relacao IN ({_LISTA_RELACOES})),
          -- No aparelho: o responsavel marcou a declaracao de que e o responsavel.
          declaracao        boolean     NOT NULL DEFAULT false,
          -- Quando o responsavel decidiu (aparelho) ou assinou (papel).
          decidido_em       timestamptz NOT NULL,
          -- Quando o servidor viu. Forcado por trigger.
          registrado_em     timestamptz NOT NULL DEFAULT now(),
          -- Sessao que gravou: o aluno (aparelho) ou o professor (papel).
          registrado_por    uuid        NOT NULL,
          -- Sem FK de proposito: a prova sobrevive a saida do professor.
          professor_id      uuid,
          origem            jsonb       NOT NULL DEFAULT '{{}}'::jsonb,
          CONSTRAINT consentimento_responsavel_aceite_identificado
            CHECK (status = 'rejected'
                   OR (nome_responsavel IS NOT NULL AND relacao IS NOT NULL)),
          CONSTRAINT consentimento_responsavel_papel_tem_professor
            CHECK (metodo <> 'papel' OR professor_id IS NOT NULL),
          CONSTRAINT consentimento_responsavel_unico
            UNIQUE (aluno_id, versao, metodo, decidido_em)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS consentimento_responsavel_aluno_idx
          ON public.consentimento_responsavel (aluno_id, decidido_em DESC, id DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS public.consentimento_pesquisa (
          id             bigserial   PRIMARY KEY,
          aluno_id       uuid        NOT NULL
                         REFERENCES public.alunos (id) ON DELETE CASCADE,
          versao         text        NOT NULL,
          status         text        NOT NULL
                         CHECK (status IN ('accepted', 'rejected')),
          decidido_em    timestamptz NOT NULL,
          registrado_em  timestamptz NOT NULL DEFAULT now(),
          origem         jsonb       NOT NULL DEFAULT '{}'::jsonb,
          CONSTRAINT consentimento_pesquisa_unico
            UNIQUE (aluno_id, versao, decidido_em)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS consentimento_pesquisa_aluno_idx
          ON public.consentimento_pesquisa (aluno_id, decidido_em DESC, id DESC)
        """,
    ]


def _carimbos_e_acl() -> list[str]:
    comandos: list[str] = []
    # Mesmo trigger do #339: o carimbo do servidor nao vem do cliente.
    for tabela in ("consentimento_responsavel", "consentimento_pesquisa"):
        comandos += [
            f"DROP TRIGGER IF EXISTS trg_consentimento_carimbo ON public.{tabela}",
            f"""
            CREATE TRIGGER trg_consentimento_carimbo
              BEFORE INSERT ON public.{tabela}
              FOR EACH ROW EXECUTE FUNCTION public.trg_consentimento_carimbo_do_servidor()
            """,
        ]
    for tabela in ("aluno_nascimento", "consentimento_responsavel", "consentimento_pesquisa"):
        comandos += [
            f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY",
            # O Supabase da GRANT de tudo a anon/authenticated por padrao em
            # tabela nova. Aqui o cliente so LE o proprio; escrever e por RPC.
            f"REVOKE ALL ON public.{tabela} FROM PUBLIC, anon, authenticated",
            f"GRANT SELECT ON public.{tabela} TO authenticated",
            f"GRANT ALL ON public.{tabela} TO service_role",
            f"DROP POLICY IF EXISTS {tabela}_aluno_sel ON public.{tabela}",
            f"""
            CREATE POLICY {tabela}_aluno_sel
              ON public.{tabela}
              FOR SELECT TO authenticated
              USING (aluno_id = auth.uid())
            """,
        ]
    for seq in ("consentimento_responsavel_id_seq", "consentimento_pesquisa_id_seq"):
        comandos += [
            f"REVOKE ALL ON SEQUENCE public.{seq} FROM PUBLIC, anon, authenticated",
            f"GRANT USAGE, SELECT ON SEQUENCE public.{seq} TO service_role",
        ]
    return comandos


VERSOES_SQL = f"""
CREATE OR REPLACE FUNCTION public.consentimento_responsavel_versao_vigente()
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT '{VERSAO_RESPONSAVEL}'::text $function$;

CREATE OR REPLACE FUNCTION public.consentimento_pesquisa_versao_vigente()
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT '{VERSAO_PESQUISA}'::text $function$;
"""

# Funcoes internas: recebem qualquer uuid, entao NAO vao para o cliente.
INTERNAS_SQL = f"""
CREATE OR REPLACE FUNCTION public.aluno_eh_menor(p_aluno uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- NULL quando a data e desconhecida. "Hoje" no fuso da escola, nao em UTC:
  -- quem faz 18 anos faz no dia de Brasilia.
  SELECT n.data_nascimento
           > ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '18 years')::date
    FROM public.aluno_nascimento n
   WHERE n.aluno_id = p_aluno
$function$;

CREATE OR REPLACE FUNCTION public.consentimento_responsavel_ultimo(p_aluno uuid)
RETURNS public.consentimento_responsavel
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- A ULTIMA decisao vale, por qualquer metodo: uma revogacao no aparelho
  -- depois do termo em papel revoga o papel, e vice-versa.
  SELECT c.*
    FROM public.consentimento_responsavel c
   WHERE c.aluno_id = p_aluno
   ORDER BY c.decidido_em DESC, c.id DESC
   LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.aluno_modo_restrito(p_aluno uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_menor  boolean;
  v_ultimo public.consentimento_responsavel;
BEGIN
  IF p_aluno IS NULL THEN
    RETURN true;
  END IF;
  v_menor := public.aluno_eh_menor(p_aluno);
  -- Sem data de nascimento nao da para saber se e menor: restrito ate informar.
  IF v_menor IS NULL THEN
    RETURN true;
  END IF;
  IF NOT v_menor THEN
    RETURN false;
  END IF;
  v_ultimo := public.consentimento_responsavel_ultimo(p_aluno);
  RETURN NOT coalesce(
    v_ultimo.status = 'accepted'
      AND v_ultimo.versao = public.consentimento_responsavel_versao_vigente(),
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aluno_finalidade_permitida(p_aluno uuid, p_finalidade text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_menor   boolean;
  v_ultimo  public.consentimento_responsavel;
  v_pesq    public.consentimento_pesquisa;
BEGIN
  IF p_finalidade IS NULL OR p_finalidade NOT IN ({_LISTA_FINALIDADES}) THEN
    RAISE EXCEPTION USING MESSAGE = 'finalidade desconhecida', ERRCODE = '22023';
  END IF;
  IF public.aluno_modo_restrito(p_aluno) THEN
    RETURN false;
  END IF;
  v_menor := public.aluno_eh_menor(p_aluno);

  IF p_finalidade = 'pesquisa' THEN
    -- Pesquisa exige o aceite do PROPRIO aluno na versao vigente...
    SELECT cp.* INTO v_pesq
      FROM public.consentimento_pesquisa cp
     WHERE cp.aluno_id = p_aluno
     ORDER BY cp.decidido_em DESC, cp.id DESC
     LIMIT 1;
    IF NOT coalesce(
         v_pesq.status = 'accepted'
           AND v_pesq.versao = public.consentimento_pesquisa_versao_vigente(),
         false) THEN
      RETURN false;
    END IF;
    IF NOT v_menor THEN
      RETURN true;
    END IF;
    -- ...e, se menor, tambem o do responsavel, na versao vigente da pesquisa.
    v_ultimo := public.consentimento_responsavel_ultimo(p_aluno);
    RETURN coalesce(
      (v_ultimo.finalidades ->> 'pesquisa') = 'true'
        AND v_ultimo.pesquisa_versao = public.consentimento_pesquisa_versao_vigente(),
      false
    );
  END IF;

  -- Maior de idade: o termo do proprio aluno (consentimento_telemetria) rege.
  IF NOT v_menor THEN
    RETURN true;
  END IF;
  -- Menor fora do modo restrito: o ultimo registro e um aceite vigente; vale
  -- so o que o responsavel marcou.
  v_ultimo := public.consentimento_responsavel_ultimo(p_aluno);
  RETURN coalesce((v_ultimo.finalidades ->> p_finalidade) = 'true', false);
END;
$function$;
"""

CLIENTE_SQL = f"""
CREATE OR REPLACE FUNCTION public.aluno_minha_finalidade_permitida(p_finalidade text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- So a sessao: e o que as policies de telemetria perguntam.
  SELECT public.aluno_finalidade_permitida(auth.uid(), p_finalidade)
$function$;

CREATE OR REPLACE FUNCTION public.aluno_meu_consentimento()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_menor  boolean;
  v_ultimo public.consentimento_responsavel;
  v_pesq   public.consentimento_pesquisa;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  v_menor := public.aluno_eh_menor(v_uid);
  v_ultimo := public.consentimento_responsavel_ultimo(v_uid);
  SELECT cp.* INTO v_pesq
    FROM public.consentimento_pesquisa cp
   WHERE cp.aluno_id = v_uid
   ORDER BY cp.decidido_em DESC, cp.id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'data_nascimento_informada', v_menor IS NOT NULL,
    'menor', v_menor,
    'modo_restrito', public.aluno_modo_restrito(v_uid),
    'versao_responsavel_vigente', public.consentimento_responsavel_versao_vigente(),
    'versao_pesquisa_vigente', public.consentimento_pesquisa_versao_vigente(),
    'responsavel', CASE WHEN v_ultimo.id IS NULL THEN NULL ELSE jsonb_build_object(
        'status', v_ultimo.status,
        'versao', v_ultimo.versao,
        'metodo', v_ultimo.metodo,
        'finalidades', v_ultimo.finalidades,
        'pesquisa_versao', v_ultimo.pesquisa_versao,
        'decidido_em', v_ultimo.decidido_em,
        'vigente', v_ultimo.status = 'accepted'
                   AND v_ultimo.versao = public.consentimento_responsavel_versao_vigente()
      ) END,
    'pesquisa', CASE WHEN v_pesq.id IS NULL THEN NULL ELSE jsonb_build_object(
        'status', v_pesq.status,
        'versao', v_pesq.versao,
        'decidido_em', v_pesq.decidido_em,
        'vigente', v_pesq.status = 'accepted'
                   AND v_pesq.versao = public.consentimento_pesquisa_versao_vigente()
      ) END,
    'finalidades', jsonb_build_object(
      {", ".join(f"'{f}', public.aluno_finalidade_permitida(v_uid, '{f}')" for f in FINALIDADES)}
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aluno_registrar_data_nascimento(p_data date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_atual date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno nao encontrado', ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje OR p_data < (v_hoje - INTERVAL '120 years')::date THEN
    RAISE EXCEPTION USING MESSAGE = 'data de nascimento invalida', ERRCODE = '22008';
  END IF;

  SELECT n.data_nascimento INTO v_atual
    FROM public.aluno_nascimento n WHERE n.aluno_id = v_uid;
  IF v_atual IS NOT NULL AND v_atual <> p_data THEN
    -- Grava uma vez. Se o aluno pudesse trocar, o menor "envelhecia" e saia do
    -- modo restrito sozinho. Correcao e com a escola (service_role).
    RAISE EXCEPTION USING
      MESSAGE = 'data de nascimento ja registrada; para corrigir, fale com a escola',
      ERRCODE = '23505';
  END IF;

  INSERT INTO public.aluno_nascimento (aluno_id, data_nascimento, registrado_por)
  VALUES (v_uid, p_data, v_uid)
  ON CONFLICT (aluno_id) DO NOTHING;

  RETURN public.aluno_meu_consentimento();
END;
$function$;

CREATE OR REPLACE FUNCTION public.responsavel_registrar_no_aparelho(
  p_versao text,
  p_aceito boolean,
  p_nome_responsavel text,
  p_relacao text,
  p_declaracao boolean,
  p_finalidades jsonb,
  p_pesquisa_versao text,
  p_decidido_em timestamptz,
  p_origem jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_menor       boolean;
  v_nome        text := nullif(btrim(coalesce(p_nome_responsavel, '')), '');
  v_finalidades jsonb;
  v_pesq_versao text;
  v_decidido    timestamptz := coalesce(p_decidido_em, now());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno nao encontrado', ERRCODE = '42501';
  END IF;
  v_menor := public.aluno_eh_menor(v_uid);
  IF v_menor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'informe a data de nascimento antes', ERRCODE = '22023';
  END IF;
  IF NOT v_menor THEN
    RAISE EXCEPTION USING
      MESSAGE = 'aluno maior de idade: o termo do responsavel nao se aplica',
      ERRCODE = '22023';
  END IF;
  IF p_versao IS DISTINCT FROM public.consentimento_responsavel_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao do termo do responsavel desatualizada', ERRCODE = '22023';
  END IF;
  IF v_decidido > now() + INTERVAL '10 minutes' THEN
    RAISE EXCEPTION USING MESSAGE = 'decisao no futuro', ERRCODE = '22008';
  END IF;

  IF coalesce(p_aceito, false) THEN
    IF v_nome IS NULL OR char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
      RAISE EXCEPTION USING MESSAGE = 'nome do responsavel obrigatorio', ERRCODE = '22023';
    END IF;
    IF p_relacao IS NULL OR p_relacao NOT IN ({_LISTA_RELACOES}) THEN
      RAISE EXCEPTION USING MESSAGE = 'relacao com o aluno invalida', ERRCODE = '22023';
    END IF;
    IF NOT coalesce(p_declaracao, false) THEN
      RAISE EXCEPTION USING
        MESSAGE = 'o responsavel precisa declarar que e o responsavel legal',
        ERRCODE = '22023';
    END IF;
    v_finalidades := {_NORMALIZA};
    IF (v_finalidades ->> 'pesquisa') = 'true' THEN
      IF p_pesquisa_versao IS DISTINCT FROM public.consentimento_pesquisa_versao_vigente() THEN
        RAISE EXCEPTION USING MESSAGE = 'versao do termo de pesquisa desatualizada', ERRCODE = '22023';
      END IF;
      v_pesq_versao := p_pesquisa_versao;
    END IF;
  ELSE
    -- Revogar e sempre possivel, e revoga tudo.
    v_finalidades := {_SEM_FINALIDADES};
  END IF;

  INSERT INTO public.consentimento_responsavel (
    aluno_id, versao, status, metodo, finalidades, pesquisa_versao,
    nome_responsavel, relacao, declaracao, decidido_em, registrado_por, origem
  ) VALUES (
    v_uid, p_versao,
    CASE WHEN coalesce(p_aceito, false) THEN 'accepted' ELSE 'rejected' END,
    'aparelho', v_finalidades, v_pesq_versao,
    v_nome,
    CASE WHEN p_relacao IN ({_LISTA_RELACOES}) THEN p_relacao END,
    coalesce(p_declaracao, false), v_decidido, v_uid,
    coalesce(p_origem, '{{}}'::jsonb)
  )
  -- Reenvio do mobile quando a rede falha: a mesma decisao nao duplica.
  ON CONFLICT ON CONSTRAINT consentimento_responsavel_unico DO NOTHING;

  RETURN public.aluno_meu_consentimento();
END;
$function$;

CREATE OR REPLACE FUNCTION public.aluno_registrar_consentimento_pesquisa(
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
  IF p_versao IS DISTINCT FROM public.consentimento_pesquisa_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao do termo de pesquisa desatualizada', ERRCODE = '22023';
  END IF;
  IF v_decidido > now() + INTERVAL '10 minutes' THEN
    RAISE EXCEPTION USING MESSAGE = 'decisao no futuro', ERRCODE = '22008';
  END IF;

  INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em, origem)
  VALUES (
    v_uid, p_versao,
    CASE WHEN coalesce(p_aceito, false) THEN 'accepted' ELSE 'rejected' END,
    v_decidido, coalesce(p_origem, '{{}}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT consentimento_pesquisa_unico DO NOTHING;

  RETURN public.aluno_meu_consentimento();
END;
$function$;

CREATE OR REPLACE FUNCTION public.professor_registrar_termo_papel(
  p_aluno uuid,
  p_versao text,
  p_data_assinatura date,
  p_nome_responsavel text,
  p_relacao text,
  p_finalidades jsonb,
  p_pesquisa_versao text,
  p_aceito boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_nome        text := nullif(btrim(coalesce(p_nome_responsavel, '')), '');
  v_finalidades jsonb;
  v_pesq_versao text;
  v_decidido    timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professor pr WHERE pr.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'apenas professor registra termo em papel', ERRCODE = '42501';
  END IF;
  -- So aluno matriculado numa turma DESTE professor.
  IF NOT EXISTS (
    SELECT 1
      FROM public.classe_aluno ca
      JOIN public.classe c ON c.id = ca.classe_id
     WHERE ca.aluno_id = p_aluno
       AND c.professor_id = v_uid
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno fora das suas turmas', ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM public.consentimento_responsavel_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao do termo do responsavel desatualizada', ERRCODE = '22023';
  END IF;
  IF p_data_assinatura IS NULL
     OR p_data_assinatura > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING MESSAGE = 'data de assinatura invalida', ERRCODE = '22008';
  END IF;
  v_decidido := (p_data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo');

  IF coalesce(p_aceito, true) THEN
    IF v_nome IS NULL OR char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
      RAISE EXCEPTION USING MESSAGE = 'nome do responsavel obrigatorio', ERRCODE = '22023';
    END IF;
    IF p_relacao IS NULL OR p_relacao NOT IN ({_LISTA_RELACOES}) THEN
      RAISE EXCEPTION USING MESSAGE = 'relacao com o aluno invalida', ERRCODE = '22023';
    END IF;
    v_finalidades := {_NORMALIZA};
    IF (v_finalidades ->> 'pesquisa') = 'true' THEN
      IF p_pesquisa_versao IS DISTINCT FROM public.consentimento_pesquisa_versao_vigente() THEN
        RAISE EXCEPTION USING MESSAGE = 'versao do termo de pesquisa desatualizada', ERRCODE = '22023';
      END IF;
      v_pesq_versao := p_pesquisa_versao;
    END IF;
  ELSE
    v_finalidades := {_SEM_FINALIDADES};
  END IF;

  INSERT INTO public.consentimento_responsavel (
    aluno_id, versao, status, metodo, finalidades, pesquisa_versao,
    nome_responsavel, relacao, declaracao, decidido_em, registrado_por,
    professor_id, origem
  ) VALUES (
    p_aluno, p_versao,
    CASE WHEN coalesce(p_aceito, true) THEN 'accepted' ELSE 'rejected' END,
    'papel', v_finalidades, v_pesq_versao,
    v_nome,
    CASE WHEN p_relacao IN ({_LISTA_RELACOES}) THEN p_relacao END,
    false, v_decidido, v_uid, v_uid,
    jsonb_build_object('canal', 'console')
  )
  ON CONFLICT ON CONSTRAINT consentimento_responsavel_unico DO NOTHING;

  RETURN jsonb_build_object(
    'aluno_id', p_aluno,
    'modo_restrito', public.aluno_modo_restrito(p_aluno)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.professor_termos_da_turma(p_classe_id bigint)
RETURNS TABLE (
  aluno_id    uuid,
  situacao    text,
  metodo      text,
  versao      text,
  decidido_em timestamptz,
  vigente     boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.classe c WHERE c.id = p_classe_id AND c.professor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'turma fora das suas turmas', ERRCODE = '42501';
  END IF;

  -- Devolve a SITUACAO, nunca a data de nascimento.
  RETURN QUERY
  SELECT ca.aluno_id,
         CASE
           WHEN m.menor IS NULL THEN 'sem_data_nascimento'
           WHEN NOT m.menor THEN 'maior'
           WHEN public.aluno_modo_restrito(ca.aluno_id) THEN 'menor_sem_termo'
           ELSE 'menor_com_termo'
         END,
         u.metodo,
         u.versao,
         u.decidido_em,
         coalesce(u.status = 'accepted'
                  AND u.versao = public.consentimento_responsavel_versao_vigente(), false)
    FROM public.classe_aluno ca
    CROSS JOIN LATERAL (SELECT public.aluno_eh_menor(ca.aluno_id) AS menor) m
    LEFT JOIN LATERAL (
      SELECT * FROM public.consentimento_responsavel_ultimo(ca.aluno_id)
    ) u ON u.id IS NOT NULL
   WHERE ca.classe_id = p_classe_id;
END;
$function$;
"""

VIEW_SQL = """
CREATE OR REPLACE VIEW public.vw_alunos_pesquisa_elegiveis
WITH (security_invoker = on) AS
SELECT a.id AS aluno_id,
       cp.versao AS pesquisa_versao,
       cp.decidido_em AS pesquisa_aceita_em
  FROM public.alunos a
  JOIN LATERAL (
    SELECT p.versao, p.decidido_em
      FROM public.consentimento_pesquisa p
     WHERE p.aluno_id = a.id
     ORDER BY p.decidido_em DESC, p.id DESC
     LIMIT 1
  ) cp ON true
 WHERE public.aluno_finalidade_permitida(a.id, 'pesquisa');
"""


def _acl_funcoes() -> list[str]:
    comandos = [
        "GRANT EXECUTE ON FUNCTION public.consentimento_responsavel_versao_vigente() TO authenticated, service_role",
        "GRANT EXECUTE ON FUNCTION public.consentimento_pesquisa_versao_vigente() TO authenticated, service_role",
    ]
    for assinatura in FUNCOES_INTERNAS:
        comandos += [
            f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated",
            f"GRANT EXECUTE ON FUNCTION {assinatura} TO service_role",
        ]
    for assinatura in FUNCOES_DO_CLIENTE:
        comandos += [
            f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon",
            f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role",
        ]
    comandos += [
        "REVOKE ALL ON public.vw_alunos_pesquisa_elegiveis FROM PUBLIC, anon, authenticated",
        "GRANT SELECT ON public.vw_alunos_pesquisa_elegiveis TO service_role",
    ]
    return comandos


def _policies_de_telemetria() -> list[str]:
    comandos: list[str] = []
    for tabela in TABELAS_DE_TELEMETRIA:
        for acao in ("ins", "upd"):
            nome = f"{tabela}_consentimento_{acao}"
            comandos.append(f"DROP POLICY IF EXISTS {nome} ON public.{tabela}")
        # RESTRICTIVE: soma com as policies de posse que ja existem (AND), nao
        # abre nada novo. Barra o caminho direto do mobile para aluno restrito.
        comandos += [
            f"""
            CREATE POLICY {tabela}_consentimento_ins
              ON public.{tabela}
              AS RESTRICTIVE
              FOR INSERT TO authenticated
              WITH CHECK (public.aluno_minha_finalidade_permitida('telemetria'))
            """,
            f"""
            CREATE POLICY {tabela}_consentimento_upd
              ON public.{tabela}
              AS RESTRICTIVE
              FOR UPDATE TO authenticated
              USING (public.aluno_minha_finalidade_permitida('telemetria'))
              WITH CHECK (public.aluno_minha_finalidade_permitida('telemetria'))
            """,
        ]
    return comandos


def upgrade() -> None:
    for sql in _tabelas():
        op.execute(sql)
    for sql in _carimbos_e_acl():
        op.execute(sql)
    op.execute(VERSOES_SQL)
    op.execute(INTERNAS_SQL)
    op.execute(CLIENTE_SQL)
    op.execute(VIEW_SQL)
    for sql in _acl_funcoes():
        op.execute(sql)
    for sql in _policies_de_telemetria():
        op.execute(sql)


def downgrade() -> None:
    for tabela in TABELAS_DE_TELEMETRIA:
        for acao in ("ins", "upd"):
            op.execute(f"DROP POLICY IF EXISTS {tabela}_consentimento_{acao} ON public.{tabela}")
    op.execute("DROP VIEW IF EXISTS public.vw_alunos_pesquisa_elegiveis")
    for assinatura in FUNCOES_DO_CLIENTE:
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
    for assinatura in reversed(FUNCOES_INTERNAS):
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
    op.execute("DROP FUNCTION IF EXISTS public.consentimento_responsavel_versao_vigente()")
    op.execute("DROP FUNCTION IF EXISTS public.consentimento_pesquisa_versao_vigente()")
    for tabela in ("consentimento_responsavel", "consentimento_pesquisa"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_consentimento_carimbo ON public.{tabela}")
    # AS TABELAS FICAM. `consentimento_responsavel` e `consentimento_pesquisa`
    # sao prova de consentimento, e `aluno_nascimento` e o dado que decide se
    # o aluno e menor: apagar no downgrade destruiria a evidencia.
