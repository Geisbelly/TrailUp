"""missao_desafio_responder corrige, limita e paga uma vez por desafio

Quarta das quatro migrations dos desafios de lógica e cruzadinha como missão
(`docs/superpowers/specs/2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "O desenho >
Banco"). A `20261117_02` deixou o gabarito e as tentativas, e a `20261117_03` deixou quem cria. Aqui
fica quem corrige e paga.

## `missao_desafio_responder(p_missao_id, p_resposta)`

`RETURNS jsonb`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, EXECUTE só para
`authenticated`. O app do aluno chama ao "Conferir".

- Lógica: `p_resposta = {"resposta": "<texto>"}`, de 1 a 1000 caracteres.
- Cruzadinha: `p_resposta = {"palavras": {"1h": "<texto>", ...}}`, com até 20 chaves e cada valor com
  até 100 caracteres. Chave que a grade não tem é ignorada, e palavra ausente ou que não é texto conta
  como errada.
- Forma errada: `22023`, sem gravar nada e sem contar no limite (não revela nada do gabarito).

Retorno: `{"acertou", "ja_concluida", "palavras_certas", "palavras_total"}`. As duas últimas são `null`
na lógica. **O gabarito nunca volta**: na cruzadinha só a contagem, nunca quais palavras.

### Acesso (`42501`; de 1 a 3, a mesma mensagem para "não existe" e "não é seu")

1. Sessão com `auth.uid()`.
2. A linha chamada é uma missão-desafio `ativa`, com `aprovacao IN ('nao_requer', 'aprovada')`, dentro
   da janela (`janela_inicio`/`janela_fim`, como o avaliador de missões), numa turma do aluno
   (`app_classes_do_aluno()`).
3. **A própria linha chamada** tem `perfil_alvo` entre os perfis representativos do aluno, e não só o
   ativo. É o achado 4 da spec: o app usa o perfil ativo local e o banco não discorda dele quando o aluno
   troca de perfil. A conclusão e o prêmio ficam na linha do perfil do aluno; o "já resolvido" continua
   pelo grupo.
   - A regra de representativo **não é reescrita aqui**. `fn_perfil_da_missao` (a última definição é
     a `20261111_01`) já não tem CTE própria: ela chama `app_perfis_representativos(aluno)`, a regra
     única do vetor que a `20261111_01` extraiu (ordem por afinidade e nome; afinidade ≥ 20, ou > 0
     entre os 2 primeiros). A RPC chama a mesma função, sem a parte do "ativo primeiro" de
     `fn_perfil_da_missao`. Nenhum helper novo foi preciso. Ela é `SECURITY INVOKER` e, chamada daqui,
     lê `aluno_perfil` com o dono. Aluno sem `aluno_perfil` não tem representativo e é recusado.
4. **Trava do estudo (#13):** turma retida (`estudo_personalizacao_retida`, a regra de
   `estudo_coorte_retem`, `20261102_05`) recebe `personalizacao_retida` (`42501`). O desafio é intervenção
   da IA por perfil, como o material personalizado.
5. **Visibilidade do tópico:** o conteúdo do desafio precisa estar num tópico liberado
   (`app_topico_liberado`). Rascunho ou agendado que não abriu recebem `topico_nao_publicado` (`42501`),
   o mesmo portão e o mesmo erro de `20261110_11` (CLAUDE.md: "RPC DEFINER nova que lê material por id
   precisa do mesmo portão").

Os itens 4 e 5 vêm antes da trava e não gravam tentativa.

### O que o aluno lê de `missoes`

A policy `RESTRICTIVE` de SELECT `missoes_desafio_visivel_sel` (`authenticated`) compõe com as
permissivas (`missoes_aluno_sel`, `missoes_professor_all`) sem reescrevê-las:

- `conteudo_id` fora de `app_conteudos_ocultos_para_mim()`, no molde `<> ALL (ARRAY(...))` da
  `20261110_10`. A lista já exclui as turmas em que quem lê é o professor, e `coalesce(..., true)` deixa
  passar a missão sem conteúdo (toda missão comum, pelo CHECK `missoes_desafio_colunas_juntas`);
- e, para o desafio, a turma fora de `app_classes_retidas_do_aluno()` (o molde da `20261102_05`). O
  helper só olha as turmas em que quem lê está matriculado, então o professor dono nunca cai nele. Missão
  comum não é retida: a trava cobre o que a IA gera para o aluno.

`service_role` e `postgres` ignoram RLS. O índice `missoes_conteudo_idx (conteudo_id) WHERE conteudo_id IS
NOT NULL` serve à cascata da FK de `conteudos` (o de `(classe_id, conteudo_id)` da `_02` começa pela turma).

### Trava, limite e "uma vez por desafio"

- **Trava** `pg_advisory_xact_lock(hashtextextended(aluno || grupo, 0))`, logo depois do acesso. É de
  transação, então vale pelo pooler (CLAUDE.md, "lock de sessão pela 6543"). Duas chamadas do mesmo
  aluno no mesmo grupo, por linhas iguais ou diferentes, correm uma depois da outra. Cada comando da
  função tira um retrato novo (`READ COMMITTED`), então a segunda vê o que a primeira gravou.
- **Limite**: 20 tentativas por hora por `(aluno, grupo)` (`LIMITE_POR_HORA`), contadas em
  `missao_desafio_tentativa` com `criado_em > now() - interval '1 hour'`. A 21ª levanta `P0001` com a
  mensagem `limite_de_tentativas` e não grava nada. A conta vem **depois** da trava: antes dela, duas
  chamadas paralelas com 19 tentativas passariam as duas.
- **Toda chamada que passa do acesso e do limite grava uma tentativa**, inclusive a que chega com o
  desafio já resolvido. A tentativa é a métrica de engajamento, e sem isso o limite não freia quem
  continua chutando a cruzadinha depois de pagar.
- **`ja_concluida`: a fonte é a tentativa com `acertou`.** O desafio está resolvido quando existe
  tentativa do aluno no grupo (`desafio_grupo`, não a linha) com `acertou = true`, lida dentro da trava.
  Por que essa, e não `missao_aluno` nem o prêmio em `eventos_aluno`:
  - **sobrevive ao DELETE da linha.** `missao_aluno` e o prêmio apontam para uma linha só
    (`missao_id`, `missao:<id>`). Se o professor apagasse a linha pela qual o aluno resolveu,
    `missao_aluno` sairia em cascata, e o aluno receberia de novo pela linha irmã. A tentativa guarda o
    grupo na própria linha e, com a FK abaixo, fica quando a missão sai;
  - só esta RPC grava tentativa (nenhuma policy de escrita, `20261117_02`), e ela grava a tentativa
    certa e o prêmio **na mesma transação**: a primeira tentativa com `acertou` do grupo é a que paga.
    Se o prêmio falhar, a tentativa volta junto;
  - o `ON CONFLICT ... WHERE status <> 'concluida'` de `missao_aluno` continua, como defesa da linha.
    Ele só deixaria de pagar se a linha já estivesse concluída sem tentativa certa no grupo, e nada mais
    conclui missão-desafio: o laço de eventos e o de item ignoram `desafio IS NOT NULL` (`20261117_02`),
    o de minutos só lê `minutos_no_dia`, o da guilda só `escopo = 'guilda'` (que o CHECK proíbe no
    desafio), e `missao_aluno` não tem gatilho na cadeia. Nesse caso impossível, o lado errado seria não
    pagar, nunca pagar duas vezes.

### A tentativa não sai com a missão

A FK `missao_desafio_tentativa.missao_id` passa de `ON DELETE CASCADE` (`20261117_02`) para
`ON DELETE SET NULL`, e a coluna perde o `NOT NULL` que a `20261117_03` pôs. Isso desfaz a decisão da
`_03` **de propósito**: ela queria que a tentativa sempre tivesse turma para a policy do professor, mas a
tentativa é a prova do pagamento único e precisa ficar. O índice `missao_desafio_tentativa_missao_idx`
fica.

- O limite por hora conta pelo grupo, então passa a contar também as tentativas da linha apagada, que é
  o desejado: apagar uma linha não devolve tentativas a ninguém.
- **A policy do professor passa a ligar pelo grupo** (`missao_desafio_tentativa_professor_sel`): existe
  missão do mesmo `desafio_grupo` numa turma dele. Pela missão, a tentativa da linha apagada sumiria para
  ele enquanto as outras linhas do grupo continuam no ar. O grupo não se forja: só a RPC de criação o
  grava, a guarda o congela no UPDATE e o CHECK `missoes_desafio_colunas_juntas` o proíbe em missão
  comum. Com o grupo inteiro apagado, a tentativa fica invisível ao professor, como o desafio e o
  gabarito.
- **Retenção:** `retencao_politica` tem a tentativa como `vida_da_conta` pela coluna `aluno_id`
  (`20261117_02`), que não muda: ela sai com a conta pela FK de `alunos`. Só o `motivo`, que dizia
  "ou com a missão pela FK", é reescrito.

### Isolamento

A trava assume `READ COMMITTED`, que é o do PostgREST: depois de esperar a trava, o comando seguinte vê
o que a outra chamada gravou. Em `REPEATABLE READ` a segunda chamada leria o retrato de antes. Quem chama
sem `auth.uid()`, como `service_role`, cai em `42501`.

### Comparação

- **Lógica:** `fn_missao_desafio_comparavel(texto, curta)` dos dois lados: a normalização da
  `20261117_03` (`fn_missao_desafio_normalizar`: minúsculas, sem acento por `translate`, espaços
  colapsados e aparados) e, na resposta curta, a vírgula entre dígitos vira ponto ("3,5" = "3.5",
  "1,2,3" = "1.2.3"). Na múltipla a vírgula fica, porque o app manda o texto da alternativa. Acerta
  quem casa com alguma das `aceitas`.
- **Cruzadinha:** `fn_missao_desafio_letras` (`20261117_03`), a mesma que montou a grade, dos dois
  lados: "CORAÇÃO" = "coracao", "BANCO DE DADOS" = "bancodedados". O gabarito guarda a palavra como o
  professor mandou (aparada). Acerta quem acerta todas.

`fn_missao_desafio_comparavel` é auxiliar nova, sem EXECUTE para o cliente (não está em índice).

### Acertou e ainda não estava resolvido

1. `missao_aluno` da linha chamada vira `concluida` (`INSERT ... ON CONFLICT (aluno_id, missao_id) DO
   UPDATE`, com `progresso = 100` e `concluida_em = now()`).
2. Só se a linha virou agora: o prêmio em `eventos_aluno` com `classe_id` da missão, `tipo =
   recompensa_tipo` (`desafio_logica` ou `desafio_cruzadinha`, preso ao tipo pelo CHECK da
   `20261117_03`), `referencia = 'missao:<id>'` da linha resolvida e `valor = 0` (o gatilho de valor
   resolve). O sinal `app.missao_premiando` liga logo antes e volta a vazio logo depois, e também no
   `EXCEPTION`, que repassa o erro (`20261117_01`). O sinal também faz o laço de missões do gatilho de
   eventos pular este INSERT. A recusa de prêmio do cliente deixa passar porque `current_user` aqui é
   o dono.

## Downgrade

Apaga a RPC, a auxiliar, a policy restritiva de `missoes` e o índice, e devolve a tentativa à `20261117_03`: a policy do professor pela missão, o
`motivo` da retenção, a FK `ON DELETE CASCADE` e o `NOT NULL`. As tentativas de linha apagada
(`missao_id` nulo) saem antes, porque o `NOT NULL` não voltaria com elas, e com a regra de antes já
teriam saído em cascata.

Revision ID: 20261117_04
Revises: 20261117_03
Create Date: 2026-11-18
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261117_04"
down_revision = "20261117_03"
branch_labels = None
depends_on = None

LIMITE_POR_HORA = 20
# Teto da resposta da cruzadinha: a grade tem no máximo 10 palavras (20261117_03).
PALAVRAS_MAX = 20
PALAVRA_MAX_CARACTERES = 100


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_17_04", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M17_02 = _modulo("20261117_02_desafio_na_missao.py")

# A policy do professor como a `20261117_02` a criou (a única que a define), para o downgrade.
_POLICY_PROFESSOR = re.search(
    r"DROP POLICY IF EXISTS missao_desafio_tentativa_professor_sel .*?\)\);\n", M17_02.TABELAS, re.S
)
if _POLICY_PROFESSOR is None:
    raise RuntimeError("a policy do professor sobre a tentativa sumiu da 20261117_02")
POLICY_PROFESSOR_ANTES = _POLICY_PROFESSOR.group(0)

_MOTIVO_ANTES = "tentativas de desafio de missao; sai com a conta ou com a missao pela FK"
_MOTIVO = "tentativas de desafio de missao; sai com a conta (fica quando a missao sai: prova do premio unico)"
if M17_02.RETENCAO.count(_MOTIVO_ANTES) != 1:
    raise RuntimeError("o motivo da retenção da tentativa mudou na 20261117_02")

# O que o aluno le de `missoes`: sem desafio de topico oculto e sem desafio de turma retida.
POLICY_MISSOES = "missoes_desafio_visivel_sel"
VISIBILIDADE = f"""
-- Restritiva: so' estreita as permissivas (`missoes_aluno_sel`, `missoes_professor_all`). Missao comum
-- passa nos dois ramos (sem conteudo e sem desafio); o professor dono tambem (nenhum dos helpers o inclui).
DROP POLICY IF EXISTS {POLICY_MISSOES} ON public.missoes;
CREATE POLICY {POLICY_MISSOES} ON public.missoes
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    -- Topico em rascunho ou agendado (20261110_10). A lista ja' exclui as turmas do professor.
    coalesce(conteudo_id <> ALL (ARRAY(SELECT public.app_conteudos_ocultos_para_mim())), true)
    -- Trava do estudo (#13, 20261102_05): o desafio e' intervencao da IA por perfil.
    -- O helper so' lista turma em que quem le' esta' matriculado; o ramo do professor fica, como no molde
    -- da 20261102_05, porque nada impede o professor de estar matriculado na propria turma.
    AND (desafio IS NULL
         OR classe_id IN (SELECT public.app_classes_do_professor())
         OR NOT (classe_id IN (SELECT public.app_classes_retidas_do_aluno())))
  );
