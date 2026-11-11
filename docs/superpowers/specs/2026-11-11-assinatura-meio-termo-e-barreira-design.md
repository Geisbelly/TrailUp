# Assinatura editorial com caracterização contida e barreira de fidelidade

Data: 2026-11-11 · Status: implementado na branch `feat/assinatura-meio-termo`, sem PR (aguarda o segundo piloto)

Muda o prompt que gera o texto e o roteiro de áudio de cada perfil BrainHex no microservice
(`buildContentGenerationInstruction`, em `microservice/src/services/geminiService.ts`) e acrescenta,
depois da geração, uma barreira local contra informação que não está no material do professor.

## Por quê

O teste de 11/11 gerou o mesmo material (busca binária em Python) com o `gemini-3.6-flash` de
produção, para Seeker, Survivor e Mastermind, com o prompt de hoje e com a assinatura editorial do
Python acrescentada. A avaliação está em
[`docs/analises/2026-11-11-avaliacao-assinatura-editorial/relatorio.md`](../../analises/2026-11-11-avaliacao-assinatura-editorial/relatorio.md),
com notas, textos gerados e medidas ao lado.

- **A fantasia vem do prompt base, não do perfil.** Ele pede "ambientação mística/medieval",
  "Didática Alquímica", "Grimório", "analogias temáticas" e "mini-cenário lúdico" para todos. O
  perfil entra só como nome, guia e uma dica de uma linha (`'seeker': Linguagem evocativa`). O
  Seeker de hoje sai com "viajante das ciências arcanas", cerca de 21 itens temáticos e 28,7
  exclamações por mil palavras no áudio.
- **A assinatura muda a retórica na direção certa**, mas os marcadores linguísticos obrigatórios
  ("mitigar", "trade-off", "hipótese") empurram o modelo a encaixar palavra onde o conceito não
  cabe. Os desvios técnicos dobraram no Survivor (cerca de 5 para 10) e o Mastermind ficou com cerca
  de 10, entre eles dois itens de checklist inventados ("ponto flutuante", "erros de inferência") e
  "ganho exponencial".
- **Não existe barreira depois da geração.** `validateBlockBatchGeneration` confere formato,
  identidade dos blocos e extensão mínima. A checagem automática de fatos do teste aprovou os cinco
  textos; a leitura contra o material, com o código executado, achou de 5 a 10 desvios em cada um.
- **A literatura não sustenta casar tipo de jogador com estilo de texto** (BrainHex separa cerca de
  3 fatores, não 7 tipos; a lógica é a dos estilos de aprendizagem). O que tem evidência vale para
  todos: tirar o enfeite que não ensina, tom de conversa, refutar o erro comum e fechar com o aluno
  fazendo algo. O perfil fica como camada de tom, e é assim que a monografia deve descrevê-lo.
- **O prompt tem um defeito de interpolação.** `Se ${profile} for 'seeker'` sai "Se mastermind for
  'seeker'", e os três tons de narrador vão para todos os perfis de narração solo.

## Decisões (Geisbelly, 11/11)

1. **Lúdico: guia com voz e cena curta.** O guia narra com personalidade; cada capítulo pode abrir
   com uma cena de 1 a 2 frases. No corpo, metáfora só quando espelha o conceito. Sem "grimório" e
   "alquímico" por padrão.
2. **Fechamento: desafio curto e depois o fechamento do perfil.** O desafio usa só o que o capítulo
   ensinou e traz a resposta logo abaixo.
3. **Barreira: regras no prompt e checagem local.** Nenhuma chamada de modelo a mais; a cota do
   Gemini é só a gratuita.
4. **Achado que a barreira não corrige: publica e registra.** O aluno recebe o capítulo; o achado
   fica gravado. Mostrar ao professor fica para depois.
5. **Fonte da assinatura no microservice: cópia com teste de paridade** contra
   `_BRAINHEX_EDITORIAL_SIGNATURES`.

## 1. Prompt

### Camada comum (os 7 perfis)

Sai do texto e do roteiro: "ambientação mística/medieval", "Didática Alquímica", "Grimório",
"analogias temáticas" obrigatórias e o "mini-cenário lúdico" obrigatório em cada conceito. A regra 3
("Exemplos e Analogias") passa a pedir exemplos do material e analogia só quando ela mapeia o
conceito. A regra 2 (descrição visual "Alquímica/2D Mágica") fica como está: é dos slides, fora deste
escopo.

Entra:

- **Abertura.** Uma cena de 1 a 2 frases com o guia. Com arco da turma
  (`buildClassStoryArcSection`), a cena se passa nele; sem arco, usa o próprio exemplo do material
  (as fichas, a lista de números), sem ambientação inventada. Depois da cena, a abertura do perfil.
- **Metáfora.** Só quando espelha a estrutura do conceito, e o texto diz qual parte corresponde a
  qual (as fichas descartadas são a metade descartada). Metáfora que só enfeita é proibida.
- **Erro comum.** Quando o material traz um erro típico, o texto mostra o erro, por que ele falha e
  a versão correta.
- **Desafio.** No fim de cada capítulo, antes do fechamento do perfil, uma linha `**Desafio:**` com
  uma pergunta ou mini-rastreio feito só com o que o capítulo ensinou, e logo depois uma linha
  `**Resposta:**`. No áudio, o narrador faz a pergunta, dá uma pausa falada ("pense um instante") e
  responde.
- **Forma.** No máximo 2 exclamações por capítulo. Código sempre em bloco cercado, copiado do
  material. Números no áudio por extenso (a regra já existe; o piloto mostrou que não é seguida).
- **Áudio.** A cena de abertura vem **depois** do marcador `## <título>`. Os roteiros dos
  capítulos são juntados (`consolidateBlockBatchGenerations`) antes de `splitAudioByMarkdownTitles`
  cortar por marcador: o que vem antes do `##` de um capítulo cai no fim da parte do capítulo
  **anterior**, e o aluno ouve a abertura do capítulo 2 no fim do áudio do capítulo 1 (só o trecho
  antes do primeiro marcador de todos é que se junta à primeira parte).

Fica: a regra 1 (Fidelidade Absoluta), a estrutura por bloco, os headings `##` como pontos de corte,
a definição de termo na primeira aparição, a retomada explícita e a proibição de lista de uma linha.
O "uso no contexto" continua, sem a exigência de que seja lúdico.

### Camada de perfil (assinatura)

- Entram os campos `tom_voz`, `ritmo`, `abertura_estilo`, `convencimento_estilo`,
  `progressao_narrativa`, `fechamento_estilo` e `proibicoes_estilo`, numa seção própria, como no
  teste de 11/11.
- `marcadores_linguisticos` entra como **vocabulário opcional**: usar só onde o sentido técnico
  permite, nunca no lugar de um termo técnico nem para nomear algo que o material não nomeia.
- A dica de uma linha de hoje (`'mastermind': Lexicografia técnica.` etc.) sai; a assinatura a
  substitui.
- Regras próprias, porque o piloto mostrou o risco:
  - **Survivor:** o risco da abertura é um erro real do material (os erros de fronteira, o custo de
    ordenar), nunca um risco genérico ("falha catastrófica"). O checklist do fechamento vem depois
    de uma linha `**Checklist:**` e só tem itens que estão no bloco.
  - **Mastermind:** frases de até cerca de 20 palavras; "trade-off" só para escolha entre duas
    opções com custo, nunca para pré-requisito.
  - **Seeker:** a pergunta de abertura é respondida no capítulo; uma palavra-chave da metáfora
    ("pista") nomeia uma coisa só.
- Para os outros quatro perfis vale a assinatura que já existe no Python, sem regra própria. O
  segundo piloto (seção 5) cobre três perfis; os outros quatro herdam a camada comum e a barreira.
- **Narrador.** Cada perfil de narração solo recebe só o próprio tom (corrige o defeito de
  interpolação). O Socializer, em diálogo, continua sem marcação `[Tom: ...]`.

### Fonte da assinatura

`microservice/src/constants/editorialSignatures.json`, com as chaves do Python (incluindo a grafia
`"Socialiser"`) e os mesmos campos. O TypeScript importa o JSON e mapeia o `BrainHexProfile` para a
chave. O teste `api/tests/test_assinatura_editorial_paridade.py` carrega o JSON e compara campo a
campo com `_BRAINHEX_EDITORIAL_SIGNATURES`; mudou de um lado só, o teste quebra. Os campos que só o
Python usa hoje (`narrativa_preferencial`) entram também no JSON: a paridade é do dicionário
inteiro, os 9 campos dos 7 perfis, e não de um recorte. `framing_narrativo` e os campos de voz são
das personas dos guias (`_BRAINHEX_GUIDE_PERSONAS`), não da assinatura, e ficam fora.

## 2. Barreira de fidelidade

