# Plano: o aluno responde com código, número, expressão ou texto rico (spec B)

Data: 2026-11-10 · Spec: `docs/superpowers/specs/2026-11-08-respostas-codigo-formula-e-pre-avaliacao-design.md`
· Parte do spec A já na `main` (#1072, #1074, #1075)

**Objetivo.** Quatro formas novas de resposta:

- dissertativa rica;
- código, corrigido pela IA sem executar;
- numérica com unidade;
- expressão (matemática ou química).

A numérica e a expressão são conferidas sem IA. O avaliador discursivo sem LLM do `core-trailup`
entra em modo sombra, para triagem e faixa provisória. O aluno nunca recebe o gabarito.

**Regras de sempre:**

- UTF-8 sem BOM.
- Nada de SET pela 6543. Ler produção só em `BEGIN READ ONLY`, sem `SET`.
- Não aplicar a migration em produção.
- Rodar os passos do `ci.yml` do pacote antes de subir.
- Conferir o layout no emulador Android.
- Gemini só no tier free.
- Tabela nova e a policy dela vão no mesmo commit.
- Só abrir PR.

---

## O que a medição de 10/11 mudou no spec

Lido em produção, só leitura (`BEGIN READ ONLY`, sem `SET`), com `alembic_version = 20261110_01`.

| Spec dizia | Produção tem | Consequência no plano |
|---|---|---|
| "O banco não tem CHECK em `tipo`" | `atividades_tipo_conhecido`: `tipo IS NULL OR tipo IN ('quiz','true_false','fill_blank','essay','missao')`. Fora do Alembic. `questoes.tipo` não tem CHECK. | A migration troca o CHECK (com `code`, `numeric`, `expression`) e passa a versioná-lo. Sem isso, salvar a atividade nova dá `23514`. |
| "A resposta esperada continua em `questao_gabarito.resposta_correta`" | `questao_gabarito` tem só `questao_id`, `resposta_correta` e `atualizado_em`. É fora do Alembic, espelho de `questoes` por `trg_questoes_espelha_gabarito` (`AFTER INSERT OR UPDATE`, upsert incondicional). **`authenticated` ainda tem SELECT em `questoes.resposta_correta`**: a fase 3 do gabarito não entrou. | O gabarito dos tipos novos **nunca passa por `questoes`**. O console grava direto em `questao_gabarito`, que já tem a policy `questao_gabarito_professor`. O espelho deixa de copiar os tipos novos, e um CHECK em `questoes` impede `resposta_correta` preenchida neles. Assim o spec B não espera a fase 3, e o valor da numérica não fica legível pelo aluno. |
| "O avaliador compara a resposta com o gabarito" | `pre_avaliacao.preparar` precisa do **enunciado** e de **stopwords** de um corpus com pelo menos `MIN_DOCS = 10` textos. Sem os dois, a correlação cai de 0,495 para 0,429. | A RPC de contexto da dissertativa devolve o corpus do tópico (seção 6.1). |
| — | Nenhuma resposta dissertativa em `questao_aluno` (0 linhas). | Os ~100 rótulos para reajustar os pesos não existem. O modo sombra é o único possível por um bom tempo. |
| — | `fn_alteracao_questao_objetiva` (`20261101_12`) só recorrige `TIPOS_OBJETIVOS`. | Os tipos novos ficam **fora** da recorreção automática de propósito, porque ela compara texto. A mudança de gabarito neles é registrada, e quem decide é o professor. Teste trava isso. |
| Plano A, 3.4: aviso "app desatualizado" no console | Não entrou no #1075. `app_versao_minima` é pública em `app_config`. | O aviso nasce aqui, para os tipos novos e para o rico (PR 4). |

## PRs

Todos a partir da `main`, sem empilhar.

| PR | Pacote | Depende de |
|---|---|---|
| 1. Banco: tipos, gabarito fora de `questoes`, RPCs | `api/` | nada |
| 2. Edge `questao-conferir-resposta` (sem IA) | `frontend/supabase/functions/` | PR 1 aplicado |
| 3. Edge da dissertativa corrige código | `frontend/supabase/functions/validate-essay-answer-ai/` | PR 1 aplicado |
| 4. Console: criar e corrigir os tipos novos | `frontend/` | PR 1 aplicado |
| 5. App: os editores de resposta | `mobile/` | PR 1 aplicado; PRs 2 e 3 com deploy feito |
| 6. Pré-avaliação: banco e edge, em modo sombra | `api/` e a edge da dissertativa | PR 1 |
| 7. Pré-avaliação: triagem no console e faixa no app | `frontend/` e `mobile/` | PR 6 aplicado |

- PRs 2, 3 e 4 não dependem um do outro.
- O 5 só se publica depois do deploy das edges. Sem ele, o app chama uma função que não existe.
- **O deploy das edge functions não tem CI.** É da Geisbelly, como foi o da `validate-essay-answer-ai`. A descrição de cada PR de edge diz o comando.

---

## PR 1: banco

Branch `feat/respostas-ricas-banco`.

### 1.1 Medir de novo, logo antes de escrever

Só leitura, em `BEGIN READ ONLY; … ROLLBACK;`, sem `SET`:

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'atividades_tipo_conhecido';
SELECT pg_get_functiondef('public.fn_questoes_espelha_gabarito()'::regprocedure);
SELECT pg_get_functiondef('public.questao_responder(bigint,text,integer)'::regprocedure);
SELECT pg_get_functiondef('public.questao_correcao_ia_contexto(uuid,bigint)'::regprocedure);
SELECT pg_get_functiondef('public.questao_registrar_correcao_ia(uuid,bigint,text,boolean,numeric,integer)'::regprocedure);
SELECT pg_get_functiondef('public.fn_questao_registrar_resposta(uuid,bigint,text,boolean,numeric,integer)'::regprocedure);
SELECT pg_get_functiondef('public.notas_fila(bigint)'::regprocedure);
SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname LIKE 'duplicar_%';
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'questao_gabarito';
```

Se algum corpo divergir do Alembic (`20261108_01`, `20261108_03`, `20261018_05`), a migration
parte do corpo de produção, e o docstring descreve a diferença.

### 1.2 Número

```bash
git fetch origin main
cd api && python -c "from alembic.config import Config; from alembic.script import ScriptDirectory; print(ScriptDirectory.from_config(Config('alembic.ini')).get_heads())"
```

Uma cabeça só. Hoje seria `20261110_02`, sobre `20261110_01`. Conferir de novo antes de abrir o
PR.

### 1.3 Testes de estrutura primeiro (falham)

Arquivo `api/tests/test_migration_respostas_ricas.py`, no molde de
`test_migration_texto_rico.py` (SQL offline):

- o CHECK novo de `atividades` aceita os cinco tipos de antes mais `code`, `numeric` e
  `expression`, e continua aceitando `NULL`;
- `questoes.config_resposta jsonb` e `questao_gabarito.criterios jsonb`, ambos com
  `ADD COLUMN IF NOT EXISTS`;
- CHECK `questoes_gabarito_fora_dos_tipos_novos`: `resposta_correta IS NULL` quando `tipo` é
  `codigo`, `numerica` ou `expressao`;
- `fn_questoes_espelha_gabarito` não copia os tipos novos;
- `questao_responder` levanta `questao_corrigida_no_servidor` para os três tipos novos **antes**
  de `fn_questao_confere`;
- `fn_questao_corrigida_por_ia(p_questao_id)` aceita dissertativa e `codigo`. É usada por
  `questao_correcao_ia_contexto`, `questao_registrar_correcao_ia` e pelo `v_liberado` de
  `fn_questao_registrar_resposta`, porque o código de referência nunca é liberado, como a
  dissertativa;
- `questao_conferencia_contexto` e `questao_registrar_correcao_servidor` com
  `REVOKE … FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE … TO service_role`;
- as três cópias levam `config_resposta` e copiam a linha de `questao_gabarito` (resposta e
  critérios). Para os tipos novos, o espelho não a cria;
- `notas_fila` reconhece `code` e lê o gabarito de `questao_gabarito`. Hoje ele lê
  `questoes.resposta_correta`, e para os tipos novos a fila do professor viria sem gabarito;
- `TIPOS_OBJETIVOS` da `20261101_12` não ganha nenhum tipo novo. Teste negativo.

### 1.4 A migration

`api/alembic/versions/20261110_02_respostas_ricas.py`.

O docstring traz:

- o spec;
- a tabela da medição acima;
- por que o gabarito sai de `questoes`;
- por que os tipos novos ficam fora da recorreção;
- o downgrade, que volta o CHECK e as funções, tira as colunas novas e **não** devolve gabarito a
  `questoes`.

Pontos que não são óbvios:

- **Tipo exato.** As funções comparam `codigo`, `numerica` e `expressao` exatos, sem os apelidos
  de `TIPOS_DISSERTATIVA`.
- **Pontuação.** `questao_registrar_correcao_servidor` chama `fn_questao_registrar_resposta` com
  `p_percentual` 100 ou 0. A regra de pontuação continua sendo uma só.
- **Gabarito liberado.** Para numérica e expressão, o `v_liberado` segue a regra da objetiva:
  acertou, ou modo diferente de `pensante`. É o que o aluno já vê numa múltipla. Para código,
  nunca. **Decidido pela Geisbelly em 10/11.**
- **`questao_conferencia_contexto` devolve** `tipo`, `resposta_esperada`, `criterios` e
  `config_resposta`. Antes, passa por `fn_questao_acesso`, que confere matrícula e prazo.
- **Schema fora do Alembic.** O CHECK de `atividades` e o espelho de `questao_gabarito` passam a
  ser versionados aqui. Atualizar `docs/architecture/schema-nao-versionado.md` no mesmo PR.

### 1.5 Ponta a ponta no Postgres (Docker)

Os mesmos papéis de verdade do PR 1 do spec A:

- **Aluno** (`SET LOCAL ROLE authenticated` dentro de `BEGIN … ROLLBACK`, no Docker):
  - `questao_responder` numa `numerica` levanta `questao_corrigida_no_servidor`;
  - `SELECT criterios FROM questao_gabarito` dá 0 linha;
  - `SELECT resposta_correta FROM questoes WHERE tipo = 'numerica'` dá `NULL`;
  - as RPCs novas dão `42501`.
- **Professor:** grava critérios na própria turma, e não na de outro.
- **`service_role`:** `questao_registrar_correcao_servidor` aplica 50% na repetida e 20% depois
  do gabarito visto.
- **Cópia:** `duplicar_atividade` de uma `numerica` leva o gabarito e os critérios.

### 1.6 CI do pacote e PR

Os passos do job `api` do `ci.yml`, no pacote inteiro.

PR `feat(banco): tipos de resposta código, numérica e expressão, com o gabarito fora de questoes (spec B, PR 1)`.

---

## PR 2: edge `questao-conferir-resposta`

Branch `feat/conferir-resposta-edge`. Pasta `frontend/supabase/functions/questao-conferir-resposta/`.

### 2.1 Núcleo puro, testes primeiro

- `conferir.ts`, puro.
  - Recebe a instância do mathjs por parâmetro, para o vitest usar o pacote do `frontend` e a
    edge usar `npm:mathjs@15.2.0`. A versão é exata e a mesma nos dois.
  - `conferirNumerica(resposta, esperada, criterios)`.
  - `conferirExpressao(resposta, esperada, criterios, config)`, com o sorteio de pontos por
    semente fixa por questão, para o resultado não variar entre tentativas.
  - `conferirQuimica(resposta, esperada)`.
  - O motivo devolvido é um de três: `unidade_incompativel`, `expressao_invalida` ou nada.
- `quimica.ts`: lê `\ce{…}` ou texto (`2H2 + O2 -> 2H2O`, `H_2O`) num multiconjunto de espécies
  com coeficiente, por lado da seta.
- `latexParaMathjs.ts`: o LaTeX do teclado do app (`\frac{a}{b}`, `\sqrt{}`, `\cdot`, `\times`,
  `^{}`) vira a sintaxe do mathjs. O que não for reconhecido vira `expressao_invalida`, nunca um
  palpite.
- `conferir.test.ts` (vitest) cobre os casos do spec:
  - `36 km/h` = `10 m/s`;
  - `10,0 m/s` = `10 m/s`;
  - `10 kg` dá `unidade_incompativel`;
  - `10` contra `10 m/s` dá erro;
  - `2(x+1)` = `2x+2`;
  - `x^2` ≠ `x^3`;
  - `sqrt(x^2)` contra `x` em domínio com negativos dá diferente;
  - `\frac{1}{2}x` = `x/2`;
  - `H_2O` = `H2O`;
  - coeficiente trocado dá diferente;
  - **nenhum retorno contém a esperada**: teste que procura o texto da esperada em
    `JSON.stringify` de todo retorno.

```bash
cd frontend && npm install --save-exact --save-dev mathjs@15.2.0 && npx vitest run supabase/functions/questao-conferir-resposta
```

### 2.2 `index.ts`

No molde da `validate-essay-answer-ai`:

- `requireAuthenticatedUser`;
- `questao_conferencia_contexto` pela chave de serviço;
- `conferir`;
- `questao_registrar_correcao_servidor`.

Erro da RPC passa por um `respostaDoErroDaRpc` próprio. Ao aluno sai `{ correta,
acertos_percentual, regra, tentativa, motivo? }`, mais o `resposta_correta` só quando o banco
liberar. `config.toml` com `verify_jwt = true`.

### 2.3 CI e PR

```bash
cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

O lint do frontend também passa nas edge functions.

PR `feat(edge): conferência de numérica e expressão sem IA, com unidade e química (spec B, PR 2)`.
A descrição traz o deploy:

```bash
supabase functions deploy questao-conferir-resposta
```

---

## PR 3: a edge da dissertativa corrige código

Branch `feat/correcao-de-codigo`.

- **`questao_correcao_ia_contexto`** já devolve, pelo PR 1, `tipo`, `linguagem` e `criterios`.
  `lerContexto` (`correcaoPeloServidor.ts`) passa a ler os três.
- **Prompt próprio para `codigo`:**
  - recebe o código de referência, a linguagem e os critérios;
  - diz que a resposta pode estar certa por outro caminho;
  - não exige o mesmo código;
  - pede feedback sem código.
- **`semCodigo.ts`, puro.** Antes de `protegerAvaliacao`, tira todo bloco cercado e todo trecho
  entre crases do feedback, dos pontos e da observação. Campo que ficar vazio vira o texto
  protegido padrão.
- **`protegerAvaliacao` contra o código de referência.** Os nomes de variável são palavras, então
  a janela de 6 palavras pega linhas copiadas.
- **Testes:**
  - feedback com bloco sai sem o bloco;
  - linha do código de referência no feedback é trocada;
  - o código do próprio aluno pode ser citado sem código, por nome.
- **Cota.** Não muda: um envio, uma chamada. O pré-filtro é do PR 6, e só em sombra.

CI como no PR 2. PR `feat(edge): a IA corrige resposta em código sem devolver código (spec B, PR 3)`.

---

## PR 4: console

Branch `feat/respostas-ricas-console`.

### 4.1 As listas de tipo

- `tiposDeAtividade.ts`: `code`, `numeric` e `expression`, com os rótulos "Código", "Numérica" e
  "Expressão".
- `formatoDaQuestao.ts`: `formatoDaQuestao` e `tipoDaQuestaoDoFormato` mapeiam `code ↔ codigo`,
  `numeric ↔ numerica` e `expression ↔ expressao`.
  - **O padrão continua `essay`.** Um tipo desconhecido que antes virava dissertativa continua
    virando.
  - Teste novo cobre o mapeamento de ida e volta.

### 4.2 O editor da questão

Em `TopicEditDrawer.tsx`:

- **Código:**
  - escolhe a linguagem, que vai em `config_resposta.linguagem`;
  - o código de referência vai num `CampoTextoRico` em modo código;
  - os critérios são uma lista editável.
- **Numérica:**
  - o valor com unidade, com prévia do que o mathjs entendeu;
  - a tolerância, relativa ou absoluta (padrão: 1% relativa);
  - a dimensão é opcional, para os atalhos do app.
- **Expressão:**
  - a expressão esperada, com prévia em `TextoRico`;
  - variáveis e domínio, com um botão "conferir" que roda o mesmo `conferir.ts` do PR 2 contra
    duas respostas de exemplo que o professor digita;
  - química é detectada por `\ce{`.
- **Gravação do gabarito.** O gabarito dos tipos novos é gravado em `questao_gabarito` (upsert
  por `questao_id`, `resposta_correta` e `criterios`), depois de `saveQuestion` gravar
  `resposta_correta: null`. `topicsApi.saveGabaritoDoServidor` é a única função que faz isso, com
  teste.
- **Leitura do gabarito.** O editor lê de `questao_gabarito` para os tipos novos. Os tipos antigos
  continuam lendo de `questoes` até a fase 3.

### 4.3 Aviso de app desatualizado

- Ao salvar atividade de tipo novo ou registro rico:
  - ler `app_config.app_versao_minima`, que é pública;
  - se ela estiver vazia, ou for menor que `VERSAO_DO_APP_COM_RESPOSTAS_RICAS`, mostrar o toast
    "Alunos com o app desatualizado não conseguem responder esta questão." (no rico: "… verão este
    texto sem formatação.");
  - salvar normalmente.
- **Não chutar a versão.** A constante é a do build que tiver o PR 5, confirmada pela Geisbelly
  quando ele for publicado. Até lá vale `null`, e o aviso aparece sempre.

### 4.4 Ver as respostas

- `FilaDeCorrecao` e a revisão de notas desenham a resposta do aluno:
  - `BlocoDeCodigo` no código;
  - `TextoRico` na expressão e na dissertativa rica.
- **A letra da múltipla rica.** O console não lê `questao_aluno` em lugar nenhum hoje. O
  `alternativaDaResposta` do #1075 está pronto e sem uso. A primeira tela que mostrar resposta por
  questão passa por ele, senão o professor vê "B" no lugar da alternativa.

### 4.5 Conferir, CI e PR

- Console local contra o banco local com o PR 1:
  - criar uma questão de cada tipo novo;
  - duplicar;
  - conferir que `questoes.resposta_correta` fica `NULL` e o gabarito está em
    `questao_gabarito`;
  - capturas.
- CI: `npm ci && npm run lint && npm run typecheck && npm test && npm run build` no `frontend`.

PR `feat(console): questões de código, numérica e expressão, com o gabarito só no servidor (spec B, PR 4)`.

---

## PR 5: app

Branch `feat/respostas-ricas-app`.

### 5.1 Os tipos

- `QuestionActivity` ganha `isCodigoType`, `isNumericaType` e `isExpressaoType`, com o tipo exato.
- **Antes de qualquer outra mudança, um teste trava o que um tipo desconhecido faz hoje.** Hoje
  ele cai na múltipla sem alternativa, e é o que um app 1.0.x vai mostrar a uma questão nova. O
  aviso do PR 4 existe por causa disso.

### 5.2 Os editores

Cada editor tem um componente próprio em `mobile/src/components/resposta/`:

- **`EditorDeCodigo`:**
  - `TextInput` multilinha, monoespaçado;
  - `autoCorrect={false}`, `autoCapitalize="none"`, `spellCheck={false}`,
    `keyboardType="ascii-capable"` no iOS;
  - a barra acima do teclado (`InputAccessoryView` no iOS, uma barra própria no Android) tem tab
    (4 espaços em Python, Java, C, C++ e C#; 2 em JS, TS, HTML, CSS e SQL), `{}`, `()`, `[]`,
    `;`, `:`, `=` e `"`, inserindo na posição do cursor;
  - a prévia usa o `BlocoDeCodigo`.
- **`EditorNumerico`:**
  - um campo só;
  - um botão alterna teclado numérico e texto;
  - os atalhos de unidade vêm da `config_resposta.dimensao`.
- **`EditorDeExpressao`, também para a dissertativa rica:**
  - barra de símbolos (fração, potência, raiz, índice, `·`, `±`, `→`, `\ce{}` e letras gregas);
  - prévia ao vivo com `TextoRico`.
- **Envio:**
  - código e dissertativa vão para `validate-essay-answer-ai`, com `questaoId`;
  - numérica e expressão vão para `questao-conferir-resposta`;
  - `essayValidation.ts` ganha um irmão, `conferenciaNoServidor.ts`, com testes.
- **Revisão e gabarito liberado** usam `BlocoDeCodigo` ou `TextoRico`.

### 5.3 Android, CI e PR

- No emulador:
  - teclado sobre o campo de código;
  - barra visível;
  - rolagem horizontal do código;
  - prévia da expressão;
  - envio com a edge local (`supabase functions serve`) contra o banco local.
- Capturas no padrão `prints/<nome>`.
- CI do `mobile`: `npm ci && npm run lint && npm run typecheck && npm test`, mais os grupos
  isolados (o `trail-resume` já caiu uma vez por não rodar na suíte principal, #1076).
- Versão: não mexer sem a Geisbelly. O número sai junto do `VERSAO_DO_APP_COM_RESPOSTAS_RICAS` do
  PR 4.

PR `feat(mobile): o aluno responde com código, número e expressão (spec B, PR 5)`.

---

## PR 6: pré-avaliação em modo sombra

Branch `feat/pre-avaliacao-sombra`.

### 6.1 Banco

Os itens abaixo vão numa migration própria.

- **Tabela `questao_pre_avaliacao`**, como no spec, com `versao_pesos text NOT NULL`.
  - Policy de SELECT para o professor via `app_classes_do_professor()`.
  - Nenhuma policy para o aluno, registrado no docstring.
  - Escrita só pelo `service_role`.
- **`questao_aluno.faixa_provisoria text`**, com CHECK em `baixo`, `medio`, `alto` ou `NULL`.
- **`app_config`**, todas com `publico = false`:
  - `pre_avaliacao_modo = 'sombra'`;
  - `pre_avaliacao_corte_baixo`;
  - `pre_avaliacao_corte_alto`;
  - `pre_avaliacao_faixa_ao_menor = 'false'`.
- **`questao_correcao_ia_contexto` devolve também o corpus**, só para a dissertativa: os
  enunciados e os gabaritos das questões do tópico, e o texto dos conteúdos do tópico.
  - O limite é de 200 textos e 200 mil caracteres.
  - Com menos de 10 textos, a edge usa stopwords vazias, que é o padrão seguro do módulo.
- **RPC `questao_registrar_pre_avaliacao`**, só `service_role`.
- **Teste com papel de verdade:** o aluno não lê a tabela, e o professor só lê as das próprias
  turmas.

### 6.2 O porte

- `validate-essay-answer-ai/preAvaliacao.ts`, porte de `trailup_core/pre_avaliacao.py`. Pode
  partir do `docs/seminario/discursivo.js` do `core-trailup`, que já foi conferido contra o Python
  pelo `seminario/scripts/09_conferir_port.py`.
- **Paridade:**
  - `scripts/pre_avaliacao/gerar_vetores.py` roda o Python do `core-trailup` sobre respostas em
    português e grava `preAvaliacao.vetores.json`;
  - o caminho do `core-trailup` vem por variável de ambiente, e nada do repositório dele é
    copiado;
  - o vitest compara a nota com tolerância de `1e-9`, e as stopwords e os conceitos centrais na
    mesma ordem;
  - o arquivo de vetores registra o commit do `core-trailup` usado.
- **Pontos de divergência que os vetores precisam cobrir:**
  - o `\w{3,}` do Python, que vira `[\p{L}\p{N}_]{3,}` com a flag `u`;
  - o `lower()`;
  - o desempate de `sorted(grau.items(), key=-peso)`, que é estável na ordem de inserção. O `Map`
    do JS também guarda essa ordem, e o `sort` é estável.
- **`versao_pesos = 'classex-de-2026-09-13'`**, gravado em cada linha.

### 6.3 Na edge

Só para dissertativa:

- roda o avaliador antes do Gemini;
- grava a linha com a `decisao`;
- em sombra, segue para o Gemini sempre e guarda `nota_ia`.

Para menor, cota esgotada e falha da IA:

- grava a linha com `sem_ia_menor` ou `sem_ia_cota`;
- grava a faixa em `faixa_provisoria`;
- **só a devolve ao aluno se `pre_avaliacao_faixa_ao_menor` estiver ligada**. Isso vale para o
  menor. Para cota e falha, a faixa sai sempre.

Testes:

- em sombra, toda resposta vai ao Gemini;
- o retorno ao aluno nunca tem `conceitos_faltando`, nota de 1 a 5 nem percentual.

### 6.4 CI e PR

Os passos dos jobs `api` e `frontend`.

PR `feat: pré-avaliação discursiva sem LLM em modo sombra (spec B, PR 6)`. A descrição diz que
ligar o modo ativo **não** faz parte dele.

---

## PR 7: triagem no console e faixa no app

- **`FilaDeCorrecao`:**
  - ordena da pior faixa prevista para a melhor;
  - mostra a faixa e os conceitos que faltaram;
  - esses dados vêm de `questao_pre_avaliacao`, pela policy do professor;
  - sem pré-avaliação, mantém a ordem de hoje.
- **App:** quando a correção volta sem IA e com faixa, mostra "Estimativa automática: médio. O
  professor vai confirmar a nota.", sem número. Quando o professor corrige, a faixa some.
- Android e capturas, como no PR 5.

---

## Depois

- **Texto do #195 e termo.** A faixa ao menor só liga quando a Geisbelly decidir o texto novo.
  Até lá, `pre_avaliacao_faixa_ao_menor` fica `false`.
- **Modo ativo do pré-filtro.** Só depois de cerca de 100 dissertativas com `nota_ia`, com o erro
  nas pontas recalculado sobre elas. Hoje há 0.
- **Reajuste dos pesos em português.** Sai dos mesmos dados, com uma `versao_pesos` nova.
- **Fase 3 do gabarito.** O spec B não depende mais dela, porque os tipos novos nunca gravam
  gabarito em `questoes`. Os tipos antigos continuam expostos até lá.
- **Sync do espelho**, sempre que a `main` do Lab avançar. Junto, dizer se produção já tem as
  migrations.

## O que este plano não cobre

- Executar código, Portugol e linguagens fora das dez.
- Questão de PDF e os prompts da IA emitindo os tipos novos: spec C.
- Ligar o modo ativo e o que a resposta poupada recebe.
