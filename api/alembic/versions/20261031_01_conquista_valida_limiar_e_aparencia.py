"""Conquista da turma: o banco recusa limiar ausente ou inválido e aparência fora da lista (#158)

## O que estava errado

`conquista_da_turma_salvar` (`20261016_02`, reescrita em `20261017_09`) conferia só o NOME da métrica.
O limiar e a aparência eram validados apenas no console (`criterio.ts`, `aparencia.ts`), e quem chama a
RPC direto passava por cima dos dois:

- **limiar ausente** destrava para a turma inteira no primeiro evento: o avaliador
  (`fn_avaliar_metrica`, `20261021_03`) faz `COALESCE((criterio->>'minimo')::int, 0)` e compara com
  `>=`, então o alvo vira zero e toda contagem o atinge;
- **limiar que não é inteiro** (`"cinco"`, `5.5`) estoura o `::int` DENTRO do gatilho de
  `eventos_aluno`, que roda a cada evento de cada aluno da turma. A exceção aborta a transação de quem
  gravou o evento: o aluno conclui a atividade e o registro dela não entra;
- **cor livre** passava, e a issue proíbe cor fora da paleta (contraste AAA).

## O que muda

- `fn_conquista_criterio_erro(jsonb)`: devolve a frase do primeiro problema do critério, ou `NULL`.
  Para cada métrica, confere a chave que o avaliador lê, no formato do cast que ele faz (inteiro para
  `::int`, número para `::numeric`) e com o mínimo que faz sentido (≥ 1; percentual até 100;
  `topicos_visitados` aceita `"todos"`). `evento_medalha` não tem limiar. A aparência, quando vem,
  tem ícone da lista e cor da paleta ou de uma das sete cores-assinatura.
- CHECK `conquistas_criterio_valido`: a mesma função, para TODO escritor (RPC, API como dona, SQL
  manual). É a barreira que protege o gatilho; a RPC é só a mensagem legível. Mesmo raciocínio do
  `conquistas_metrica_suportada` da `20260909_01`: a linha que quebraria o gatilho não chega a existir.
- `conquista_da_turma_salvar`: chama a função antes de gravar (22023 com a frase) e recusa
  `evento_medalha`, que só a apuração do evento cria.

## Por que o CHECK entra validado

Conferido em produção em 31/10, só leitura: as 27 conquistas são todas globais (nenhuma de turma ainda),
nenhuma tem `aparencia`, e todas têm o limiar da própria métrica, inteiro e positivo. O `ADD
CONSTRAINT` valida as linhas existentes; se alguma tivesse escapado, a migration falharia aqui, em vez
de o gatilho falhar depois no meio do estudo de um aluno.

Revision ID: 20261031_01
Revises: 20261030_02
Create Date: 2026-10-31
"""

from alembic import op

revision = "20261031_01"
down_revision = "20261030_02"
branch_labels = None
depends_on = None