Módulo puro novo, `microservice/src/services/fidelityGuard.ts`. Não chama modelo, não lança erro, não
reescreve frase: só **remove** o que não se sustenta e **cerca** código.

```ts
type AchadoDeFidelidade = {
  blockId: string;
  campo: "markdown" | "audioScript";
  tipo: "codigo_sem_cerca" | "codigo_fora_da_fonte" | "item_sem_apoio"
      | "numero_fora_da_fonte" | "generalizacao_fora_da_fonte" | "desafio_sem_resposta";
  trecho: string;          // até 160 caracteres
  acao: "cercado" | "removido" | "registrado";
};

function guardarFidelidade(
  block: EnrichedContentBlock,
  chapter: { markdown: string; audioScript: string },
): { markdown: string; audioScript: string; achados: AchadoDeFidelidade[] };
```

**Fonte de comparação:** `conteudo_base`, `conteudo_aprofundado`, `objetivos`, `conceitos_chave`,
`exemplos_contextos` e `ponte_proximo_bloco` do bloco, normalizados (minúsculas, sem acento, espaços
juntados).

| Checagem | Regra | Ação |
|---|---|---|
| Código sem cerca | Linhas de código da fonte (3 ou mais linhas seguidas que aparecem na fonte) soltas no markdown, fora de bloco cercado | Envolve em ```` ``` ```` com a linguagem, se a fonte disser |
| Código fora da fonte | Bloco cercado cujo conteúdo normalizado não está na fonte | Registra (pode ser a versão errada que a refutação mostra) |
| Item sem apoio | Item de lista depois de `**Checklist:**`, ou dentro do `**Desafio:**`/`**Resposta:**`, com menos de um limiar de palavras de conteúdo presentes na fonte, ou com termo entre crases que a fonte não tem | **Remove o item** |
| Número fora da fonte | Número com 3 ou mais dígitos, com separador de milhar ou com `%`, que a fonte não tem | Registra |
| Generalização fora da fonte | Termo de uma lista curta (`exponencial`, `estritamente`, `garante`, `certeza absoluta`, `sempre`, `nunca`, `qualquer`, `todo caso`) quando a fonte não o usa | Registra |
| Desafio sem resposta | `**Desafio:**` sem `**Resposta:**` no mesmo capítulo | Registra |

- **Palavras de conteúdo:** sem stopwords do português, comparadas pelo prefixo de 5 letras. O
  limiar começa em 0,6 e é **calibrado pelos fixtures** (seção 4): tem de remover os dois itens
  inventados do Survivor e manter os verdadeiros. Se nenhum limiar separa os dois, a regra de crase
  e a de termo ausente ficam sozinhas e o limiar sai do desenho.
- **No áudio** só valem as checagens de generalização e de desafio. Números vêm por extenso e não
  há lista nem código.
- **Números pequenos** (os índices do rastreio, 3 comparações) ficam de fora: o texto os calcula.

**Onde roda.** Em `processMediaWithGemini`, depois de `validateBlockBatchGeneration` aceitar o lote
(o valor `validated`), para cada capítulo, seja o provedor Gemini ou o fallback da OpenAI. **Nunca**
dentro de `validateResult`: lá, um erro faz a cascata gerar de novo e gasta cota. Em
`generateAudioScriptsWithGemini` (retomada do áudio, #652) roda só a parte do áudio.

**Onde o achado fica.** Os achados sobem em `ProcessedContent.metadata.fidelidade` e, no pipeline
completo (`/api/personalizar`), são gravados em `conteudo_personalizado.materiais.markdown.metadata.fidelidade`
por `buildMarkdownMaterialEntry`. Na geração por bloco (`/api/v1/generate/block`, Fase A da geração
retomável), quem grava é o worker Python: a barreira corrige o texto do mesmo jeito e os achados
voltam na resposta, em `fidelidade`; gravá-los do lado do Python fica para depois.

```json
{ "versao": "fidelidade-v1", "achados": [ { "blockId": "b2", "campo": "markdown",
  "tipo": "item_sem_apoio", "trecho": "Calcular o ponteiro meio com divisão inteira…",
  "acao": "removido" } ] }
```

E um log `info` por capítulo com achados (contagem por tipo, sem o texto do aluno). A barreira não
mexe em `materiais.<tipo>.revisao`: ela roda antes de o material ser gravado, então o texto gravado
já é o corrigido.

## 3. Áudio

- Tom do narrador só do próprio perfil (seção 1).
- Cena de abertura depois do marcador `##` (seção 1).
- As marcações `[Tom: ...]` ficam como estão. `generateNaturalAudio` as manda ao TTS sem limpar e
  ninguém verificou se o TTS as fala. O segundo piloto verifica com um arquivo **mudo** (transcrição
  do áudio gerado, nunca tocado em voz alta); se forem faladas, a correção vira trabalho próprio.

