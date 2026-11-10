# O aluno responde com código, número, expressão ou texto rico (spec B de 3)

Data: 2026-11-08 · Status: design aprovado, sem implementação · Depende do spec A
(`2026-11-08-texto-rico-formulas-e-codigo-design.md`)

## Por quê

Hoje a resposta é uma alternativa, V/F, uma lacuna ou um texto livre. Não há como responder com
um programa, com um valor físico com unidade ou com uma expressão. O texto livre aceita LaTeX ou
código digitados, mas ninguém o desenha.

Restrições que vêm de antes:

- **O app não recebe o gabarito** (#1064/#1065, `20261108_01`). A correção é do banco, ou de uma
  edge function que lê a resposta esperada pela chave de serviço.
- **A correção da dissertativa não revela a resposta esperada** (#1060,
  `protecaoDaResposta.ts`).
- **IA só para maiores de 18** (#195). A edge function da dissertativa devolve `ia_indisponivel`
  ao menor.
- **Gemini só no tier free.** Cada envio de dissertativa é uma chamada.

## Decisões (Geisbelly, 08/11)

1. Quatro formas de resposta: dissertativa rica, código, numérica com unidade e expressão.
2. **Código é corrigido pela IA**, como a dissertativa, sem executar.
3. **Expressão e número são conferidos sem IA**, por uma edge function com mathjs. *(Assumido: a
   pergunta foi interrompida, e a alternativa ficou registrada sem objeção.)*
4. **Linguagens:** Python, JavaScript, TypeScript, Java, C, C++, C#, SQL, HTML e CSS. Sem
   Portugol.
5. **Unidades são convertidas:** 36 km/h vale para 10 m/s, dentro da tolerância.
6. **O avaliador discursivo sem LLM** (`trailup_core/pre_avaliacao.py`, `core-trailup`) entra com
   três usos: triagem para o professor, faixa provisória ao aluno e pré-filtro para poupar cota.
7. **O menor também vê a faixa provisória.** Isso depende de mudar o texto do #195 e o termo (ver
   "Dependências").

## 1. Tipos

| `questoes.tipo` | `atividades.tipo` | Quem corrige | Onde |
|---|---|---|---|
| `dissertativa` | `essay` | Gemini, como hoje, com o texto rico | edge `validate-essay-answer-ai` |
| `codigo` | `code` | Gemini, com código de referência e critérios | edge `validate-essay-answer-ai` |
| `numerica` | `numeric` | mathjs, sem IA | edge nova `questao-conferir-resposta` |
| `expressao` | `expression` | mathjs, sem IA; química por espécies e coeficientes | edge nova `questao-conferir-resposta` |

As três listas que precisam aprender os tipos novos:

- `TIPOS_DE_ATIVIDADE` e `ROTULO_DO_TIPO` (`tiposDeAtividade.ts`);
- `formatoDaQuestao` e `tipoDaQuestaoDoFormato` (`formatoDaQuestao.ts`);
- os reconhecedores de tipo de `QuestionActivity`.

O banco não tem CHECK em `tipo`. Por isso as funções novas comparam o tipo exato, sem os apelidos
de `TIPOS_DISSERTATIVA`.

## 2. Banco

Tudo aditivo.

- **`questoes.config_resposta jsonb`** guarda só o que é público, ou seja, o que o aluno precisa
  para responder:
  - código: `{ "linguagem": "python" }`;
  - expressão: `{ "variaveis": ["x", "y"] }`;
  - numérica: `{ "dimensao": "velocidade" }`, opcional, só para o teclado sugerir unidades.
- **`questao_gabarito.criterios jsonb`**, que o aluno não lê, como o resto da tabela:
  - código: a lista de critérios do professor;
  - numérica: `{ "tolerancia": 0.05, "tipo_tolerancia": "relativa" | "absoluta" }`;
  - expressão: `{ "dominio": [-10, 10], "pontos": 20 }`.

  A resposta esperada continua em `questao_gabarito.resposta_correta`. Código de referência,
  valor com unidade (`10 m/s`) ou expressão (`2x + 2`, `\ce{2H2 + O2 -> 2H2O}`).
- **`questao_responder` recusa os três tipos novos** com `questao_corrigida_no_servidor`. Sem
  isso, uma numérica cairia na comparação de texto de `fn_questao_confere`, e `10,0 m/s` daria
  errado contra `10 m/s`.
- **`questao_correcao_ia_contexto`** passa a aceitar `codigo` além da dissertativa e devolve a
  linguagem e os critérios.
- **RPCs novas, só `service_role`:**
  - `questao_conferencia_contexto(p_aluno, p_questao_id)`: confere matrícula e prazo
    (`fn_questao_acesso`) e devolve a esperada e os critérios de `numerica` e `expressao`;
  - `questao_registrar_correcao_servidor(p_aluno, p_questao_id, p_resposta, p_correta,
    p_tempo_gasto_seg)`: grava em `questao_aluno` com a mesma pontuação de
    `fn_questao_registrar_resposta` (gabarito visto → 20%, repetida → 50%, nova tentativa →
    `penalty_retry_pct`).
- **Cópia.** `duplicar_*` passam a copiar `config_resposta` e `criterios`, com teste de estrutura.

## 3. Edge function `questao-conferir-resposta` (sem IA)

Não tem modelo de linguagem, então não vai para a API. Fica junto das outras edge functions, como
a correção da dissertativa: é ela quem precisa da chave de serviço para ler a esperada.

1. Exige usuário logado (como `requireAuthenticatedUser`).
2. Lê o contexto por `questao_conferencia_contexto`.
3. Confere:
   - **numérica:** `mathjs.unit` nas duas pontas. Vírgula decimal vira ponto antes. Unidade
     incompatível (m/s contra kg) vira `unidade_incompativel`. Sem unidade quando a esperada tem
     unidade também é erro. Compara pela tolerância do professor;
   - **expressão matemática:** `mathjs.parse` nas duas (aceita `·`, `×`, `^`, multiplicação
     implícita e o LaTeX simples do teclado convertido antes). Avalia a diferença em N pontos
     sorteados no domínio. Equivalente se `|f − g| < 1e-9 · max(1, |g|)` em todos os pontos
     onde as duas estão definidas, e se elas estiverem definidas em pelo menos metade deles;
   - **expressão química:** parser próprio de `\ce{}` ou texto (`H2O`, `2H2 + O2 -> 2H2O`):
     compara o multiconjunto de espécies com coeficientes, e índice como `H2` e `H_2` dá igual.
4. Grava por `questao_registrar_correcao_servidor`.
5. Ao aluno devolve só `correta`, a pontuação e um motivo de três: `unidade_incompativel`,
   `expressao_invalida` ou nada. Nunca "quase", "perto" ou "fora da tolerância", que ajudariam a
   achar o valor por tentativa.

## 4. Código corrigido pela IA

`validate-essay-answer-ai` com `questaoId` de uma questão `codigo`:

- o prompt recebe o código de referência, a linguagem e os critérios, e pede nota, feedback e
  pontos. Instrução explícita: a resposta pode estar certa por outro caminho; não exigir o mesmo
  código;
- **o feedback não pode ter código.** Antes de `protegerAvaliacao`, todo bloco cercado e todo
  trecho entre crases sai do feedback, dos pontos e da observação. Feedback de código sem código
  é a regra mais simples que impede colar a solução;
- `protegerAvaliacao` roda contra o código de referência, como roda contra a resposta esperada.
  A janela de 6 palavras pega cópia de linhas, e o código do próprio aluno não conta;
- menor e cota esgotada seguem o caminho da seção 6.

## 5. App

- **Código:** `TextInput` multilinha monoespaçado, sem autocorreção, sem maiúscula automática e
  sem sugestão de texto. Barra acima do teclado com tab (2 ou 4 espaços conforme a linguagem),
  `{}`, `()`, `[]`, `;`, `:`, `=`, `"`, e prévia com o `BlocoDeCodigo` do spec A.
- **Numérica:** campo único (`10 m/s`) com teclado que alterna número e texto, e atalhos de
  unidade da `dimensao` quando houver. Vírgula ou ponto.
- **Expressão e dissertativa rica:** barra de símbolos acima do teclado (fração, potência, raiz,
  índice, `·`, `±`, `→`, `\ce{}`, letras gregas). O texto digitado é LaTeX, e a prévia ao vivo usa
  o `TextoRico`.
- **Resposta já enviada** aparece desenhada pelo `TextoRico`, na revisão e no gabarito revelado.
- Conferir no emulador Android: teclado sobre o campo de código, barra visível, rolagem
  horizontal do código.

## 6. Pré-avaliação sem LLM

O avaliador do `core-trailup` (`docs/discursiva/AVALIADOR_DISCURSIVO.md`) compara a resposta com
o gabarito por conceitos e coocorrência, sem modelo de linguagem, em 167 µs. O que foi medido,
e que define o uso:

- Spearman 0,50 contra o rótulo, num teto de 0,88. **Ordena e tria, não dá nota.** O percentual
  estimado erra 13 pontos e sai 5,9 pontos alto. A faixa (`baixo`/`medio`/`alto`) separa em
  ordem;
- os pesos foram ajustados em alemão (macroeconomia), contra nota do GPT-4. O próprio módulo pede
  reajuste com cerca de 100 respostas em português;
- palavras de 3 letras ou mais. **Não serve para código** nem para expressão;
- **`conceitos_faltando` são palavras do gabarito.** Mostrá-los ao aluno revela a resposta.

### Onde roda

Porte para TypeScript em `validate-essay-answer-ai/preAvaliacao.ts`, só para dissertativa. Teste
de paridade com vetores gerados pelo Python (o `seminario/scripts/09_conferir_port.py` já faz a
conferência do porte para JavaScript do protótipo). A versão dos pesos vai em cada registro.

### Tabela `questao_pre_avaliacao`

A policy entra no mesmo commit da tabela.

| coluna | |
|---|---|
| `questao_aluno_id` | a resposta avaliada |
| `versao_pesos` | qual conjunto de pesos |
| `nota_1a5`, `faixa`, `cobertura` | a saída do avaliador |
| `conceitos_faltando jsonb` | **só o professor lê** |
| `decisao` | `enviada_ia`, `sombra_poupada_baixa`, `sombra_poupada_alta`, `sem_ia_menor`, `sem_ia_cota` |
| `nota_ia` | preenchida quando o Gemini corrige: é o rótulo para o reajuste |

- RLS: SELECT para o professor via `app_classes_do_professor()`. **Nenhuma policy para o aluno**,
  decisão registrada no docstring da migration. Escrita só pela edge function (`service_role`).
- O aluno recebe só a faixa, em `questao_aluno.faixa_provisoria` (`baixo`/`medio`/`alto`/nulo),
  gravada pela edge function.

### Os três usos

1. **Triagem.** `FilaDeCorrecao` ordena as respostas a corrigir da pior prevista para a melhor e
   mostra a faixa e os conceitos que faltaram. Vale para toda resposta que o professor corrige à
   mão: menor, cota esgotada, falha da IA, revisão.
2. **Faixa provisória ao aluno** quando não há correção pela IA (menor, cota, falha): "Estimativa
   automática: médio. O professor vai confirmar a nota." Sem número, sem percentual e sem
   conceitos. Quando o professor corrige, a faixa some.
3. **Pré-filtro, começando em modo sombra.** `app_config` com `pre_avaliacao_modo` = `sombra`
   (padrão) ou `ativo` e os cortes, todos com `publico = false`, porque são tetos que ajudam a
   burlar. Em sombra, toda resposta continua indo ao Gemini, e a decisão registra o que teria sido
   poupado. A nota do Gemini fica em `nota_ia`, e o reajuste dos pesos em português sai dos
   próprios dados. **Ligar o modo ativo, e decidir o que a resposta poupada recebe, é decisão
   depois de cerca de 100 respostas medidas**, com o erro nas pontas recalculado sobre elas. Não
   entra neste spec.

## Dependências

- **Texto do #195 e termo.** "A IA do TrailUp é só para maiores de 18" deixa de descrever o que o
  menor recebe quando ele passa a ver uma estimativa automática. O avaliador não manda a resposta
  a nenhum provedor, mas é um modelo treinado. O texto novo e o termo são decisão da Geisbelly; a
  faixa ao menor só liga depois disso, por flag em `app_config`.
- **Spec A**, para desenhar enunciado, resposta e gabarito.

## Testes

- Banco (papel `authenticated` de verdade, `BEGIN/ROLLBACK`): `questao_responder` recusa os três
  tipos; o aluno não lê `criterios` nem `questao_pre_avaliacao`; o professor lê a pré-avaliação
  só das próprias turmas; as RPCs novas não têm EXECUTE para `authenticated`.
- Edge sem IA: `36 km/h` = `10 m/s`; `10,0 m/s` = `10 m/s`; `10 kg` dá `unidade_incompativel`;
  `2(x+1)` = `2x+2`; `x^2` ≠ `x^3`; `sqrt(x^2)` contra `x` em domínio com negativos dá diferente;
  `H_2O` = `H2O`; equação com coeficiente trocado dá diferente; o retorno nunca traz a esperada.
- Código: feedback com bloco de código sai sem o bloco; cópia de 6 palavras do código de
  referência é trocada.
- Pré-avaliação: paridade com o Python nos vetores; faixa gravada sem conceitos no retorno ao
  aluno; em sombra, toda resposta vai ao Gemini.
- Android: os três editores no emulador.
