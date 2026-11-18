"""missao_desafio_criar grava o desafio por perfil numa transação

Terceira das quatro migrations dos desafios de lógica e cruzadinha como missão
(`docs/superpowers/specs/2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "O desenho >
Banco"). A `20261117_02` deixou o lugar do desafio e as travas; aqui fica quem escreve nele.

## `missao_desafio_criar(p_conteudo_id, p_desafio, p_resposta, p_perfis)`

`SECURITY DEFINER`, `SET search_path = public, pg_temp`, EXECUTE só para `authenticated`. O console
chama uma vez por proposta que o professor selecionou. Devolve `(missao_id, perfil_alvo,
desafio_grupo)`, uma linha por perfil.

**Posse antes de ler.** `NOT EXISTS` (nunca `NOT IN`) sobre o conteúdo, o tópico dele e
`app_classes_do_professor()`. Conteúdo de outra turma, inexistente ou quem não é professor: `42501`, sem
nada gravado. Só depois disso o título do conteúdo é lido.

**Validação, tudo `22023` com mensagem PT-BR**, para o console mostrar ao professor:

- perfis: pelo menos um, todos entre os 7 (minúsculas, sem espaço). Repetidos viram um, porque o índice
  único `(desafio_grupo, perfil_alvo)` recusaria a segunda linha;
- lógica (`p_resposta = {"aceitas": [...]}`): enunciado de 1 a 1000 caracteres, `formato` `curta` ou
  `multipla`, de 1 a 20 respostas aceitas com até 200 caracteres. Na `multipla`, de 2 a 8 alternativas
  diferentes, e cada resposta aceita precisa ser uma delas. Toda comparação da lógica (repetidas,
  alternativas iguais, aceita entre as alternativas) passa por `fn_missao_desafio_normalizar`:
  minúsculas, sem acento, espaços colapsados e aparados. "Dicionario" casa com "Dicionário", e as duas
  juntas como alternativas são recusadas. O gabarito guarda o texto da alternativa, não o que veio;
- cruzadinha (`p_resposta = {"palavras": {"<numero><h|v>": "..."}}`): grade de 2 a 40 linhas e colunas,
  4 a 10 palavras, cada uma com número, direção, linha e coluna contadas de 0, tamanho de pelo menos 2 e
  pista de até 200 caracteres. Cada palavra cabe na grade, tem o comprimento do `tamanho` e toda célula
  compartilhada recebe a mesma letra. A resposta traz exatamente as palavras da grade.

**Limite conhecido: a numeração da grade não é conferida.** A RPC não recusa o mesmo número em células
diferentes nem duas palavras na mesma direção encavaladas (uma dentro da outra, ou continuando a outra
sem casa vazia). Quem garante isso é a montagem por código (`montarCruzadinha`, Tarefa 5), que posiciona
as palavras; a IA não monta a grade.

**As letras da grade** saem de `fn_missao_desafio_letras`: maiúsculas, sem acento (`translate`, porque
`unaccent` não está instalada em produção, medido em 17/11) e só `A-Z0-9`. A tabela de acentos é a
mesma de `fn_missao_desafio_normalizar` (uma constante em Python), mas uma função não chama a outra: o
`lower` da normalização muda o que a grade aceita em dois caracteres, U+0130 (İ) e U+212A (sinal de
Kelvin), que passariam a valer I e K. Medido em 18/11 comparando as duas formas em todo o plano básico.
"Coração" ocupa 7 casas e "banco de dados" ocupa 12.

As três auxiliares não aparecem em índice, e o cliente não tem EXECUTE nelas; quem as chama é a RPC
(`SECURITY DEFINER`), e a Tarefa 4 fará o mesmo. O gabarito guarda a palavra como veio (aparada), para a Tarefa 4 comparar
a do aluno com ela pela mesma função.

O CHECK novo de recompensa não reprova linha antiga: em produção (17/11) `recompensa_tipo` só tem
`missao_concluida` e `missao_diaria_concluida`, e nenhuma missão tem desafio.

**O que o aluno lê é remontado campo a campo.** `missoes.desafio` nunca é o `p_desafio` cru: uma chave
a mais (uma "solucao", por exemplo) não chega à coluna que o aluno lê. O CHECK `missoes_desafio_forma`
continua sendo a última barreira.

**A escrita.** Um `desafio_grupo` novo, uma missão por perfil (`origem = 'ia'`, `aprovacao =
'aprovada'`, `escopo = 'aluno'`, `categoria = 'secundaria'`, `criterio = {"metrica": "desafio"}`,
`recompensa_tipo = 'desafio_' || tipo`, `criado_por = auth.uid()`) e a linha do gabarito. Título
`Desafio de lógica: <conteúdo>` ou `Cruzadinha: <conteúdo>`, cortado em 120 (o CHECK de `titulo`). A
descrição é fixa, sem a resposta.

**O sinal.** A guarda só deixa gravar `desafio` com `app.desafio_gravando = 'on'` e `current_user` fora
dos papéis de cliente. Dentro desta função `current_user` é o dono, e o e2e confere chamando como
`authenticated`. O sinal liga logo antes dos INSERTs e volta a vazio logo depois, e também no
`EXCEPTION` (que repassa o erro): ligado até o fim da transação, ele deixaria outra função do dono, mais
adiante na mesma transação, reescrever o desafio por UPDATE sem congelamento.

**Fora do log da IA.** O gatilho `trg_missoes_ia_log` (`20261102_20`, a única que o define) grava
`proposta` para toda missão `origem = 'ia'`. O desafio não passa pelo pedido nem pela decisão da IA, e
essas propostas ficariam sem decisão para sempre, baixando a taxa de aprovação (#151). O gatilho é
recriado com `WHEN (NEW.desafio IS NULL)`, por troca sobre o texto da `20261102_20`; a função não muda.
A Tarefa 8 ainda tira os desafios das leituras de `missoes` do painel da IA.

## Pendências da revisão da Tarefa 2

- **Recompensa presa ao desafio.** CHECK `missoes_desafio_recompensa`: missão comum não paga
  `desafio_logica` nem `desafio_cruzadinha`, e a missão-desafio paga `'desafio_' || tipo`. A guarda
  passa a congelar `recompensa_tipo` da missão-desafio no UPDATE, em silêncio como as outras colunas
  dela (troca por âncora sobre a guarda da `20261117_02`; a âncora é conferida na importação).
- **Um perfil por grupo.** Índice único parcial `(desafio_grupo, perfil_alvo) WHERE desafio_grupo IS
  NOT NULL`. Sem ele, o professor mudaria o perfil de uma linha para o da outra e o mesmo quebra-cabeça
  apareceria duas vezes para o mesmo aluno.
- **Missão-desafio tem perfil.** CHECK `missoes_desafio_tem_perfil` (`desafio IS NULL OR perfil_alvo
  IS NOT NULL`): o índice único não barra NULL, e o professor poderia pôr NULL por UPDATE.
- **`missao_desafio_tentativa.missao_id` `NOT NULL`**, com índice próprio (a policy do professor e o
  `ON DELETE CASCADE` procuram por ele). A tabela nasceu na `20261117_02` e está vazia.

## Downgrade

Devolve a guarda da `20261117_02` e o gatilho do log da `20261102_20`, e apaga a RPC, as três funções
auxiliares, os dois CHECKs, os dois índices e o `NOT NULL`.

Revision ID: 20261117_03
Revises: 20261117_02
Create Date: 2026-11-17
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261117_03"
down_revision = "20261117_02"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_17_03", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M17_02 = _modulo("20261117_02_desafio_na_missao.py")
M_ENTIDADE = _modulo("20261021_02_missoes_entidade.py")

PERFIS = M_ENTIDADE.PERFIS


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


def _lista(valores) -> str:
    return ", ".join(f"'{v}'" for v in valores)


# ------------------------------------------------------------------------- pendências da Tarefa 2
ESTRUTURA = """
-- A missao-desafio paga o premio do proprio tipo, e so' ela paga premio de desafio.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_recompensa;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_desafio_recompensa
  CHECK (CASE
    WHEN desafio IS NULL THEN recompensa_tipo NOT IN ('desafio_logica', 'desafio_cruzadinha')
    ELSE recompensa_tipo = 'desafio_' || (desafio->>'tipo')
  END);