## 4. Testes

**Microservice** (entram no script `test` do `package.json`, que lista os arquivos um a um):

- `fidelityGuard.test.ts`, com os cinco textos do piloto como fixtures (copiados de
  `docs/analises/2026-11-11-avaliacao-assinatura-editorial/notas/dados/gen/` para
  `microservice/src/services/__fixtures__/fidelidade/`). Casos obrigatórios:
  - remove "ponto flutuante" e "erros de inferência" do checklist do Survivor e mantém
    `inicio = meio + 1` e o retorno `-1`;
  - cerca o código do Mastermind;
  - registra "ganho exponencial" e "cresce exponencialmente";
  - nenhum achado nos trechos que a leitura considerou corretos (o rastreio do 37, 11 contra 1.024).
- `contentGenerationInstruction.test.ts`, para os 7 perfis: nenhum "mística", "medieval",
  "Alquímica" ou "Grimório"; todos os campos da assinatura presentes; os marcadores marcados como
  opcionais; só o tom de narrador do próprio perfil; a regra da cena depois do `##`; o formato
  `**Desafio:**` / `**Resposta:**`; o arco da turma continua vencendo a ambientação.

**API:** `test_assinatura_editorial_paridade.py` (seção 1).

Antes de subir: os comandos do `ci.yml` para `microservice` e `api`, no pacote inteiro.

## 5. Segundo piloto (antes de subir a versão)

- Prompt novo, Seeker, Survivor e Mastermind, **2 tópicos** (busca binária e um tópico fora de
  programação, tirado de uma turma real) e **2 repetições**: 12 chamadas. Mais o Mastermind com o
  prompt de hoje, que faltou no teste de 11/11: 1 chamada.
- Mesma configuração de produção do teste de 11/11 (`gerar-gemini.ts`). Se a cota do dia não der,
  divide em dois dias; a cota reservada ao teste do RAG em sala não é usada.
- Leitura com os critérios do relatório (fidelidade contra o material, enfeite, abertura,
  fechamento, desafio) e a barreira rodada sobre as saídas.
- **Passa se:** nenhuma afirmação inventada sobrevive à barreira; o perfil é reconhecível sem
  olhar o rótulo; a fantasia decorativa fica abaixo da do prompt de hoje; todo capítulo tem desafio
  com resposta.
- O resultado vai para Geisbelly antes do PR.

## 6. Entrada em produção

- Um PR só, da branch `feat/assinatura-meio-termo` (a partir da `main`).
- No PR: prompt, barreira, JSON da assinatura, paridade, testes e **uma** subida de versão.
  `MEDIA_PIPELINE_VERSION` em `api/app/services/media_contract.py` e em
  `microservice/src/constants/pipelineVersions.ts` mudam juntos
  (`pipelineVersions.contract.test.ts` quebra se não mudarem).
- O PR só é aberto depois de aprovado o resultado do segundo piloto.
- O mesmo PR corrige o CLAUDE.md, que diz que a assinatura é "replicada no prompt do microservice
  (`geminiService.ts`)". Hoje não é; depois deste PR passa a ser, pelo JSON.

## Fica para depois

- Mostrar os achados de fidelidade ao professor no console.
- Gravar os achados da geração por bloco (`/api/v1/generate/block`) do lado do worker Python.
- Resposta do desafio recolhível no app (`react-native-markdown-display` não tem bloco recolhível).
- As marcações `[Tom: ...]`, se o piloto mostrar que o TTS as fala.
- Regras próprias para Daredevil, Conqueror, Socializer e Achiever, se um piloto com eles mostrar
  necessidade.

## Riscos

- **Falso positivo da barreira** remove item verdadeiro. Calibrado pelos fixtures; o achado guarda o
  trecho removido, então dá para medir em produção.
- **Achados registrados viram ruído** se a lista de generalizações for larga. Começa curta.
- **Regerar todas as turmas** com a cota gratuita pode levar dias. A fila já trata cota esgotada;
  o piloto não muda isso, só confirma que uma subida basta.
- **A barreira não pega erro conceitual em prosa** ("superestimar o ganho", "compensa
  financeiramente"). Fica assumido: pegar isso exige um segundo passe de modelo, que a decisão 3
  descartou.