VALIDADOR = r"""
CREATE OR REPLACE FUNCTION public.fn_conquista_criterio_erro(p_criterio jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_metrica text := p_criterio ->> 'metrica';
  v_ap      jsonb := p_criterio -> 'aparencia';
  -- Inteiro: o avaliador faz `::int`. Até 9 dígitos, para nunca estourar o int4.
  c_inteiro CONSTANT text := '^[0-9]{1,9}$';
  -- Número: o avaliador faz `::numeric`.
  c_numero  CONSTANT text := '^[0-9]{1,9}(\.[0-9]{1,4})?$';
BEGIN
  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object' THEN
    RETURN 'O critério precisa ser um objeto.';
  END IF;

  -- `minimo`: as quatro contagens e as atividades rápidas.
  IF v_metrica IN ('eventos_totais', 'eventos_do_tipo', 'atividades_concluidas', 'topicos_concluidos', 'atividades_rapidas')
     AND (coalesce(p_criterio ->> 'minimo', '') !~ c_inteiro OR (p_criterio ->> 'minimo')::int < 1) THEN
    RETURN 'Informe o mínimo como um número inteiro a partir de 1.';
  END IF;

  IF v_metrica = 'eventos_do_tipo'
     AND (jsonb_typeof(p_criterio -> 'evento') IS DISTINCT FROM 'string'
          OR length(btrim(p_criterio ->> 'evento')) NOT BETWEEN 1 AND 80) THEN
    RETURN 'Informe o tipo de evento que conta.';
  END IF;

  IF v_metrica = 'topicos_visitados'
     AND p_criterio ->> 'visitados' IS DISTINCT FROM 'todos'
     AND (coalesce(p_criterio ->> 'visitados', '') !~ c_inteiro OR (p_criterio ->> 'visitados')::int < 1) THEN
    RETURN 'Informe quantos tópicos (a partir de 1) ou "todos".';
  END IF;

  IF v_metrica = 'dias_seguidos'
     AND (coalesce(p_criterio ->> 'dias_seguidos', '') !~ c_inteiro OR (p_criterio ->> 'dias_seguidos')::int < 1) THEN
    RETURN 'Informe os dias seguidos como um número inteiro a partir de 1.';
  END IF;

  IF v_metrica = 'minutos_totais'
     AND (coalesce(p_criterio ->> 'minutos', '') !~ c_numero OR (p_criterio ->> 'minutos')::numeric <= 0) THEN
    RETURN 'Informe os minutos como um número maior que zero.';
  END IF;

  IF v_metrica IN ('acertos_percentual', 'trilha_percentual')
     AND (coalesce(p_criterio ->> 'percentual', '') !~ c_numero
          OR (p_criterio ->> 'percentual')::numeric <= 0 OR (p_criterio ->> 'percentual')::numeric > 100) THEN
    RETURN 'Informe o percentual entre 1 e 100.';
  END IF;

  IF v_metrica IN ('atividade_rapida', 'atividades_rapidas')
     AND (coalesce(p_criterio ->> 'max_tempo', '') !~ c_numero OR (p_criterio ->> 'max_tempo')::numeric <= 0) THEN
    RETURN 'Informe o tempo máximo em minutos, maior que zero.';
  END IF;

  -- Aparência é opcional; quando vem, é da lista fechada do console (`aparencia.ts`).
  IF v_ap IS NOT NULL THEN
    IF jsonb_typeof(v_ap) <> 'object'
       OR coalesce(v_ap ->> 'icone', '') NOT IN
          ('trofeu', 'estrela', 'chama', 'alvo', 'raio', 'livro', 'medalha', 'foguete') THEN
      RETURN 'Ícone inválido.';
    END IF;
    -- A paleta validada e as sete cores-assinatura (`perfilCores.ts`, `brainHex.ts`).
    IF lower(coalesce(v_ap ->> 'cor', '')) NOT IN
       ('#9b5de5', '#4fd1c5', '#e0b34d', '#e2574c', '#5fd99a', '#6fb3e0',
        '#17a398', '#4e5a66', '#d7263d', '#5b3fd9', '#1e4fd6', '#f4623a', '#c9a227') THEN
      RETURN 'Cor fora da paleta.';
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conquista_criterio_erro(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conquista_criterio_erro(jsonb) TO authenticated, service_role;
"""

CHECK_SQL = r"""
ALTER TABLE public.conquistas
  ADD CONSTRAINT conquistas_criterio_valido CHECK (public.fn_conquista_criterio_erro(criterio) IS NULL);
"""

# `20261017_09` com a validação do critério; o resto do corpo é o mesmo.
SALVAR = r"""
CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(
  p_classe_id bigint,
  p_id        bigint,
  p_nome      text,
  p_descricao text,
  p_escopo    text,
  p_perfil_alvo text,
  p_criterio  jsonb,
  p_pontos    integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_max_pontos integer;
  v_teto      integer;
  v_existentes integer;
  v_categoria text;
  v_id        bigint;
  v_erro_criterio text;
BEGIN
  IF v_professor IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 3 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_descricao) > 140 THEN
    RAISE EXCEPTION 'A descrição passa de 140 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_escopo NOT IN ('comum', 'perfil') THEN
    RAISE EXCEPTION 'Escopo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'perfil' AND coalesce(p_perfil_alvo, '') NOT IN
     ('seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'comum' AND p_perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista geral não tem perfil.' USING ERRCODE = '22023';
  END IF;

  -- `evento_medalha` é suportada pela tabela, mas só a apuração do evento a cria (20261017_09).
  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object'
     OR NOT public.fn_conquista_metrica_suportada(p_criterio ->> 'metrica')
     OR p_criterio ->> 'metrica' = 'evento_medalha' THEN
    RAISE EXCEPTION 'Métrica não suportada.' USING ERRCODE = '22023';
  END IF;
  -- O limiar e a aparência (#158). O CHECK `conquistas_criterio_valido` recusaria do mesmo
  -- jeito, mas com 23514 e o nome da constraint; aqui o professor lê a frase.
  v_erro_criterio := public.fn_conquista_criterio_erro(p_criterio);
  IF v_erro_criterio IS NOT NULL THEN
    RAISE EXCEPTION '%', v_erro_criterio USING ERRCODE = '22023';
  END IF;

  v_max_pontos := coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'),
    100
  );
  IF p_pontos IS NULL OR p_pontos < 0 OR p_pontos > v_max_pontos THEN
    RAISE EXCEPTION 'Os pontos vão de 0 a %.', v_max_pontos USING ERRCODE = '22023';
  END IF;

  v_categoria := CASE
    WHEN p_escopo = 'perfil' THEN 'perfil_brainhex'
    WHEN p_criterio ->> 'metrica' IN ('dias_seguidos', 'minutos_totais') THEN 'habito'
    WHEN p_criterio ->> 'metrica' IN ('acertos_percentual', 'atividade_rapida') THEN 'desempenho'
    ELSE 'progresso'
  END;

  IF p_id IS NULL THEN
    -- Trava por turma para duas criações simultâneas não furarem o teto.
    PERFORM pg_advisory_xact_lock(hashtext('conquista_da_turma:' || p_classe_id::text));
    v_teto := coalesce(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
         FROM public.app_config WHERE chave = 'conquistas_por_turma_max'),
      20
    );
    SELECT count(*) INTO v_existentes FROM public.conquistas WHERE classe_id = p_classe_id AND escopo <> 'evento';
    IF v_existentes >= v_teto THEN
      RAISE EXCEPTION 'Esta turma já tem % conquistas (o teto).', v_teto USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.conquistas (nome, descricao, categoria, escopo, perfil_alvo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (v_nome, nullif(v_descricao, ''), v_categoria, p_escopo, p_perfil_alvo, p_criterio, p_pontos, p_classe_id, v_professor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.conquistas
       SET nome = v_nome, descricao = nullif(v_descricao, ''), categoria = v_categoria, escopo = p_escopo,
           perfil_alvo = p_perfil_alvo, criterio = p_criterio, pontos_recompensa = p_pontos
     WHERE id = p_id AND classe_id = p_classe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conquista não encontrada nesta turma.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) TO authenticated;
"""