COMMENT ON POLICY {POLICY_MISSOES} ON public.missoes IS
  'Desafio de topico oculto (20261110_10) ou de turma retida pelo estudo (20261102_05) nao chega ao aluno (20261117_04).';

-- A cascata de `missoes.conteudo_id` (ON DELETE CASCADE) procura por ele.
CREATE INDEX IF NOT EXISTS missoes_conteudo_idx ON public.missoes (conteudo_id) WHERE conteudo_id IS NOT NULL;
"""

SEM_VISIBILIDADE = f"""
DROP POLICY IF EXISTS {POLICY_MISSOES} ON public.missoes;
DROP INDEX IF EXISTS public.missoes_conteudo_idx;
"""

# A tentativa e' a prova do pagamento unico: fica quando a missao sai (desfaz o NOT NULL da 20261117_03).
TENTATIVA = f"""
ALTER TABLE public.missao_desafio_tentativa DROP CONSTRAINT IF EXISTS missao_desafio_tentativa_missao_id_fkey;
ALTER TABLE public.missao_desafio_tentativa ADD CONSTRAINT missao_desafio_tentativa_missao_id_fkey
  FOREIGN KEY (missao_id) REFERENCES public.missoes(id) ON DELETE SET NULL;
ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id DROP NOT NULL;

