"""Momentos de cuidado, RPCs e cronometro que respeita o cuidado

O modo de cuidado acolhe o aluno em crise ou sobrecarregado. Esta migracao cria onde ele
registra o que aconteceu, e as RPCs que a API, o app e o console chamam. Dado sensivel: so
existe com o consentimento vigente (`aluno_cuidado_permitido`, `20261120_04`) e guarda numeros
e codigos, nunca o texto do aluno.

## O que esta migracao cria

1. `aluno_momento_cuidado` -- uma linha por momento (`origem`, `nivel`, `fatos`, `acoes`,
   `expira_em`, `resposta`). RLS ligada e a policy de SELECT nascem no mesmo arquivo.
2. `fn_cuidado_registrar` -- grava (interna: so API/`service_role`). Confere consentimento e
   matricula, valida `fatos`/`acoes` contra a lista de chaves, aplica o intervalo POR ORIGEM e
   deixa um nivel mais alto atualizar o momento aberto em vez de ser descartado.
3. `cuidado_registrar` -- a mesma coisa para o aparelho (`auth.uid()`), **so** com
   `origem = 'sinais_de_uso'` e sem nivel: o que o aluno diz ao Guia so entra pela API.
4. `cuidado_responder` -- o aluno diz se aceitou a pausa ou continuou (uma vez, so o proprio).
   E o que a secao "Medir" da spec conta.
5. `cuidado_ativo` -- ha modo de cuidado valendo? Reabrir o app nao o perde.
6. `cuidado_da_turma` -- o professor le os momentos de um aluno, **sem `nivel`**, com o acerto
   antes e depois (mesma conta de `vw_chat_guia_aluno_topico`, `20261118_01`: coincidencia no
   tempo, nao efeito).
7. `fn_cronometro_ligado` -- parte do texto vivo em producao e devolve `false` enquanto ha
   momento valendo. `aluno_cronometro` nao e tocado: passado o cuidado, vale a escolha dele.
8. `responsavel_registrar_cuidado` -- regravada a partir da `20261120_04`: quando o RESPONSAVEL
   revoga o cuidado, os momentos do aluno tambem sao apagados (como na revogacao do proprio aluno).
9. Chaves de `app_config` (`cuidado_*`, publicas) e a linha em `retencao_politica` (180 dias,
   a pesquisa nao estende o prazo de dado sensivel).

## Decisoes de acesso (registradas, nao esquecidas)

- **O professor NAO tem policy na tabela base.** Com view `security_invoker` ele precisaria de
  SELECT na base e leria `nivel` direto; so `cuidado_da_turma` (DEFINER, posse conferida antes de
  ler) chega a ele, e ela nao devolve o nivel. O aluno le os proprios momentos, com nivel.
- **Nenhum cliente escreve direto**: so as RPCs.
- **`fn_cronometro_ligado` continua sem EXECUTE para o cliente** (ACL da `20261101_13`) e
  continua INVOKER: quem a chama sao as RPCs SECURITY DEFINER da tentativa, que rodam como dono e
  portanto leem `aluno_momento_cuidado` por cima da policy de SELECT do aluno. Nao ha chamador
  de cliente que a RLS escondesse; por isso nao ha helper DEFINER extra. Se algum dia um cliente
  passar a chama-la, a policy (`aluno_id = auth.uid()`) so mostraria os momentos do proprio
  aluno, que e o unico caso valido.
- `fn_cuidado_registrar` e `fn_cuidado_config_int` ficam sem EXECUTE para o cliente: a primeira
  recebe qualquer uuid.

Nada aqui foi aplicado em producao.

Revision ID: 20261120_05
Revises: 20261120_04
Create Date: 2026-11-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261120_05"
down_revision = "20261120_04"
branch_labels = None
depends_on = None

NIVEIS = ("desconforto", "crise", "risco")
ORIGENS = ("aluno_disse", "sinais_de_uso")
FATOS = ("erros_seguidos", "minutos_sem_parar", "abandonos")
ACOES = ("pausa_sugerida", "cronometro_desligado", "tecnica_oferecida", "cvv_indicado")
RESPOSTAS = ("pausou", "continuou")
DIAS = 180


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def _array(valores: tuple[str, ...]) -> str:
    return "ARRAY[" + ", ".join(f"'{v}'" for v in valores) + "]"


CONFIG_SQL = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('cuidado_erros_seguidos', '5',
   'Modo de cuidado: erros seguidos que sugerem sobrecarga.', true),
  ('cuidado_minutos_sem_parar', '50',
   'Modo de cuidado: minutos de estudo sem parar que sugerem sobrecarga.', true),
  ('cuidado_abandonos', '2',
   'Modo de cuidado: atividades abandonadas em sequencia que sugerem sobrecarga.', true),
  ('cuidado_intervalo_min', '120',
   'Modo de cuidado: intervalo minimo, em minutos, entre dois momentos da mesma origem.', true),
  ('cuidado_duracao_min', '120',
   'Modo de cuidado: ate quando o alivio vale, em minutos a partir do momento.', true)
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.retencao_politica
  (tabela, acao, coluna_aluno, coluna_tempo, dias, dias_pesquisa, ordem, categoria, motivo)
VALUES
  ('aluno_momento_cuidado', 'apagar', 'aluno_id', 'criado_em', 180, 180, 89, 'cuidado',
   'momentos de cuidado: dado sensivel, guarda o minimo; a pesquisa nao estende o prazo')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

TABELA_SQL = [
    f"""
    CREATE TABLE IF NOT EXISTS public.aluno_momento_cuidado (
      id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      aluno_id   uuid        NOT NULL REFERENCES public.alunos (id) ON DELETE CASCADE,
      classe_id  bigint      NOT NULL REFERENCES public.classe (id) ON DELETE CASCADE,
      topico_id  bigint      REFERENCES public.topicos (id) ON DELETE SET NULL,
      criado_em  timestamptz NOT NULL DEFAULT now(),
      origem     text        NOT NULL CHECK (origem IN ({_lista(ORIGENS)})),
      nivel      text        CHECK (nivel IS NULL OR nivel IN ({_lista(NIVEIS)})),
      fatos      jsonb       NOT NULL DEFAULT '{{}}'::jsonb,
      acoes      jsonb       NOT NULL DEFAULT '{{}}'::jsonb,
      expira_em  timestamptz NOT NULL,
      resposta   text        CHECK (resposta IS NULL OR resposta IN ({_lista(RESPOSTAS)})),
      CONSTRAINT aluno_momento_cuidado_nivel_so_do_aluno
        CHECK (origem = 'aluno_disse' OR nivel IS NULL)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS aluno_momento_cuidado_aluno_idx
      ON public.aluno_momento_cuidado (aluno_id, criado_em DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS aluno_momento_cuidado_classe_idx
      ON public.aluno_momento_cuidado (classe_id, aluno_id)
    """,
    "ALTER TABLE public.aluno_momento_cuidado ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON public.aluno_momento_cuidado FROM PUBLIC, anon, authenticated",
    "GRANT SELECT ON public.aluno_momento_cuidado TO authenticated",
    "GRANT ALL ON public.aluno_momento_cuidado TO service_role",
    "DROP POLICY IF EXISTS aluno_momento_cuidado_aluno_sel ON public.aluno_momento_cuidado",
    """
    CREATE POLICY aluno_momento_cuidado_aluno_sel
      ON public.aluno_momento_cuidado
      FOR SELECT TO authenticated
      USING (aluno_id = auth.uid())
    """,
    "REVOKE ALL ON SEQUENCE public.aluno_momento_cuidado_id_seq FROM PUBLIC, anon, authenticated",
    "GRANT USAGE, SELECT ON SEQUENCE public.aluno_momento_cuidado_id_seq TO service_role",
    """
    COMMENT ON TABLE public.aluno_momento_cuidado IS
      'Momentos de cuidado (20261120_05). So numeros e codigos, nunca o texto do aluno. Aluno le os '
      'proprios; professor SEM policy aqui de proposito (cuidado_da_turma nao devolve o nivel); '
      'escrita so por RPC.'
    """,
]

# O texto vivo de producao (lido em 20/11/2026, alembic_version = 20261118_01) com o cuidado antes
# do COALESCE. Continua INVOKER, STABLE e com o mesmo search_path.
CRONOMETRO_SQL = """
CREATE OR REPLACE FUNCTION public.fn_cronometro_ligado(p_aluno uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- Modo de cuidado valendo: sem cronometro, mesmo que o aluno o tenha ligado. A escolha dele
    -- (aluno_cronometro) nao e tocada, e volta a valer quando o momento expira.
    WHEN EXISTS (
      SELECT 1 FROM public.aluno_momento_cuidado mc
       WHERE mc.aluno_id = p_aluno AND mc.expira_em > now()
    ) THEN false
    ELSE COALESCE(
      (SELECT ac.ligado FROM public.aluno_cronometro ac WHERE ac.aluno_id = p_aluno),
      -- Perfil dominante: maior afinidade, desempate pelo nome (a regra de listar_alunos_classe_com_perfil_dominante).
      -- Sem perfil, o app trata como seeker: desligado.
      (SELECT lower(p.nome) IN ('survivor', 'mastermind', 'achiever', 'conqueror', 'daredevil')
         FROM public.aluno_perfil ap
         JOIN public.perfil p ON p.id = ap.perfil_id
        WHERE ap.aluno_id = p_aluno
        ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
        LIMIT 1),
      false
    )
  END;
$function$;
"""

# Regravada a partir da `20261120_04`; so muda o DELETE no ramo da revogacao.
RESPONSAVEL_SQL = """
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
    IF v_relacao IS NULL OR v_relacao NOT IN ('mae', 'pai', 'responsavel_legal', 'outro') THEN
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

  -- Revogar apaga o que o cuidado guardou, como na revogacao do proprio aluno.
  IF NOT coalesce(p_aceito, false) THEN
    DELETE FROM public.aluno_momento_cuidado WHERE aluno_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'permitido', public.aluno_cuidado_permitido(v_uid),
    'versao_vigente', public.consentimento_cuidado_versao_vigente()
  );
END;
$function$;
"""

FUNCOES_SQL = f"""
CREATE OR REPLACE FUNCTION public.fn_cuidado_config_int(p_chave text, p_padrao integer)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT CASE WHEN c.valor ~ '^[0-9]+$' THEN c.valor::integer END
       FROM public.app_config c WHERE c.chave = p_chave),
    p_padrao)