-- Missao-desafio sempre tem perfil: com NULL ela apareceria para a turma toda, e em dobro para quem
-- tambem tem o perfil de outra linha do grupo. O indice unico abaixo nao barra NULL.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_tem_perfil;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_desafio_tem_perfil
  CHECK (desafio IS NULL OR perfil_alvo IS NOT NULL);

-- O mesmo quebra-cabeca uma vez por perfil.
CREATE UNIQUE INDEX IF NOT EXISTS missoes_desafio_grupo_perfil_uq
  ON public.missoes (desafio_grupo, perfil_alvo) WHERE desafio_grupo IS NOT NULL;

-- Tentativa sem missao nao tem turma: a policy do professor nao a alcancaria.
ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS missao_desafio_tentativa_missao_idx
  ON public.missao_desafio_tentativa (missao_id);
"""

# --------------------------------------------------------------------------------------- guarda
TROCAS_GUARDA = (
    (
        "        NEW.escopo := OLD.escopo;\n        NEW.classe_id := OLD.classe_id;\n",
        "        NEW.escopo := OLD.escopo;\n"
        "        NEW.classe_id := OLD.classe_id;\n"
        "        NEW.recompensa_tipo := OLD.recompensa_tipo;\n",
    ),
)


def guarda() -> str:
    """A guarda da `20261117_02` com a recompensa da missão-desafio congelada."""
    texto = M17_02.GUARDA
    for antes, depois in TROCAS_GUARDA:
        texto = _trocar(texto, antes, depois)
    return texto


# Calculada na importação: âncora que sumir derruba a migration antes de ela tocar no banco.
GUARDA = guarda()

# ----------------------------------------------------------------------------- log da IA (#151)
# O gatilho como a `20261102_20` o criou (a única que o define), do DROP até o fim do bloco `LOG`.
M20 = _modulo("20261102_20_missoes_sugeridas_pela_ia.py")
_INICIO_GATILHO_LOG = "DROP TRIGGER IF EXISTS trg_missoes_ia_log ON public.missoes;"
GATILHO_LOG_ANTES = M20.LOG[M20.LOG.index(_INICIO_GATILHO_LOG) :]
GATILHO_LOG = _trocar(
    GATILHO_LOG_ANTES,
    "  FOR EACH ROW EXECUTE FUNCTION public.fn_missoes_ia_log();",
    "  FOR EACH ROW\n"
    "  -- O desafio nao passa pelo pedido nem pela decisao da IA (20261117_03): a 'proposta' dele\n"
    "  -- ficaria sem decisao para sempre e baixaria a taxa de aprovacao.\n"
    "  WHEN (NEW.desafio IS NULL)\n"
    "  EXECUTE FUNCTION public.fn_missoes_ia_log();",
)

# ---------------------------------------------------------------------------------- auxiliares
# Sem acento por `translate`: `unaccent` nao existe em producao (17/11). Uma tabela so', nas duas
# funcoes abaixo.
ACENTOS_DE = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ"
ACENTOS_PARA = "aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY"
if len(ACENTOS_DE) != len(ACENTOS_PARA):
    raise RuntimeError("tabela de acentos desalinhada")

AUXILIARES = r"""
-- A forma de comparar texto da logica: minusculas, sem acento, espacos colapsados e aparados.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_normalizar(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT btrim(regexp_replace(lower(translate(p_texto, '__DE__', '__PARA__')), '\s+', ' ', 'g'))
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_normalizar(text) FROM PUBLIC, anon, authenticated;

-- As letras que a palavra ocupa na grade: maiusculas, sem acento, so' A-Z e 0-9. Nao chama a de cima:
-- o `lower` dela muda o resultado de dois caracteres (U+0130 e U+212A viram I e K), medido em 18/11.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_letras(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT regexp_replace(upper(translate(COALESCE(p_texto, ''), '__DE__', '__PARA__')), '[^A-Z0-9]', '', 'g')
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_letras(text) FROM PUBLIC, anon, authenticated;

-- Inteiro de um valor JSON: so' numero sem casa decimal; o resto vira NULL (nunca erro de cast).
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_inteiro(p jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT CASE WHEN jsonb_typeof(p) = 'number' AND (p #>> '{}') ~ '^-?[0-9]{1,6}$'
              THEN (p #>> '{}')::integer END
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_inteiro(jsonb) FROM PUBLIC, anon, authenticated;
""".replace("__DE__", ACENTOS_DE).replace("__PARA__", ACENTOS_PARA)

# -------------------------------------------------------------------------------------------- RPC
RPC = r"""
CREATE OR REPLACE FUNCTION public.missao_desafio_criar(
  p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis text[])
RETURNS TABLE (missao_id bigint, perfil_alvo text, desafio_grupo uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_classe          bigint;
  v_titulo_conteudo text;
  v_perfis          text[];
  v_invalido        text;
  v_tipo            text;
  v_publico         jsonb;
  v_gabarito        jsonb;
  v_titulo          text;
  v_descricao       text;
  v_grupo           uuid;
  v_perfil          text;
  -- logica
  v_enunciado       text;
  v_formato         text;
  v_alternativas    jsonb;
  v_aceitas         jsonb;
  v_fora            text;
  -- cruzadinha
  v_linhas          integer;
  v_colunas         integer;
  v_palavras        jsonb;
  v_respostas       jsonb;
  v_item            jsonb;
  v_numero          integer;
  v_direcao         text;
  v_linha           integer;
  v_coluna          integer;
  v_tamanho         integer;
  v_pista           text;
  v_chave           text;
  v_palavra         text;
  v_letras          text;
  v_i               integer;
  v_l               integer;
  v_c               integer;
  v_celula          text;
  v_publicas        jsonb := '[]'::jsonb;
  v_certas          jsonb := '{}'::jsonb;
  v_celulas         jsonb := '{}'::jsonb;
BEGIN
  -- Posse antes de ler. NOT EXISTS, e nao NOT IN: um NULL na lista faria o IF dar NULL e passar.
  IF NOT EXISTS (
       SELECT 1 FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
        WHERE c.id = p_conteudo_id
          AND t.classe_id IN (SELECT public.app_classes_do_professor())) THEN
    RAISE EXCEPTION 'Conteúdo não encontrado ou sem permissão para criar desafio.' USING ERRCODE = '42501';
  END IF;

  SELECT t.classe_id, btrim(c.titulo)
    INTO v_classe, v_titulo_conteudo
    FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
   WHERE c.id = p_conteudo_id;

  -- Perfis: minusculas, sem repeticao (o indice unico do grupo recusaria a segunda linha).
  SELECT array_agg(DISTINCT lower(btrim(p))) INTO v_perfis FROM unnest(p_perfis) AS p;
  IF v_perfis IS NULL OR cardinality(v_perfis) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um perfil para o desafio.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(p, '(vazio)') INTO v_invalido
    FROM unnest(v_perfis) AS p
   WHERE p IS NULL OR p NOT IN (__PERFIS__)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Perfil inválido: %. Use um de: __PERFIS_TEXTO__.', v_invalido USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_desafio) IS DISTINCT FROM 'object' OR jsonb_typeof(p_resposta) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'O desafio e a resposta precisam ser objetos JSON.' USING ERRCODE = '22023';
  END IF;
  v_tipo := p_desafio->>'tipo';

  IF v_tipo = 'logica' THEN
    v_enunciado := CASE WHEN jsonb_typeof(p_desafio->'enunciado') = 'string' THEN btrim(p_desafio->>'enunciado') END;
    IF v_enunciado IS NULL OR char_length(v_enunciado) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'O desafio de lógica precisa de um enunciado de até 1000 caracteres.' USING ERRCODE = '22023';
    END IF;
    v_formato := COALESCE(p_desafio->>'formato', '');
    IF v_formato NOT IN ('curta', 'multipla') THEN
      RAISE EXCEPTION 'O formato do desafio de lógica precisa ser curta ou multipla.' USING ERRCODE = '22023';
    END IF;

    -- As respostas aceitas: 1 a 20 textos, sem repetir a mesma forma.
    IF jsonb_typeof(p_resposta->'aceitas') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_resposta->'aceitas') NOT BETWEEN 1 AND 20
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_resposta->'aceitas') e
                   WHERE jsonb_typeof(e) <> 'string' OR char_length(btrim(e #>> '{}')) NOT BETWEEN 1 AND 200) THEN
      RAISE EXCEPTION 'A resposta precisa de 1 a 20 respostas aceitas, cada uma com até 200 caracteres.'
        USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(x.a ORDER BY x.ord) INTO v_aceitas
      FROM (SELECT DISTINCT ON (public.fn_missao_desafio_normalizar(e.v)) btrim(e.v) AS a, e.ord
              FROM jsonb_array_elements_text(p_resposta->'aceitas') WITH ORDINALITY AS e(v, ord)
             ORDER BY public.fn_missao_desafio_normalizar(e.v), e.ord) x;

    IF v_formato = 'multipla' THEN
      IF jsonb_typeof(p_desafio->'alternativas') IS DISTINCT FROM 'array'
         OR jsonb_array_length(p_desafio->'alternativas') NOT BETWEEN 2 AND 8
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_desafio->'alternativas') e
                     WHERE jsonb_typeof(e) <> 'string' OR char_length(btrim(e #>> '{}')) NOT BETWEEN 1 AND 200)
         OR (SELECT count(DISTINCT public.fn_missao_desafio_normalizar(a))
               FROM jsonb_array_elements_text(p_desafio->'alternativas') a)
            <> jsonb_array_length(p_desafio->'alternativas') THEN
        RAISE EXCEPTION 'A múltipla escolha precisa de 2 a 8 alternativas diferentes, cada uma com até 200 caracteres.'
          USING ERRCODE = '22023';
      END IF;
      SELECT jsonb_agg(btrim(a) ORDER BY ord) INTO v_alternativas
        FROM jsonb_array_elements_text(p_desafio->'alternativas') WITH ORDINALITY AS x(a, ord);

      SELECT r INTO v_fora
        FROM jsonb_array_elements_text(v_aceitas) r
       WHERE public.fn_missao_desafio_normalizar(r) NOT IN (
               SELECT public.fn_missao_desafio_normalizar(a) FROM jsonb_array_elements_text(v_alternativas) a)
       LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'A resposta aceita "%" não é uma das alternativas.', v_fora USING ERRCODE = '22023';
      END IF;
      -- O gabarito guarda o texto da alternativa, que e' o que o aluno vai mandar.
      SELECT jsonb_agg(a ORDER BY ord) INTO v_aceitas
        FROM jsonb_array_elements_text(v_alternativas) WITH ORDINALITY AS x(a, ord)
       WHERE public.fn_missao_desafio_normalizar(a) IN (
               SELECT public.fn_missao_desafio_normalizar(r) FROM jsonb_array_elements_text(v_aceitas) r);

      v_publico := jsonb_build_object('tipo', 'logica', 'enunciado', v_enunciado, 'formato', 'multipla',
                                      'alternativas', v_alternativas);
    ELSE
      v_publico := jsonb_build_object('tipo', 'logica', 'enunciado', v_enunciado, 'formato', 'curta');
    END IF;

    v_gabarito := jsonb_build_object('aceitas', v_aceitas);
    v_titulo := 'Desafio de lógica: ' || v_titulo_conteudo;
    v_descricao := 'Um desafio de lógica sobre o conteúdo que você estudou. Acerte para ganhar moedas e pontos.';

  ELSIF v_tipo = 'cruzadinha' THEN
    v_linhas := public.fn_missao_desafio_inteiro(p_desafio->'linhas');
    v_colunas := public.fn_missao_desafio_inteiro(p_desafio->'colunas');
    IF v_linhas IS NULL OR v_colunas IS NULL OR v_linhas NOT BETWEEN 2 AND 40 OR v_colunas NOT BETWEEN 2 AND 40 THEN
      RAISE EXCEPTION 'A grade precisa de 2 a 40 linhas e de 2 a 40 colunas.' USING ERRCODE = '22023';
    END IF;
    v_palavras := p_desafio->'palavras';
    IF jsonb_typeof(v_palavras) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'A cruzadinha precisa de uma lista de palavras.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_palavras) NOT BETWEEN 4 AND 10 THEN
      RAISE EXCEPTION 'A cruzadinha precisa de 4 a 10 palavras; vieram %.', jsonb_array_length(v_palavras)
        USING ERRCODE = '22023';
    END IF;
    v_respostas := p_resposta->'palavras';
    IF jsonb_typeof(v_respostas) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'A resposta da cruzadinha precisa trazer as palavras.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT e FROM jsonb_array_elements(v_palavras) e LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Cada palavra da cruzadinha precisa ser um objeto.' USING ERRCODE = '22023';
      END IF;
      v_numero  := public.fn_missao_desafio_inteiro(v_item->'numero');
      v_direcao := v_item->>'direcao';
      v_linha   := public.fn_missao_desafio_inteiro(v_item->'linha');
      v_coluna  := public.fn_missao_desafio_inteiro(v_item->'coluna');
      v_tamanho := public.fn_missao_desafio_inteiro(v_item->'tamanho');
      v_pista   := CASE WHEN jsonb_typeof(v_item->'pista') = 'string' THEN btrim(v_item->>'pista') END;
      IF v_numero IS NULL OR v_numero < 1 OR COALESCE(v_direcao, '') NOT IN ('h', 'v')
         OR v_linha IS NULL OR v_linha < 0 OR v_coluna IS NULL OR v_coluna < 0
         OR v_tamanho IS NULL OR v_tamanho < 2 THEN
        RAISE EXCEPTION 'Cada palavra precisa de número, direção (h ou v), linha, coluna e tamanho de pelo menos 2.'
          USING ERRCODE = '22023';
      END IF;
      IF v_pista IS NULL OR char_length(v_pista) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Cada palavra precisa de uma pista de até 200 caracteres.' USING ERRCODE = '22023';
      END IF;

      v_chave := v_numero::text || v_direcao;
      IF v_certas -> v_chave IS NOT NULL THEN
        RAISE EXCEPTION 'A palavra % aparece duas vezes.', v_chave USING ERRCODE = '22023';
      END IF;
      IF (v_direcao = 'h' AND (v_linha >= v_linhas OR v_coluna + v_tamanho > v_colunas))
         OR (v_direcao = 'v' AND (v_coluna >= v_colunas OR v_linha + v_tamanho > v_linhas)) THEN
        RAISE EXCEPTION 'A palavra % sai da grade.', v_chave USING ERRCODE = '22023';
      END IF;

      IF jsonb_typeof(v_respostas -> v_chave) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Falta a resposta da palavra %.', v_chave USING ERRCODE = '22023';
      END IF;
      v_palavra := btrim(v_respostas ->> v_chave);
      v_letras := public.fn_missao_desafio_letras(v_palavra);
      IF char_length(v_letras) <> v_tamanho THEN
        RAISE EXCEPTION 'A palavra % tem % letras, e a grade espera %.', v_chave, char_length(v_letras), v_tamanho
          USING ERRCODE = '22023';
      END IF;

      -- Cada celula recebe uma letra so'. A mensagem conta linha e coluna de 1, como o professor ve.
      FOR v_i IN 0 .. v_tamanho - 1 LOOP
        v_l := v_linha + CASE WHEN v_direcao = 'v' THEN v_i ELSE 0 END;
        v_c := v_coluna + CASE WHEN v_direcao = 'h' THEN v_i ELSE 0 END;
        v_celula := v_l::text || ',' || v_c::text;
        IF v_celulas ->> v_celula IS NOT NULL AND v_celulas ->> v_celula <> substr(v_letras, v_i + 1, 1) THEN
          RAISE EXCEPTION 'As palavras se cruzam com letras diferentes na linha %, coluna %.', v_l + 1, v_c + 1
            USING ERRCODE = '22023';
        END IF;
        v_celulas := v_celulas || jsonb_build_object(v_celula, substr(v_letras, v_i + 1, 1));
      END LOOP;

      v_publicas := v_publicas || jsonb_build_array(jsonb_build_object(
        'numero', v_numero, 'direcao', v_direcao, 'linha', v_linha, 'coluna', v_coluna,
        'tamanho', v_tamanho, 'pista', v_pista));
      v_certas := v_certas || jsonb_build_object(v_chave, v_palavra);
    END LOOP;

    SELECT k INTO v_fora FROM jsonb_object_keys(v_respostas) k WHERE v_certas -> k IS NULL LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'A resposta traz a palavra %, que não está na grade.', v_fora USING ERRCODE = '22023';
    END IF;

    v_publico := jsonb_build_object('tipo', 'cruzadinha', 'linhas', v_linhas, 'colunas', v_colunas,
                                    'palavras', v_publicas);
    v_gabarito := jsonb_build_object('palavras', v_certas);
    v_titulo := 'Cruzadinha: ' || v_titulo_conteudo;
    v_descricao := 'Uma cruzadinha com ' || jsonb_array_length(v_publicas)::text
                   || ' palavras do conteúdo que você estudou. Complete para ganhar moedas e pontos.';

  ELSE
    RAISE EXCEPTION 'Tipo de desafio desconhecido: %. Use logica ou cruzadinha.', COALESCE(v_tipo, '(vazio)')
      USING ERRCODE = '22023';
  END IF;

  -- O CHECK de `titulo` aceita ate' 120.
  v_titulo := rtrim(left(v_titulo, 120));
  v_grupo := gen_random_uuid();

  -- O sinal so' em volta da escrita, e de volta a vazio tambem no erro (20261117_02).
  BEGIN
    PERFORM set_config('app.desafio_gravando', 'on', true);
    FOREACH v_perfil IN ARRAY v_perfis LOOP
      INSERT INTO public.missoes
        (classe_id, origem, aprovacao, escopo, categoria, titulo, descricao, criterio, recompensa_tipo,
         perfil_alvo, ativa, criado_por, desafio, conteudo_id, desafio_grupo)
      VALUES
        (v_classe, 'ia', 'aprovada', 'aluno', 'secundaria', v_titulo, v_descricao,
         jsonb_build_object('metrica', 'desafio'), 'desafio_' || v_tipo,
         v_perfil, true, auth.uid(), v_publico, p_conteudo_id, v_grupo);
    END LOOP;
    INSERT INTO public.missao_desafio_gabarito (desafio_grupo, resposta) VALUES (v_grupo, v_gabarito);
    PERFORM set_config('app.desafio_gravando', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.desafio_gravando', '', true);
    RAISE;
  END;

  RETURN QUERY
    SELECT m.id, m.perfil_alvo, m.desafio_grupo
      FROM public.missoes m
     WHERE m.desafio_grupo = v_grupo
     ORDER BY m.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) TO authenticated;
""".replace("__PERFIS_TEXTO__", ", ".join(PERFIS)).replace("__PERFIS__", _lista(PERFIS))

# ------------------------------------------------------------------------------------- downgrade
DESFAZER = """
DROP FUNCTION IF EXISTS public.missao_desafio_criar(bigint, jsonb, jsonb, text[]);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_letras(text);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_normalizar(text);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_inteiro(jsonb);

DROP INDEX IF EXISTS public.missao_desafio_tentativa_missao_idx;
ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id DROP NOT NULL;
DROP INDEX IF EXISTS public.missoes_desafio_grupo_perfil_uq;
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_recompensa;
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_desafio_tem_perfil;
"""


def upgrade() -> None:
    op.execute(ESTRUTURA)
    op.execute(GUARDA)
    op.execute(GATILHO_LOG)
    op.execute(AUXILIARES)
    op.execute(RPC)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(M17_02.GUARDA)
    op.execute(GATILHO_LOG_ANTES)
    op.execute(DESFAZER)
    op.execute("NOTIFY pgrst, 'reload schema'")