-- O professor le pelo grupo: a tentativa da linha apagada continua dele enquanto o grupo tiver linha.
DROP POLICY IF EXISTS missao_desafio_tentativa_professor_sel ON public.missao_desafio_tentativa;
CREATE POLICY missao_desafio_tentativa_professor_sel ON public.missao_desafio_tentativa
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.missoes m
     WHERE m.desafio_grupo = missao_desafio_tentativa.desafio_grupo
       AND m.classe_id IN (SELECT public.app_classes_do_professor())
  ));

UPDATE public.retencao_politica SET motivo = '{_MOTIVO}'
 WHERE tabela = 'missao_desafio_tentativa' AND motivo = '{_MOTIVO_ANTES}';
"""

TENTATIVA_ANTES = f"""
UPDATE public.retencao_politica SET motivo = '{_MOTIVO_ANTES}'
 WHERE tabela = 'missao_desafio_tentativa' AND motivo = '{_MOTIVO}';
{POLICY_PROFESSOR_ANTES}
-- Com a regra de antes, a tentativa de linha apagada ja' teria saido em cascata.
DELETE FROM public.missao_desafio_tentativa WHERE missao_id IS NULL;
ALTER TABLE public.missao_desafio_tentativa DROP CONSTRAINT IF EXISTS missao_desafio_tentativa_missao_id_fkey;
ALTER TABLE public.missao_desafio_tentativa ADD CONSTRAINT missao_desafio_tentativa_missao_id_fkey
  FOREIGN KEY (missao_id) REFERENCES public.missoes(id) ON DELETE CASCADE;
ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id SET NOT NULL;
"""

AUXILIARES = r"""
-- Como a logica compara (20261117_04): a normalizacao da 20261117_03 e, na resposta curta, virgula
-- entre digitos vira ponto. A mesma forma nos dois lados, aluno e gabarito.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_comparavel(p_texto text, p_curta boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT CASE WHEN p_curta
              THEN regexp_replace(public.fn_missao_desafio_normalizar(p_texto), '([0-9]),(?=[0-9])', '\1.', 'g')
              ELSE public.fn_missao_desafio_normalizar(p_texto) END
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_comparavel(text, boolean) FROM PUBLIC, anon, authenticated;
"""

RPC = r"""
CREATE OR REPLACE FUNCTION public.missao_desafio_responder(p_missao_id bigint, p_resposta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_aluno         uuid := auth.uid();
  v_missao        record;
  v_grupo         uuid;
  v_tipo          text;
  v_gabarito      jsonb;
  v_texto         text;
  v_palavras      jsonb;
  v_curta         boolean;
  v_acertou       boolean;
  v_ja_concluida  boolean;
  v_certas        integer;
  v_total         integer;
  v_mudou         integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'Desafio não encontrado ou sem acesso.' USING ERRCODE = '42501';
  END IF;

  -- Acesso: a linha chamada no ar, numa turma do aluno, e com um perfil representativo dele. A regra
  -- do vetor e' a de `fn_perfil_da_missao` (20261111_01), sem o ativo.
  SELECT m.id, m.classe_id, m.conteudo_id, m.desafio, m.desafio_grupo, m.recompensa_tipo
    INTO v_missao
    FROM public.missoes m
   WHERE m.id = p_missao_id
     AND m.desafio IS NOT NULL
     AND m.ativa
     AND m.aprovacao IN ('nao_requer', 'aprovada')
     AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
     AND (m.janela_fim IS NULL OR m.janela_fim >= now())
     AND m.classe_id IN (SELECT public.app_classes_do_aluno())
     AND lower(btrim(m.perfil_alvo)) = ANY (public.app_perfis_representativos(v_aluno));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Desafio não encontrado ou sem acesso.' USING ERRCODE = '42501';
  END IF;

  -- A trava do estudo (#13, 20261102_05): turma retida nao recebe intervencao da IA por perfil.
  IF public.estudo_personalizacao_retida(v_missao.classe_id) THEN
    RAISE EXCEPTION 'personalizacao_retida' USING ERRCODE = '42501';
  END IF;

  -- O portao da visibilidade (20261110_11): RPC DEFINER que le material por id, a RLS nao a cobre.
  IF NOT EXISTS (
    SELECT 1 FROM public.conteudos co JOIN public.topicos t ON t.id = co.topico_id
     WHERE co.id = v_missao.conteudo_id AND public.app_topico_liberado(t.publicacao, t.publicar_em)
  ) THEN
    RAISE EXCEPTION 'topico_nao_publicado' USING ERRCODE = '42501';
  END IF;
  v_grupo := v_missao.desafio_grupo;
  v_tipo := v_missao.desafio->>'tipo';

  -- A forma da resposta, antes de gravar ou contar qualquer coisa.
  IF jsonb_typeof(p_resposta) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'A resposta precisa ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  IF v_tipo = 'logica' THEN
    IF jsonb_typeof(p_resposta->'resposta') IS DISTINCT FROM 'string'
       OR char_length(p_resposta->>'resposta') NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Mande a resposta como texto, com até 1000 caracteres.' USING ERRCODE = '22023';
    END IF;
    v_texto := p_resposta->>'resposta';
  ELSE
    v_palavras := p_resposta->'palavras';
    IF jsonb_typeof(v_palavras) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Mande as palavras da cruzadinha.' USING ERRCODE = '22023';
    END IF;
    -- Teto: a grade tem ate' 10 palavras, e nenhuma resposta precisa de mais que isto.
    IF (SELECT count(*) FROM jsonb_object_keys(v_palavras)) > __PALAVRAS_MAX__
       OR EXISTS (SELECT 1 FROM jsonb_each(v_palavras) e
                   WHERE char_length(e.value #>> '{}') > __PALAVRA_MAX__) THEN
      RAISE EXCEPTION 'Mande até __PALAVRAS_MAX__ palavras, cada uma com até __PALAVRA_MAX__ caracteres.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Uma chamada por vez para o aluno neste desafio, por qualquer linha do grupo. De transacao: vale
  -- pelo pooler.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text || v_grupo::text, 0));

  -- Depois da trava: antes dela, duas chamadas com 19 tentativas passariam as duas.
  IF (SELECT count(*) FROM public.missao_desafio_tentativa t
       WHERE t.aluno_id = v_aluno
         AND t.desafio_grupo = v_grupo
         AND t.criado_em > now() - interval '1 hour') >= __LIMITE__ THEN
    RAISE EXCEPTION 'limite_de_tentativas'
      USING ERRCODE = 'P0001',
            HINT = 'No máximo __LIMITE__ tentativas por hora neste desafio. Tente de novo mais tarde.';
  END IF;

  -- Resolvido por qualquer linha do grupo, inclusive uma que o professor ja' apagou: a fonte e' a
  -- tentativa certa, que guarda o grupo e fica quando a missao sai (ver o docstring da 20261117_04).
  v_ja_concluida := EXISTS (
    SELECT 1 FROM public.missao_desafio_tentativa t
     WHERE t.aluno_id = v_aluno AND t.desafio_grupo = v_grupo AND t.acertou);

  SELECT r.resposta INTO v_gabarito FROM public.missao_desafio_gabarito r WHERE r.desafio_grupo = v_grupo;
  IF v_gabarito IS NULL THEN
    RAISE EXCEPTION 'Desafio sem gabarito.' USING ERRCODE = '42501';
  END IF;

  IF v_tipo = 'logica' THEN
    v_curta := v_missao.desafio->>'formato' = 'curta';
    v_acertou := EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_gabarito->'aceitas') a
       WHERE public.fn_missao_desafio_comparavel(a, v_curta) = public.fn_missao_desafio_comparavel(v_texto, v_curta));
  ELSE
    -- So' as palavras da grade contam; chave a mais e' ignorada, e palavra que nao e' texto, errada.
    SELECT count(*),
           count(*) FILTER (
             WHERE jsonb_typeof(v_palavras -> g.chave) = 'string'
               AND public.fn_missao_desafio_letras(v_palavras ->> g.chave) = public.fn_missao_desafio_letras(g.palavra))
      INTO v_total, v_certas
      FROM jsonb_each_text(v_gabarito->'palavras') AS g(chave, palavra);
    v_acertou := v_total > 0 AND v_certas = v_total;
  END IF;

  INSERT INTO public.missao_desafio_tentativa (missao_id, desafio_grupo, aluno_id, acertou, palavras_certas, palavras_total)
  VALUES (v_missao.id, v_grupo, v_aluno, v_acertou, v_certas, v_total);

  IF v_acertou AND NOT v_ja_concluida THEN
    -- Paga uma vez: so' quando a linha de fato virou concluida agora.
    INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)
    VALUES (v_aluno, v_missao.id, 'concluida', 100, now())
    ON CONFLICT (aluno_id, missao_id) DO UPDATE
      SET status = 'concluida', progresso = 100, concluida_em = now(), updated_at = now()
      WHERE public.missao_aluno.status <> 'concluida';
    GET DIAGNOSTICS v_mudou = ROW_COUNT;

    IF v_mudou > 0 THEN
      -- O sinal so' em volta do premio, e de volta a vazio tambem no erro (20261117_01).
      BEGIN
        PERFORM set_config('app.missao_premiando', 'on', true);
        INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)
        VALUES (v_aluno, v_missao.classe_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());
        PERFORM set_config('app.missao_premiando', '', true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('app.missao_premiando', '', true);
        RAISE;
      END;
    END IF;
  END IF;

  -- Nunca o gabarito: na cruzadinha, so' quantas palavras estao certas.
  RETURN jsonb_build_object('acertou', v_acertou, 'ja_concluida', v_ja_concluida,
                            'palavras_certas', v_certas, 'palavras_total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.missao_desafio_responder(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missao_desafio_responder(bigint, jsonb) TO authenticated;
""".replace("__LIMITE__", str(LIMITE_POR_HORA)).replace("__PALAVRAS_MAX__", str(PALAVRAS_MAX)).replace(
    "__PALAVRA_MAX__", str(PALAVRA_MAX_CARACTERES)
)

DESFAZER = """
DROP FUNCTION IF EXISTS public.missao_desafio_responder(bigint, jsonb);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_comparavel(text, boolean);
"""


def upgrade() -> None:
    op.execute(VISIBILIDADE)
    op.execute(TENTATIVA)
    op.execute(AUXILIARES)
    op.execute(RPC)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DESFAZER)
    op.execute(TENTATIVA_ANTES)
    op.execute(SEM_VISIBILIDADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