$function$;

CREATE OR REPLACE FUNCTION public.fn_cuidado_registrar(
  p_aluno uuid,
  p_classe_id bigint,
  p_topico_id bigint,
  p_origem text,
  p_nivel text,
  p_fatos jsonb,
  p_acoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fatos     jsonb := coalesce(p_fatos, '{{}}'::jsonb);
  v_acoes     jsonb := coalesce(p_acoes, '{{}}'::jsonb);
  v_chave     text;
  v_valor     jsonb;
  v_intervalo integer := public.fn_cuidado_config_int('cuidado_intervalo_min', 120);
  v_duracao   integer := public.fn_cuidado_config_int('cuidado_duracao_min', 120);
  v_aberto    public.aluno_momento_cuidado;
  v_rank_novo integer;
  v_rank_velho integer;
  v_id        bigint;
  v_expira    timestamptz := now() + make_interval(mins => v_duracao);
BEGIN
  IF p_aluno IS NULL OR p_classe_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_matricula');
  END IF;
  IF p_origem IS NULL OR p_origem <> ALL ({_array(ORIGENS)}) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_invalida');
  END IF;
  IF p_origem = 'aluno_disse' THEN
    IF p_nivel IS NULL OR p_nivel <> ALL ({_array(NIVEIS)}) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'nivel_invalido');
    END IF;
  ELSIF p_nivel IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nivel_invalido');
  END IF;

  -- So numeros inteiros de 0 a 1000, so nas chaves da lista: nenhum texto entra aqui.
  IF jsonb_typeof(v_fatos) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fato_invalido');
  END IF;
  FOR v_chave, v_valor IN SELECT * FROM jsonb_each(v_fatos) LOOP
    IF v_chave <> ALL ({_array(FATOS)})
       OR jsonb_typeof(v_valor) <> 'number'
       OR (v_valor #>> '{{}}')::numeric <> trunc((v_valor #>> '{{}}')::numeric)
       OR (v_valor #>> '{{}}')::numeric NOT BETWEEN 0 AND 1000 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'fato_invalido');
    END IF;
  END LOOP;
  IF jsonb_typeof(v_acoes) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'acao_invalida');
  END IF;
  FOR v_chave, v_valor IN SELECT * FROM jsonb_each(v_acoes) LOOP
    IF v_chave <> ALL ({_array(ACOES)}) OR jsonb_typeof(v_valor) <> 'boolean' THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'acao_invalida');
    END IF;
  END LOOP;

  IF NOT public.aluno_cuidado_permitido(p_aluno) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_consentimento');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.aluno_id = p_aluno AND ca.classe_id = p_classe_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_matricula');
  END IF;
  IF p_topico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.topicos t WHERE t.id = p_topico_id AND t.classe_id = p_classe_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'topico_invalido');
  END IF;

  -- Duas chamadas do mesmo aluno ao mesmo tempo nao podem as duas achar "nada aberto".
  PERFORM pg_advisory_xact_lock(hashtextextended('cuidado:' || p_aluno::text, 0));

  SELECT m.* INTO v_aberto
    FROM public.aluno_momento_cuidado m
   WHERE m.aluno_id = p_aluno
     AND m.origem = p_origem
     AND m.criado_em > now() - make_interval(mins => v_intervalo)
   ORDER BY m.criado_em DESC, m.id DESC
   LIMIT 1;

  IF v_aberto.id IS NULL THEN
    INSERT INTO public.aluno_momento_cuidado
      (aluno_id, classe_id, topico_id, origem, nivel, fatos, acoes, expira_em)
    VALUES
      (p_aluno, p_classe_id, p_topico_id, p_origem, p_nivel, v_fatos, v_acoes, v_expira)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'momento_id', v_id, 'expira_em', v_expira, 'atualizado', false);
  END IF;

  -- Dentro do intervalo, so um nivel MAIS ALTO grava: atualiza o momento aberto.
  v_rank_novo := coalesce(array_position({_array(NIVEIS)}, p_nivel), 0);
  v_rank_velho := coalesce(array_position({_array(NIVEIS)}, v_aberto.nivel), 0);
  IF v_rank_novo <= v_rank_velho THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'intervalo');
  END IF;

  UPDATE public.aluno_momento_cuidado m
     SET nivel = p_nivel,
         fatos = m.fatos || v_fatos,
         acoes = m.acoes || v_acoes,
         expira_em = v_expira
   WHERE m.id = v_aberto.id;
  RETURN jsonb_build_object('ok', true, 'momento_id', v_aberto.id, 'expira_em', v_expira, 'atualizado', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuidado_registrar(
  p_classe_id bigint,
  p_topico_id bigint,
  p_origem text,
  p_fatos jsonb,
  p_acoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  -- O que o aluno diz ao Guia (e o nivel) so entra pela API: o aparelho so mede o uso.
  IF p_origem IS DISTINCT FROM 'sinais_de_uso' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_invalida');
  END IF;
  RETURN public.fn_cuidado_registrar(v_uid, p_classe_id, p_topico_id, p_origem, NULL, p_fatos, p_acoes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuidado_responder(p_momento_id bigint, p_resposta text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF p_resposta IS NULL OR p_resposta <> ALL ({_array(RESPOSTAS)}) THEN
    RETURN false;
  END IF;
  -- So o proprio momento, e uma vez.
  UPDATE public.aluno_momento_cuidado m
     SET resposta = p_resposta
   WHERE m.id = p_momento_id AND m.aluno_id = v_uid AND m.resposta IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuidado_ativo(p_classe_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m   public.aluno_momento_cuidado;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_m
    FROM public.aluno_momento_cuidado m
   WHERE m.aluno_id = v_uid AND m.classe_id = p_classe_id AND m.expira_em > now()
   ORDER BY m.expira_em DESC, m.id DESC
   LIMIT 1;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('ativo', false, 'expira_em', NULL, 'origem', NULL);
  END IF;
  RETURN jsonb_build_object('ativo', true, 'expira_em', v_m.expira_em, 'origem', v_m.origem);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuidado_da_turma(p_classe_id bigint, p_aluno_id uuid)
RETURNS TABLE (
  criado_em timestamptz,
  topico_id bigint,
  origem text,
  fatos jsonb,
  acoes jsonb,
  resposta text,
  tentativas_antes integer,
  acerto_antes_pct numeric,
  tentativas_depois integer,
  acerto_depois_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A posse e conferida ANTES de ler, com NOT EXISTS.
  IF NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS c(id) WHERE c.id = p_classe_id
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'turma nao e sua', ERRCODE = '42501';
  END IF;

  -- Sem `nivel`: "o Guia indicou o CVV" chega como acao, nao como rotulo do aluno.
  RETURN QUERY
  SELECT m.criado_em, m.topico_id, m.origem, m.fatos, m.acoes, m.resposta,
         t.tentativas_antes::integer, t.acerto_antes_pct,
         t.tentativas_depois::integer, t.acerto_depois_pct
    FROM public.aluno_momento_cuidado m
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.respondida_em < m.criado_em) AS tentativas_antes,
             round(avg(x.acertos_percentual) FILTER (WHERE x.respondida_em < m.criado_em), 1)
                                                                    AS acerto_antes_pct,
             count(*) FILTER (WHERE x.respondida_em >= m.criado_em) AS tentativas_depois,
             round(avg(x.acertos_percentual) FILTER (WHERE x.respondida_em >= m.criado_em), 1)
                                                                    AS acerto_depois_pct
        FROM public.atividade_tentativas x
        JOIN public.atividades a ON a.id = x.atividade_id
       WHERE x.aluno_id = m.aluno_id
         AND x.classe_id = m.classe_id
         AND a.topico_id = m.topico_id
         AND x.respondida_em IS NOT NULL
         AND x.acertos_percentual IS NOT NULL
    ) t ON true
   WHERE m.classe_id = p_classe_id AND m.aluno_id = p_aluno_id
   ORDER BY m.criado_em DESC, m.id DESC
   LIMIT 200;
END;
$function$;
"""

INTERNAS = (
    "public.fn_cuidado_config_int(text, integer)",
    "public.fn_cuidado_registrar(uuid, bigint, bigint, text, text, jsonb, jsonb)",
)
DO_CLIENTE = (
    "public.cuidado_registrar(bigint, bigint, text, jsonb, jsonb)",
    "public.cuidado_responder(bigint, text)",
    "public.cuidado_ativo(bigint)",
    "public.cuidado_da_turma(bigint, uuid)",
)


def _acl() -> list[str]:
    comandos: list[str] = []
    for assinatura in INTERNAS:
        comandos += [
            f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated",
            f"GRANT EXECUTE ON FUNCTION {assinatura} TO service_role",
        ]
    for assinatura in DO_CLIENTE:
        comandos += [
            f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon",
            f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role",
        ]
    return comandos


def upgrade() -> None:
    for sql in TABELA_SQL:
        op.execute(sql)
    op.execute(CONFIG_SQL)
    op.execute(FUNCOES_SQL)
    for sql in _acl():
        op.execute(sql)
    op.execute(CRONOMETRO_SQL)
    op.execute(RESPONSAVEL_SQL)


_CRONOMETRO_ANTERIOR = """
CREATE OR REPLACE FUNCTION public.fn_cronometro_ligado(p_aluno uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT ac.ligado FROM public.aluno_cronometro ac WHERE ac.aluno_id = p_aluno),
    (SELECT lower(p.nome) IN ('survivor', 'mastermind', 'achiever', 'conqueror', 'daredevil')
       FROM public.aluno_perfil ap
       JOIN public.perfil p ON p.id = ap.perfil_id
      WHERE ap.aluno_id = p_aluno
      ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
      LIMIT 1),
    false
  );
$function$;
"""


def downgrade() -> None:
    # Volta o cronometro ao texto de antes e a `responsavel_registrar_cuidado` ao da `20261120_04`
    # (que so apaga momentos se a tabela existir), e so depois derruba o que depende da tabela.
    op.execute(_CRONOMETRO_ANTERIOR)
    anterior = Path(__file__).with_name("20261120_04_consentimento_cuidado.py")
    spec = importlib.util.spec_from_file_location("_cuidado_01", anterior)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    op.execute(modulo.FUNCOES_SQL)
    for assinatura in (*DO_CLIENTE, *INTERNAS):
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'aluno_momento_cuidado'")
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN ("
        "'cuidado_erros_seguidos', 'cuidado_minutos_sem_parar', 'cuidado_abandonos', "
        "'cuidado_intervalo_min', 'cuidado_duracao_min')"
    )
    # Momentos nao sao prova de consentimento: a tabela sai com a migration.
    op.execute("DROP TABLE IF EXISTS public.aluno_momento_cuidado")