# Volta ao corpo de `20261017_09`.
SALVAR_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(
  p_classe_id bigint,
  p_id        bigint,
  p_nome      text,
  p_descricao text,
  p_escopo    text,
  p_perfil_alvo text,
  p_criterio  jsonb,
  p_pontos    integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_max_pontos integer;
  v_teto      integer;
  v_existentes integer;
  v_categoria text;
  v_id        bigint;
BEGIN
  IF v_professor IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 3 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_descricao) > 140 THEN
    RAISE EXCEPTION 'A descrição passa de 140 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_escopo NOT IN ('comum', 'perfil') THEN
    RAISE EXCEPTION 'Escopo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'perfil' AND coalesce(p_perfil_alvo, '') NOT IN
     ('seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'comum' AND p_perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista geral não tem perfil.' USING ERRCODE = '22023';
  END IF;

  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object'
     OR NOT public.fn_conquista_metrica_suportada(p_criterio ->> 'metrica') THEN
    RAISE EXCEPTION 'Métrica não suportada.' USING ERRCODE = '22023';
  END IF;

  v_max_pontos := coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'),
    100
  );
  IF p_pontos IS NULL OR p_pontos < 0 OR p_pontos > v_max_pontos THEN
    RAISE EXCEPTION 'Os pontos vão de 0 a %.', v_max_pontos USING ERRCODE = '22023';
  END IF;

  v_categoria := CASE
    WHEN p_escopo = 'perfil' THEN 'perfil_brainhex'
    WHEN p_criterio ->> 'metrica' IN ('dias_seguidos', 'minutos_totais') THEN 'habito'
    WHEN p_criterio ->> 'metrica' IN ('acertos_percentual', 'atividade_rapida') THEN 'desempenho'
    ELSE 'progresso'
  END;

  IF p_id IS NULL THEN
    -- Trava por turma para duas criações simultâneas não furarem o teto.
    PERFORM pg_advisory_xact_lock(hashtext('conquista_da_turma:' || p_classe_id::text));
    v_teto := coalesce(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
         FROM public.app_config WHERE chave = 'conquistas_por_turma_max'),
      20
    );
    SELECT count(*) INTO v_existentes FROM public.conquistas WHERE classe_id = p_classe_id AND escopo <> 'evento';
    IF v_existentes >= v_teto THEN
      RAISE EXCEPTION 'Esta turma já tem % conquistas (o teto).', v_teto USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.conquistas (nome, descricao, categoria, escopo, perfil_alvo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (v_nome, nullif(v_descricao, ''), v_categoria, p_escopo, p_perfil_alvo, p_criterio, p_pontos, p_classe_id, v_professor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.conquistas
       SET nome = v_nome, descricao = nullif(v_descricao, ''), categoria = v_categoria, escopo = p_escopo,
           perfil_alvo = p_perfil_alvo, criterio = p_criterio, pontos_recompensa = p_pontos
     WHERE id = p_id AND classe_id = p_classe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conquista não encontrada nesta turma.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) TO authenticated;
"""


def upgrade() -> None:
    op.execute(VALIDADOR)
    op.execute(CHECK_SQL)
    op.execute(SALVAR)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(SALVAR_ANTERIOR)
    op.execute("ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_criterio_valido")
    op.execute("DROP FUNCTION IF EXISTS public.fn_conquista_criterio_erro(jsonb)")
    op.execute("NOTIFY pgrst, 'reload schema'")
