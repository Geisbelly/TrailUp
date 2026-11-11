# Leitura atenta dos cinco textos do teste A/B da assinatura editorial

Leitura manual e medição local, sem chamar nenhum LLM. Os cinco textos são seeker-atual, seeker-assinatura, survivor-atual, survivor-assinatura e mastermind-assinatura (gemini-3.6-flash, `confidence = 1` em todos). Não existe mastermind-atual, porque a cota acabou. Cada texto tem dois capítulos, b1 e b2, cada um com markdown e audioScript.

Fontes (caminhos locais; cópias em `dados/`, ao lado destas notas):
- [Saídas](dados/gen/conteudos.gemini.json): os cinco textos. Citados como "texto|bloco|md" ou "texto|bloco|áudio".
- [Fonte](dados/blocos.json): os blocos b1 e b2, que são a verdade de referência.
- [Assinaturas](dados/assinaturas.json) e [prompts](dados/gen/): `*-atual.system.txt` e `*-assinatura.system.txt`. Pelo `diff`, a única diferença entre as duas variantes é o bloco "ASSINATURA EDITORIAL…", com 13 linhas.
- [Medidas próprias](dados/leitura/medidas_leitura.json), geradas por `dados/leitura/medir_leitura.py`. Antes da contagem, o script retira o código cercado, o código inline e as tags `[Tom: …]`, por isso as contagens de palavras ficam abaixo das de `medidas.gemini.json`.
- [Execução de verificação](dados/leitura/conferir.py): roda o código da fonte e as duas variantes com erro.
- [Sobreposição de 5-gramas](dados/leitura/sobreposicao.py).
- [Código de produção](../../../../microservice/src/services/geminiService.ts), consultado para saber o que acontece com o áudio.

Verdade de referência, conferida por execução (`conferir.py`). Na busca de 37 em `[3, 8, 15, 21, 37, 42, 56]`, a sequência (inicio, fim, meio, valor) é (0,6,3,21) → (4,6,5,42) → (4,4,4,37), com retorno 4 em 3 comparações. O máximo de comparações é ⌊log2 n⌋+1: 11 para n = 1.024, 12 para n = 2.048 e 20 para n = 1.000.000 (log2 ≈ 19,93). Com `inicio < fim`, deixam de ser achados os alvos 3, 15, **37** e 56: o próprio exemplo do material falha. Com `inicio = meio`, entram em laço infinito os alvos 56 e 60 (ausente e maior), mas não os demais. O código da fonte **não** funciona em lista decrescente: buscar 37 ou 8 devolve -1. Ele **funciona** com elementos repetidos, ou seja, a ordenação não precisa ser estrita.

---

## 1. Fidelidade à fonte: afirmações fora de blocos.json, imprecisões e erros

### Takeaway
Nenhum dos cinco textos erra o núcleo: código, rastreio, 11 contra 1.024, cerca de 20 passos e O(n log n) aparecem certos em todos. Os desvios ficam na periferia:
- **Explicações inventadas:** "ponto flutuante" e "erros de inferência" no checklist de survivor-assinatura.
- **Generalizações falsas para o código dado:** lista "decrescente" serve, em seeker-atual e em mastermind; ordem "estrita" é exigida, em quatro textos.
- **Hipérboles imprecisas:** "ganho exponencial" (mastermind) e "cresce exponencialmente" (survivor-atual).
- **Erros de língua:** "superestimar o ganho", "compensa financeiramente", "pontimentos", "minus".

A assinatura não reduziu esses desvios. Em survivor-assinatura e em mastermind-assinatura, parte deles vem justamente da inserção forçada dos marcadores da assinatura.

### Cited Findings

**Classificação usada:** elaboração inofensiva (correta, só não está na fonte), imprecisa, errada e inventada (afirmação sem base na fonte e de mérito duvidoso).

**seeker-atual**
- md b1: busca binária como "estratégia de divisão e conquista" é **elaboração inofensiva**, um rótulo correto que não é definido no texto. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "em ordem crescente (ou decrescente)" é **imprecisa**. O código ensinado devolve -1 numa lista decrescente. — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)
- md b1: "dois ponteiros ou **índices inicio e fim**" é **elaboração inofensiva**. Python não tem ponteiros, mas "dois ponteiros" é idioma corrente da área. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "o padrão de projeto determina o retorno -1" é **imprecisa**, porque "padrão de projeto" é termo técnico de outra coisa. Aqui é só uma convenção. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2, erro 1: "falhará em encontrar elementos localizados nas extremidades" é **imprecisa e incompleta**. Na execução, com `<` falham 3, 15, 37 e 56, isto é, também elementos internos, inclusive o 37 do exemplo. — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)
- md b2, erro 2: estende o caso para "`fim = meio` em vez de `meio - 1`", que é **elaboração correta**. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "log2(1024) = 10, somando mais 1 para a verificação final" e o exemplo de 2.048 com 12 comparações são **elaborações corretas**. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "não compensa financeiramente em termos de processamento" é **imprecisa**, um erro de registro. A fonte fala de custo computacional, não de dinheiro. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "meio igual a inicio mais fim, divididos por dois" é **imprecisa**, porque omite a divisão inteira no áudio. — [Saídas](dados/gen/conteudos.gemini.json)

**seeker-assinatura**
- md b1: "Para uma lista pequena de 10 itens, isso não é um problema" é **elaboração inofensiva**. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "a busca linear poderia ter exigido até 5 comparações para chegar ao 37" é **elaboração correta**, já que 37 é o quinto elemento. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "a lista precisa estar estritamente ordenada" é **imprecisa**. Com repetidos, o código acha o alvo (8 em `[3,8,8,8,15]` → índice 2). — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)
- Áudio b1: "reduz tudo a apenas vinte comparações" é **imprecisa** porque perdeu o "cerca de" da fonte. — [Saídas](dados/gen/conteudos.gemini.json); [Fonte](dados/blocos.json)
- md b2: "o custo de ordenar antes pode superestimar o ganho" é **errada como língua**. O sentido pretendido é "superar", e a frase como está não faz sentido. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "eficiência astronômica" é hipérbole e **imprecisa**. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: o laço infinito ocorre porque "as variáveis inicio ou fim nunca se alteram" é **correta**. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "medir exatamente o tempo e os passos" é **elaboração**. A fonte fala só de passos. — [Saídas](dados/gen/conteudos.gemini.json)

**survivor-atual**
- md b2: "medir o comportamento do algoritmo à medida que … `n` cresce exponencialmente" é **errada**. A análise assintótica descreve o crescimento do custo em função de n, e n não precisa crescer exponencialmente. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "Ordenar um vetor desordenado custa no mínimo O(n log n) utilizando algoritmos eficientes" é **imprecisa**. O texto mistura limite inferior e custo típico; a fonte diz apenas "O(n log n)". — [Saídas](dados/gen/conteudos.gemini.json); [Fonte](dados/blocos.json)
- md b2: para uma única busca, a busca linear O(n) "é mais rápido" que ordenar. É **elaboração correta** e explicita o trade-off. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "Em sistemas críticos de monitoramento, essa lentidão gera gargalos inaceitáveis" é **elaboração inventada**, porém inofensiva. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "a lista precisa estar estritamente ordenada" é **imprecisa**, pelo mesmo motivo de seeker-assinatura. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: a analogia "procurar água potável testando cada poço" é um **exemplo novo** que não está na fonte. A metáfora é correta para a busca linear, mas viola a instrução do prompt ("não invente exemplos"). — [Saídas](dados/gen/conteudos.gemini.json); [prompt](dados/gen/survivor-atual.system.txt)
- Áudio b2: "a divisão inteira vai travar o cálculo no mesmo ponto e o código entrará em um laço infinito" é **imprecisa**, porque afirma como certo. A fonte diz "pode não terminar", e na execução só os alvos 56 e 60 travam. O mesmo trecho diz que o erro costuma "derrubar sistemas em produção", o que é hipérbole. — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)

**survivor-assinatura**
- md b1, checklist: "Calcular o ponteiro `meio` com divisão inteira para evitar falhas de ponto flutuante" é **imprecisa e inventada**. O motivo real é que um índice de lista precisa ser inteiro (`lista[3.0]` levanta TypeError). "Falhas de ponto flutuante" sugere erro de arredondamento, que não é o problema. A fonte não justifica o `//`. — [Saídas](dados/gen/conteudos.gemini.json); [Fonte](dados/blocos.json)
- md b1, checklist: "Mitigar erros de inferência garantindo que a lista não sofra alterações durante a execução" é **inventada**. "Erros de inferência" não tem sentido nesse contexto, e o cuidado com modificação concorrente da lista não está na fonte. O item parece existir para encaixar o marcador "mitigar". — [Saídas](dados/gen/conteudos.gemini.json); [Assinaturas](dados/assinaturas.json)
- md b1, "NA PRÁTICA": "chave de segurança número 56 em uma lista desorganizada de 1.000.000 de chaves", junto com "mitigar a falha de requisição em uma lista não ordenada", é um **exemplo inventado**. A ilustração da busca linear está correta, mas o enquadramento ("falha de requisição") não tem relação técnica com o conteúdo. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "falhas de sistema por tempo limite" é **elaboração inventada**, plausível. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "o volume cresce de forma desproporcional" é **imprecisa**. O custo da busca linear cresce *proporcionalmente* a n, e o próprio texto diz isso adiante, em b2. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "a lista precisa estar estritamente ordenada" é **imprecisa**, como acima. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: ao abrir, o texto cita como falhas possíveis "laços infinitos ou leituras fora da faixa permitida". O segundo item é **inventado**: nenhum dos dois erros da fonte provoca acesso fora da faixa no código dado. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: `inicio > fim` indica "com certeza absoluta" que o alvo não está na lista. É **imprecisa**, pois só vale se a lista estiver ordenada. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "estrutura exata e testada" é **afirmação não verificável**. O modelo não testou nada. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2, checklist: "Incrementar e decrementar o índice central (`inicio = meio + 1` e `fim = meio - 1`)" é **imprecisa na redação**, porque quem muda são os limites, não `meio`. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "encontramos o valor em três passos, mitigar o tempo de processamento ao extremo" é **errada como língua**: o verbo está solto, provavelmente marcador forçado. — [Saídas](dados/gen/conteudos.gemini.json)
- Ponto positivo: "a busca linear exige até 1.024 comparações adicionais" ao dobrar n, e "Notação Big-O" definida na mesma frase, estão **corretos**. — [Saídas](dados/gen/conteudos.gemini.json)

**mastermind-assinatura**
- md b1: "esse padrão exprime um ganho exponencial", dito sobre 1.000.000 → 20 passos, é **imprecisa**. A razão n/log2 n é enorme, mas chamá-la de "exponencial" é uso solto. Num perfil "analítico e preciso", é exatamente o tipo de afirmação que a assinatura deveria evitar. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "relação de precedência estrita, seja ela ascendente ou descendente" é **imprecisa em dois pontos**. Ordem estrita não é exigida, e o código dado falha em lista descendente. — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)
- md b1: "existe um trade-off arquitetural indispensável: a busca binária exige rigorosamente uma lista ordenada" é **imprecisa**, porque um pré-requisito não é trade-off. O trade-off verdadeiro, o custo de ordenar, só aparece em b2. É o marcador "trade-off" forçado. — [Saídas](dados/gen/conteudos.gemini.json); [Assinaturas](dados/assinaturas.json)
- md b1: "traria a evidência de uma falha catastrófica" é **imprecisa**: "evidência" está usado como enfeite e "catastrófica" é sensacionalista. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1: "Se formularmos a hipótese de uma base de dados contendo 1.000.000" usa "hipótese" como "suponha". É **inofensiva**, mas forçada. — [Saídas](dados/gen/conteudos.gemini.json)
- md b1/b2: "subconjunto de memória" e "coincidem na mesma posição de memória" são **imprecisas**. O que se compara são índices da lista, não posições de memória. — [Saídas](dados/gen/conteudos.gemini.json)
- md b2: "amortizando o investimento inicial da ordenação ao longo do tempo" e "O(n log n) é computacionalmente mais caro do que … O(n)" são **elaborações corretas** e justificadas. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "dois pontimentos de limite" é **errada**, uma não-palavra que o TTS vai pronunciar. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "atualizamos fim para meio minus um" é **errada**, inglês no meio do português. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b1: "um milhão de checagens manuais" é **errada**, porque a checagem não é manual. — [Saídas](dados/gen/conteudos.gemini.json)
- Áudio b2: "não somar ou subtrair um faz com que o laço fique preso" é **imprecisa**, porque afirma como certo um caso que a fonte trata como possibilidade. — [Saídas](dados/gen/conteudos.gemini.json)

**Verificação automática anterior:** `fatos.gemini.json` registra lista vazia de fatos errados para os cinco textos. Ou seja, a checagem automática de fatos numéricos não pegou nenhum dos desvios acima, todos qualitativos. — [fatos.gemini.json](dados/gen/fatos.gemini.json)

### Inferences
- **Desvios por texto** (contagem aproximada, só os imprecisos, errados ou inventados, sem as elaborações corretas): seeker-atual ≈ 5, seeker-assinatura ≈ 5, survivor-atual ≈ 5, survivor-assinatura ≈ 10, mastermind-assinatura ≈ 10.
- **Survivor:** a assinatura **aumentou** os desvios. Vários nascem do esforço de usar "mitigar", "resiliência" e o enquadramento de segurança em conceitos que não pedem isso: "ponto flutuante", "erros de inferência", "falha de requisição", "leituras fora da faixa".
- **Mastermind:** "trade-off", "evidência", "hipótese" e "modelo" aparecem em sentido errado ou decorativo, o que desmente o "analítico e preciso".
- **Seeker:** a assinatura trocou um tipo de erro por outro. Saíram "padrão de projeto" e "financeiramente"; entraram "superestimar" e "estritamente".
- **Falso "estritamente ordenada":** aparece em quatro dos cinco textos (seeker-assinatura, survivor-atual, survivor-assinatura e mastermind), com e sem assinatura. Provavelmente é um viés do modelo e não efeito da assinatura.
- **Lacuna comum:** nenhum texto aproveita o fato pedagogicamente valioso de que, com `inicio < fim`, o próprio exemplo (37) deixa de ser encontrado.

### Gaps
- A classificação de gravidade é julgamento do leitor e não passou por segundo avaliador; não há medida de concordância.
- Não verifiquei se "ganho exponencial" seria aceito como uso corrente por docentes de Computação. A classificação "imprecisa" é conservadora.

---

## 2. Cobertura: os objetivos e os itens da fonte são ensinados ou só mencionados?

### Takeaway
No markdown, os cinco textos cobrem todos os itens da fonte, e o rastreio de 37 está correto passo a passo nos cinco.

**b2 sem rastreio próprio.** A fonte põe o exemplo "Rastrear busca_binaria(…, 37) passo a passo" em **b2**. Só survivor-assinatura refaz o rastreio no capítulo b2, e é o mais completo de todos (mostra a condição do laço a cada iteração). Os outros quatro deixam b2 sem rastreio, apoiados em b1, embora o prompt exija que cada capítulo "se sustente sozinho".

**Áudio.** A cobertura é desigual. O rastreio sai completo no áudio de mastermind, quase completo em survivor-atual, e reduzido a uma frase nos dois capítulos de survivor-assinatura.

### Cited Findings

**Cobertura no markdown** (✔ = ensinado com explicação; ~ = mencionado sem explicação; ✘ = ausente):

| Item da fonte | seeker-atual | seeker-assin. | survivor-atual | survivor-assin. | mastermind-assin. |
|---|---|---|---|---|---|
| O1 linear lenta (n comparações, 1.000.000) | ✔ | ✔ | ✔ | ✔ | ✔ |
| O2 ideia + condição de lista ordenada, com o porquê | ✔ | ✔ (seção própria) | ✔ | ✔ | ✔ |
| inicio/fim, meio=(i+f)//2, 3 casos | ✔ | ✔ | ✔ | ✔ | ✔ |
| Dicionário | ✔ | ✔ | ✔ | ✔ (curto) | ✔ |
| Rastreio 37 em b1 | ✔ correto | ✔ correto | ✔ correto, mostra sublistas | ✔ correto | ✔ correto (em prosa) |
| Rastreio 37 em b2 (exemplo de b2 na fonte) | ✘ | ✘ | ✘ | ✔ correto, com `inicio <= fim` por iteração | ✘ |
| ~20 passos para 1.000.000 | ✔ | ✔ | ✔ | ✔ | ✔ |
| Código Python | ✔ cercado | ✔ cercado | ✔ cercado | ✔ cercado | **~ sem cerca** (ver seção 4) |
| `while inicio <= fim`, `inicio > fim` → -1 | ✔ | ✔ | ✔ | ✔ | ✔ |
| Erro 1 (`<`) | ✔ ("extremidades", impreciso) | ✔ | ✔ ("falsos negativos") | ✔ | ✔ |
| Erro 2 (`inicio = meio`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| O(log n) × O(n), log2(n) | ✔ | ✔ | ✔ | ✔ (Big-O definido) | ✔ (assintótica definida) |
| 11 × 1.024 (com o porquê do +1) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Dobrar n → +1 passo | ✔ (12) | ✔ (12) | ✔ (12) | ✔ (11→12) | ✔ (sem citar 12) |
| O(n log n): só compensa com muitas buscas | ✔ | ✔ | ✔ (+ linear para busca única) | ✔ (+ linear para busca única) | ✔ (+ amortização) |
| Ponte para o próximo bloco no md | b1 ✔, b2 ✘ | b1 ✔ (pergunta), b2 ✔ (convite) | b1 ✘, b2 ✘ | ✔ ✔ (literal da fonte) | ✔ ✔ |

Fonte de todas as linhas: leitura de [Saídas](dados/gen/conteudos.gemini.json) contra a [Fonte](dados/blocos.json), com rastreio conferido por [execução](dados/leitura/conferir.py).

- **Rastreio no markdown, conferido valor a valor:** todos os cinco mostram (0,6)→meio 3 (21)→inicio 4; (4,6)→meio 5 (42)→fim 4; (4,4)→meio 4 (37), índice 4, 3 comparações. Nenhum erro aritmético. Detalhes de alguns textos:
  - survivor-atual lista as sublistas descartadas (`[3, 8, 15, 21]`, `[42, 56]`), o que está certo.
  - survivor-atual, survivor-assinatura e seeker-assinatura comparam com "5 comparações" da linear, também certo.

  — [Saídas](dados/gen/conteudos.gemini.json); [execução](dados/leitura/conferir.py)
- **Rastreio no áudio:**
  - mastermind: três passos com inicio, fim, meio e valor por extenso, o mais completo.
  - survivor-atual: valores 21 e 42 e índice quatro, sem os índices intermediários.
  - seeker-atual: valores 21 e 42 e "índice quatro", sem inicio e fim.
  - seeker-assinatura: valores 21 e 42; diz "chegamos exatamente na posição do 37", sem índice.
  - survivor-assinatura b1: "olhamos o elemento central, descartamos a metade irrelevante e encontramos", sem nenhum valor intermediário.
  - survivor-assinatura b2: "ajusta inicio e fim passo a passo até convergir no índice quatro".

  — [Saídas](dados/gen/conteudos.gemini.json)
- **Código no áudio de b2:**
  - mastermind verbaliza a função linha a linha: inicialização, laço, meio, os três ramos e o retorno.
  - survivor-atual verbaliza a inicialização, o laço e o meio, mas não os ramos.
  - seeker-atual, seeker-assinatura e survivor-assinatura citam apenas o laço e o -1.

  — [Saídas](dados/gen/conteudos.gemini.json)
- **Caso de igualdade:** o áudio b1 de seeker-assinatura omite que a busca termina quando o meio é igual ao alvo; só trata "maior" e "menor". — [Saídas](dados/gen/conteudos.gemini.json)
- **Áudio quase colado na fonte:** em survivor-assinatura, 30% (b1) e 22% (b2) dos 5-gramas do áudio aparecem literalmente na fonte; nos demais, entre 0% e 12%. O áudio dessa variante parafraseia pouco e recorta muito. — [sobreposição](dados/leitura/sobreposicao.py)

### Inferences
- **O núcleo matemático é robusto ao prompt:** 11, 1.024, 20 e 3 passos sobrevivem em todas as variantes. A variação está em **quanto se ensina** do procedimento, sobretudo no áudio, e não em **se** o fato aparece.
- **survivor-assinatura cumpre melhor o exemplo de b2** (rastreio por iteração, com o teste da condição do laço) e mantém as pontes literais. Em contrapartida, tem o áudio mais pobre de exemplos trabalhados.
- **O "porquê" da ordenação é explicado em todos.** O de seeker-assinatura é o mais explícito, porque o texto diz qual premissa (esquerda menor, direita maior) quebra.

### Gaps
- "Ensinado com explicação" foi julgado pelo leitor; não houve rubrica com segundo avaliador.
- Não medi compreensão de alunos. A cobertura aqui é do texto, não do aprendizado.

---

## 3. Material decorativo e temático e marcas de interlocução

### Takeaway
A versão "atual" do Seeker é a mais carregada de fantasia: grimório, feitiço, viajante das ciências arcanas, "Fragmento de Poder". Tem cerca de 20 itens temáticos, dos quais só 2 ou 3 se ligam ao conceito, e 19 exclamações no áudio.

A assinatura do Seeker troca a fantasia por um léxico de "pistas", "mapear" e "explorar". Esse léxico é mais contido, mas "pista" é usado para três coisas diferentes, o que mostra mapeamento inconsistente.

A versão atual do Survivor usa uma camada de sobrevivência ("selva", "suprimento", "inventário") com algumas metáforas bem ligadas (poço = varredura linear). A assinatura do Survivor a substitui por um enquadramento de risco operacional, sem fantasia, mas com marcadores forçados.

O mastermind quase não tem fantasia e não tem exclamações. Nenhum dos cinco faz uma única pergunta de prática (do tipo "calcule", "quantos passos para achar 56?").

### Cited Findings

**Marcas de discurso** (medidas aproximadas; regex simples, ver `medir_leitura.py`; "exclam./mil" = por mil palavras limpas):

| Texto (md / áudio) | Palavras* | "!" | "!"/mil | "?" | "você" | seu/sua | vamos/nós/nosso | imperativos** | tags [Tom] |
|---|---|---|---|---|---|---|---|---|---|
| seeker-atual md | 942 | 3 | 3,2 | 0 | 2 | 3 | 3 | 3 | – |
| seeker-atual áudio | 662 | 19 | 28,7 | 1 | 6 | 0 | 3 | 7 | 9 |
| seeker-assin. md | 1053 | 3 | 2,8 | 5 | 5 | 4 | 1 | 2 | – |
| seeker-assin. áudio | 659 | 13 | 19,7 | 4 | 5 | 2 | 5 | 8 | 15 |
| survivor-atual md | 1049 | 0 | 0 | 1 | 5 | 2 | 2 | 3 | – |
| survivor-atual áudio | 786 | 0 | 0 | 0 | 10 | 1 | 6 | 3 | 14 |
| survivor-assin. md | 1182 | 0 | 0 | 0 | 4 | 1 | 2 | 3 | – |
| survivor-assin. áudio | 635 | 0 | 0 | 0 | 2 | 1 | 1 | 4 | 6 |
| mastermind-assin. md | 1127 | 0 | 0 | 0 | 0 | 3 | 2 | 2 | – |
| mastermind-assin. áudio | 843 | 0 | 0 | 0 | 1 | 1 | 2 | 4 | 4 |

\*Sem código e sem tags. \*\*Lista fechada de imperativos ("imagine", "pense", "lembre-se", "veja", "observe", "considere", "preste", "fique", "evite", "atente", "compare", "olha", "cuidado", "convido"); subestima. — [Medidas próprias](dados/leitura/medidas_leitura.json)

**Perguntas e se são respondidas:**
- seeker-assinatura: as 5 perguntas do md são aberturas e fechamentos retóricos. "Como você faria para encontrar uma única pista…?" e "O que acontece quando transformamos…?" são respondidas pelo capítulo. O título "Por que a Lista Deve Estar Ordenada?" é respondido. "Como traduzir essa estratégia em um código…?" é respondida no capítulo seguinte. "Sua mente inquisitiva está pronta…?" não pede resposta.
- survivor-atual: tem 1 pergunta ("Por que a busca linear se torna inviável…?"), respondida na hora.
- seeker-atual: tem 1 pergunta, no áudio ("Incrível, não é?"), retórica.
- **Nenhum texto propõe exercício nem pergunta de verificação** ao aluno.

— [Saídas](dados/gen/conteudos.gemini.json)

**Inventário de passagens temáticas, com julgamento** (C = conectada, a metáfora mapeia o conceito; D = decoração ou detalhe sedutor; H = hipérbole):

- **seeker-atual md** (cerca de 15 itens):
  - "vastas terras dos algoritmos… oceano de dados" (D)
  - "grimório ancestral com 1.000.000 de páginas… feitiço folheando folha por folha" (**C**: mapeia a varredura linear e carrega o número da fonte)
  - "antiga sabedoria revela um atalho magistral" (D)
  - "executar essa travessia" (D)
  - "território onde o alvo ainda pode estar", "novo território", "nova fronteira" (C fraca: território = intervalo)
  - "a jornada se encerra com vitória" (D)
  - "o poder de redução é avassalador" (H)
  - título "O Rastreio do Fragmento de Poder" (D: o título não sinaliza o conteúdo)
  - "forjar a sua implementação" (D)
  - "o elemento não habita a lista" (D)
  - "os aprendizes frequentemente caem" (D)
  - título "Armadilhas no Caminho" (C fraca: armadilha = erro de limite)
  - "laço infinito devastador", "contraste monumental", "Propriedade Extraordinária", "brilha intensamente" (H)
- **seeker-atual áudio:**
  - "Saudações, viajante das ciências arcanas!" (D)
  - "grande mistério da navegação pelos dados" (D)
  - grimório e feitiço (C)
  - "atalho supremo" (D)
  - "resultado será desastroso" (H)
  - "dominar completamente essa arte" (D)

  — [Saídas](dados/gen/conteudos.gemini.json)
- **seeker-assinatura md e áudio** (cerca de 12 ocorrências do léxico da assinatura: pista ×6, mapear e variantes ×7, explorar e variantes ×4, segundo a contagem do script):
  - "uma única pista perdida em meio a um milhão de registros" (pista = **valor-alvo**, C)
  - "Redefinimos as pistas: `inicio = 3 + 1 = 4`" e "Quando as pistas se cruzam e `inicio` se torna maior que `fim`" (pista = **índices**, metáfora trocada)
  - no áudio, "investigamos todas as pistas" (pista = **posições examinadas**)
  - "a pista que estava procurando" (de novo = alvo)
  - "para essa mágica funcionar" (D)
  - "Olá, explorador!" (D)
  - "mar de informações" (D)
  - "eficiência astronômica" (H)
  - "O mapa da busca binária está em suas mãos" (D)
  - a palavra do dicionário escolhida é "Mapear" (C: a analogia funciona e o tema entra sem atrapalhar)
  - **Não há grimório nem feitiço.**

  — [Saídas](dados/gen/conteudos.gemini.json); [medidas](dados/leitura/medidas_leitura.json)
- **survivor-atual md** (cerca de 10 itens):
  - "No ambiente de sobrevivência, tempo e energia são recursos escassos" (C fraca: custo)
  - "localizar um suprimento específico" (alvo, C)
  - "inventário contendo 1.000.000 de itens… ferramenta… no último slot" (**C**: pior caso)
  - "falsa sensação de ausência do recurso" (**C**: falso negativo)
  - título "O Dicionário no Escuro" (**D**: nada na analogia envolve escuridão)
  - palavra buscada "Ração" (D temática, analogia correta)
  - "abordagem tática" (D)
  - título "Rastreando no Inventário" (C fraca)
  - b2 do md não tem léxico temático
- **survivor-atual áudio:**
  - "Na selva do desenvolvimento de código" (D)
  - "procurar água potável testando cada poço" (**C**, mas é exemplo novo)
  - "jogando fora… o recurso de que precisa para sobreviver" (C)
  - "a missão está cumprida" (D)
  - "Na segunda jogada" (iteração = jogada, C fraca)
  - "particionar o terreno" (C fraca)
  - "derrubar sistemas em produção", "congelando o sistema" (H)

  — [Saídas](dados/gen/conteudos.gemini.json)
- **survivor-assinatura** (sem fantasia; enquadramento de risco):
  - "confiar na sorte ou em varreduras cegas é um risco crítico" (C fraca)
  - "chave de segurança número 56" (exemplo inventado)
  - "comprometendo a integridade da operação" (D)
  - "CHECKLIST DE SEGURANÇA" (o rótulo "segurança" não se aplica)
  - "Na sobrevivência do código" e "pode colapsar seu sistema", no áudio (D/H)
  - marcadores: "mitigar" ×5, "resiliência" ×4, "passo a passo" ×4, "evite falhas" ×1, contados pelo script em md e áudio

  — [Saídas](dados/gen/conteudos.gemini.json); [medidas](dados/leitura/medidas_leitura.json)
- **mastermind-assinatura:**
  - fantasia residual: "resgate de dados", "onde o valor desejado ainda pode habitar", "Em um universo de 1.000.000"
  - marcadores: modelo ×8, trade-off ×4, evidência ×3, hipótese ×1
  - hipérboles: "falha catastrófica", "ganho exponencial", "volumes massivos"

  — [Saídas](dados/gen/conteudos.gemini.json); [medidas](dados/leitura/medidas_leitura.json)
- **Origem da fantasia:** o próprio prompt comum às duas variantes pede "ambientação mística/medieval", "Didática Alquímica" e "Linguagem evocativa" para o seeker. A carga de fantasia da versão atual, portanto, é induzida pelo prompt de produção, não é acaso do modelo. — [prompt seeker-atual](dados/gen/seeker-atual.system.txt)

### Inferences
- **No Seeker**, a assinatura reduziu os detalhes sedutores (cerca de 15 → poucos) e a exclamação no áudio (28,7 → 19,7 por mil), e introduziu perguntas de abertura. O risco novo é a metáfora instável da "pista".
- **No Survivor**, a assinatura eliminou as decorações desconectadas ("no Escuro", "selva") e todas as hipérboles de fantasia, mas criou um problema diferente: rótulos de segurança e mitigação colados a conceitos que não os pedem.
- **Nenhum dos cinco usa perguntas como prática de recuperação.** Todas as perguntas são retóricas ou de transição. Isso vale com ou sem assinatura.

### Gaps
- A classificação C/D é julgamento do leitor, sem segundo avaliador.
- A contagem de imperativos usa lista fechada e não pega formas como "descartamos" (1ª pessoa do plural) nem imperativos fora da lista.

---

## 4. Estrutura: abertura, fechamento, títulos, exemplo trabalhado, checklist, resumo e sinalização

### Takeaway
As duas variantes de Survivor e a de Seeker com assinatura têm a sinalização mais rica: 8 a 9 subtítulos `###` e rótulos "NA PRÁTICA" e "CASO DE ESTUDO" como títulos. O mastermind não tem nenhum `###`, põe os rótulos inline e deixa o código Python **sem cerca**, de modo que o markdown provavelmente achata a indentação.

A assinatura mudou aberturas e fechamentos na direção prescrita: pergunta (Seeker), risco (Survivor) e tese (Mastermind) na abertura; convite ou desafio (Seeker) e checklist (Survivor) no fechamento. A "síntese" que o Mastermind deveria fazer não aparece.

Nenhum texto traz resumo ou recapitulação.

### Cited Findings

**Aberturas e fechamentos** (trechos curtos):

| Texto | b1 abre | b1 fecha | b2 abre | b2 fecha |
|---|---|---|---|---|
| seeker-atual | "Adentrar as vastas terras dos algoritmos exige compreender…" | "estamos prontos para traduzir essa mecânica em código" | "chega o momento de forjar a sua implementação" | "brilha intensamente… quando realizamos múltiplas buscas" (sem ponte) |
| seeker-assin. | "Como você faria para encontrar uma única pista perdida…?" | "proponho um desafio: como traduzir essa estratégia em um código" | "O que acontece quando transformamos essa lógica de corte…?" | "Convido você a investigar de maneira autônoma…" |
| survivor-atual | "No ambiente de sobrevivência, tempo e energia são recursos escassos." | termina no rastreio ("5 comparações que a busca linear exigiria") | "Agora que dominamos a lógica conceitual do particionamento" | "a busca linear direta `O(n)` é mais rápido" (sem ponte) |
| survivor-assin. | "confiar na sorte ou em varreduras cegas é um risco crítico" | checklist + ponte literal da fonte | "sem precisão no controle de limites expõe o código" | checklist + "Na próxima aula: como ordenar a lista…" |
| mastermind-assin. | "depende fundamentalmente da redução progressiva do espaço de busca" | "a etapa subsequente exige formalizar a implementação algorítmica" | "O verdadeiro valor de um algoritmo transparece na… escalabilidade" | "Na próxima aula: analisaremos como ordenar a lista…" |

— [Saídas](dados/gen/conteudos.gemini.json)

**Títulos** (contagem no md):
- seeker-atual: `##` 2, `###` 3
- seeker-assinatura: `##` 2, `###` 8
- survivor-atual: `##` 2, `###` 9
- survivor-assinatura: `##` **4** (dois por capítulo), `###` 5
- mastermind-assinatura: `##` 2, `###` **0**

Os títulos de seeker-assinatura e survivor-assinatura dizem "…e Ordenação", embora o capítulo não ensine ordenação, o que sinaliza mal. O título "O Rastreio do Fragmento de Poder" (seeker-atual) não diz o que contém. — [medidas](dados/leitura/medidas_leitura.json); [Saídas](dados/gen/conteudos.gemini.json)

**Divisão em partes.** O prompt diz que cada `##` é ponto de corte em partes ou arquivos ("uma por bloco/tópico"). survivor-assinatura usa dois `##` por bloco e gera 4 partes em vez de 2: "Vulnerabilidade da Busca Linear…" / "A Estratégia da Busca Binária…" e "Implementação Iterativa…" / "Análise de Complexidade…". O resultado é pedagogicamente razoável (segmentação mais fina), mas foge da instrução. — [prompt](dados/gen/survivor-assinatura.system.txt); [Saídas](dados/gen/conteudos.gemini.json)

**Código sem cerca no mastermind.** No md b2 do mastermind, o código Python não está entre crases triplas (0 cercas, contra 1 nos outros quatro). A linha `def busca_binaria(lista, alvo):` começa um parágrafo, e as linhas com 4 espaços que vêm em seguida não podem interromper um parágrafo em CommonMark. O previsível é que virem continuação do parágrafo, com a indentação perdida, o que em Python muda o significado. O mesmo texto também escreve `meio = (inicio + fim) // 2` e `lista[meio]` sem código inline. — [Saídas](dados/gen/conteudos.gemini.json); [medidas](dados/leitura/medidas_leitura.json)

**Exemplo trabalhado.** Os cinco têm rastreio em lista ou em prosa. O mastermind é o único que o faz em prosa corrida, num parágrafo de cerca de 120 palavras, sem lista de passos. — [Saídas](dados/gen/conteudos.gemini.json)

**Checklist.** Só survivor-assinatura tem, nos dois capítulos (5 + 4 itens). Os 4 itens de b2 estão corretos. Dos 5 de b1, dois são problemáticos ("ponto flutuante", "erros de inferência"; ver seção 1). — [Saídas](dados/gen/conteudos.gemini.json)

**Resumo ou síntese.** Nenhum dos cinco tem. O mastermind, cuja assinatura pede "síntese conceitual com próximos passos", fecha só com a ponte (próximos passos), sem síntese. — [Saídas](dados/gen/conteudos.gemini.json); [Assinaturas](dados/assinaturas.json)

**Rótulos pedidos pelo prompt.** "NA PRÁTICA" e "CASO DE ESTUDO" aparecem em todos. Survivor-assinatura usa os dois inclusive em caixa alta. Os rótulos às vezes não batem com o conteúdo: em seeker-assinatura, "CASO DE ESTUDO" encabeça a análise de complexidade. — [Saídas](dados/gen/conteudos.gemini.json)

### Inferences
- **A assinatura funciona como alavanca de abertura e fechamento:** as três variantes seguem o estilo prescrito. É a evidência mais clara de efeito da assinatura no texto.
- **A sinalização é pior no mastermind**, com código sem cerca e nenhum subtítulo. Nos outros, a estrutura vem mais do prompt comum (títulos `###` e rótulos) do que da assinatura.

### Gaps
- Não renderizei o markdown no app (mobile ou web) para confirmar como o código sem cerca aparece. A conclusão vem da especificação CommonMark e não foi observada.

---

## 5. Legibilidade (markdown e áudio separados)

### Takeaway
Pelo índice de Flesch adaptado (Martins et al., 1996: 248,835 − 1,015·ASL − 84,6·ASW), os markdowns ficam em torno de 48–53 (faixa "difícil"/"fácil" na fronteira de 50), exceto o mastermind, com cerca de 37. O mastermind tem frases bem mais longas (17,3 palavras contra 10–12) e mais palavras longas.

Os áudios ficam em 62–71, mais fáceis que o texto em todos os perfis. A assinatura praticamente não moveu o índice em Seeker (49 → 53) nem em Survivor (48 → 52).

### Cited Findings

**Índices por texto** (aproximados; sílabas por heurística de grupos vocálicos, frases por pontuação, itens de lista e títulos contados como frase, código removido):

| Texto | ASL md | ASW md | Flesch-PT md | % palavras ≥4 sílabas md | nominalizações/mil md | ASL áudio | Flesch-PT áudio | nominaliz./mil áudio |
|---|---|---|---|---|---|---|---|---|
| seeker-atual | 11,0 | 2,23 | ≈49 | 18,2 | 63 | 12,5 | ≈71 | 39 |
| seeker-assin. | 11,6 | 2,18 | ≈53 | 16,7 | 63 | 12,0 | ≈68 | 40 |
| survivor-atual | 9,8 | 2,26 | ≈48 | 19,5 | 76 | 13,8 | ≈62 | 41 |
| survivor-assin. | 9,9 | 2,21 | ≈52 | 16,9 | 65 | 14,8 | ≈69 | 44 |
| mastermind-assin. | **17,3** | 2,29 | **≈37** | 20,1 | 77 | 13,8 | ≈67 | 52 |

Por capítulo, o mastermind b2 tem ASL ≈ 20,1 e Flesch ≈ 37; o b2 de seeker-atual e o de survivor-atual ficam em ≈ 44. — [Medidas próprias](dados/leitura/medidas_leitura.json)

**Jargão introduzido sem definição na primeira ocorrência** (leitura manual):
- **seeker-atual:** "divisão e conquista", "ponteiros", "divisão inteira" (só nomeada), "padrão de projeto" (mal usado), "*boundary errors*", "média inteira", "vetor", "complexidade linear/logarítmica" (nomeadas, não explicadas)
- **seeker-assinatura:** "iteração", "divisão inteira"/"média inteira", "loop infinito", "escala logarítmica", "custo computacional". O(n) é definido como "cresce em proporção direta".
- **survivor-atual:** "ponteiros", "slot", "vetor", "janela de busca", "particionamento", "falsos negativos", "gargalos"
- **survivor-assinatura:** "ponteiros", "falso negativo", "tempo de CPU", "requisição", "ponto flutuante", "erros de inferência", "combo". "Notação Big-O" é definida.
- **mastermind:** "divisão e conquista", "array" (inglês), "complexidade temporal", "condições de fronteira", "amortizando", "arquitetura" (mal usado). "Complexidade assintótica" é definida.

— [Saídas](dados/gen/conteudos.gemini.json)

**Nominalizações.** O mastermind tem as frases mais nominalizadas, por exemplo "a etapa subsequente exige formalizar a implementação algorítmica" e "redução progressiva do espaço de busca a cada etapa decisória". — [Saídas](dados/gen/conteudos.gemini.json)

### Inferences
- **Mastermind:** "analítico e preciso" virou, na prática, "denso e nominalizado". O índice cai cerca de 12–15 pontos em relação aos outros markdowns. Ainda assim, esses ≈37 ficam numa faixa comum em texto acadêmico de graduação.
- **Seeker e Survivor:** o ganho de legibilidade com a assinatura é pequeno (cerca de 4 pontos) e está dentro do erro provável da heurística de sílabas.
- **O áudio é sistematicamente mais legível que o markdown**, porque tem menos palavras longas e não tem o formato de lista. Isso favorece a escuta.

### Gaps
- O contador de sílabas é heurístico. Ele subestima hiatos ("ideia", "meio") e, portanto, superestima o Flesch. Os valores absolutos são aproximados; as diferenças entre textos medidos pelo mesmo script são mais confiáveis.
- **Não confirmei com fonte publicada** a tabela de faixas do Flesch adaptado de Martins et al. (1996) (75–100 muito fácil; 50–75 fácil; 25–50 difícil; 0–25 muito difícil), que reproduzo de memória. O redator deve conferi-la na literatura antes de usar os rótulos.
- Não medi a legibilidade da fonte (blocos.json) como linha de base.

---

## 6. Roteiro de áudio: adequação à escuta

### Takeaway
Os cinco roteiros, em geral, não leem o código símbolo a símbolo e escrevem "O de n" e "meio mais um" por extenso. Os problemas de escuta são de outra ordem:
- **Tags `[Tom: …]`:** são de 4 a 15 por texto, pedidas pelo próprio prompt de produção, e chegam ao TTS sem limpeza no caminho que inspecionei.
- **Palavras que o TTS vai pronunciar errado:** "pontimentos", "minus", "log2".
- **Números em algarismos**, apesar da instrução de escrever por extenso.
- **Texto antes do primeiro marcador `##`:** em survivor-assinatura, ele tende a ser descartado ou a cair no fim da parte anterior quando o áudio é dividido.

O áudio tem 45% a 70% das palavras do markdown e repete pouco o texto literal: entre 0% e 9% de 5-gramas em comum com o md.

### Cited Findings
- **Tamanho** (palavras do áudio / palavras do md, de `medidas.gemini.json`):
  - seeker-atual: 696/1124 (0,62)
  - seeker-assinatura: 725/1230 (0,59)
  - survivor-atual: 848/1271 (0,67)
  - survivor-assinatura: 661/1471 (**0,45**)
  - mastermind-assinatura: 865/1243 (0,70)

  A ~140 palavras/min, isso dá entre ~4,7 e ~6,2 minutos por texto (estimativa, não medida). — [medidas.gemini.json](dados/gen/medidas.gemini.json)
- **Tags de tom:** o prompt manda "Inclua marcações de [Tom: …] para guiar a entonação mística". Os textos têm 9, 15, 14, 6 e 4 tags, na ordem acima. — [prompt](dados/gen/seeker-atual.system.txt); [medidas](dados/leitura/medidas_leitura.json)
- **Defeito no próprio template:** o prompt tem "Se seeker for 'seeker', o narrador deve parecer ofegante e animado", e no mastermind, "Se mastermind for 'seeker'…". O template não foi interpolado direito, e o mastermind recebe instruções de tom para os três perfis. — [prompt mastermind](dados/gen/mastermind-assinatura.system.txt)
- **Caminho até o TTS:** a síntese em `generateNaturalAudio` envia o texto inteiro dentro de "TRANSCRIÇÃO:" para `gemini-3.1-flash-tts-preview`, e não encontrei remoção de `[Tom: …]` no caminho do microservice. A busca no código só achou instruções de prompt para essas tags. — [geminiService.ts](../../../../microservice/src/services/geminiService.ts), aprox. linhas 1943–1966 e 1602
- **Divisão do áudio por marcador:** `splitAudioByMarkdownTitles` corta o roteiro a partir do fim de cada marcador `## <título>`, então o que vem antes do primeiro marcador fica fora de todas as partes. *(Correção de 11/11: isso valia para a cópia lida; na `main`, desde #838, o trecho antes do primeiro marcador junta-se à primeira parte, e o que vem antes do marcador de um capítulo seguinte cai no fim da parte anterior.)* — [geminiService.ts](../../../../microservice/src/services/geminiService.ts), aprox. linhas 1253–1271
  - survivor-assinatura: o áudio b1 abre com uma tag e duas frases ("Na sobrevivência do código, buscar dados sem estratégia é um risco direto…") **antes** do marcador. O áudio b2 abre com "Código sem controle de limites é um risco iminente…" antes do seu marcador.
  - mastermind: há só uma tag antes de cada marcador.
  - Os demais começam pelo marcador.

  — [Saídas](dados/gen/conteudos.gemini.json)
- **Algarismos em vez de extenso** (o prompt pede "escreva por extenso o que o narrador fala"):
  - survivor-atual: "1024", "2048", "11", "3, 8, 15, 21, 37, 42 e 56"
  - seeker-assinatura: "37", "3, 8, 15, 21, 37, 42 e 56", "base 2", "Apenas 3 passos"
  - survivor-assinatura: "log2 de n"
  - seeker-atual e mastermind escrevem os números por extenso

  — [Saídas](dados/gen/conteudos.gemini.json); [prompt](dados/gen/seeker-atual.system.txt)
- **Palavras estranhas à fala:**
  - mastermind: "pontimentos" (não-palavra) e "meio minus um"
  - seeker-atual: "while inicio menor ou igual a fim" (palavra-chave em inglês, aceitável) e "a função devolve o retorno menos um" (redundante)

  — [Saídas](dados/gen/conteudos.gemini.json)
- **Código falado:**
  - mastermind b2 verbaliza a função inteira em prosa, adequado ao ouvido e fiel.
  - survivor-atual faz isso em parte.
  - os demais não leem o código, só o laço e o -1.

  Nenhum lê símbolos crus como `//` ou `[ ]`. — [Saídas](dados/gen/conteudos.gemini.json)
- **Redundância com o texto e com a fonte:** os 5-gramas do áudio que aparecem no md variam de 0% a 9%. Os que aparecem na fonte chegam a 30% e 22% em survivor-assinatura, contra 0% a 12% nos outros. Mastermind repete literalmente no áudio a primeira frase do md de cada capítulo. — [sobreposição](dados/leitura/sobreposicao.py); [Saídas](dados/gen/conteudos.gemini.json)
- **Densidade de exclamações no áudio:** seeker-atual 28,7 por mil palavras, seeker-assinatura 19,7, Survivor e Mastermind 0. — [medidas](dados/leitura/medidas_leitura.json)

### Inferences
- **Mastermind tem o melhor áudio em cobertura**, apesar de dois erros de palavra: rastreio e código completos. survivor-assinatura tem o pior, com o roteiro mais curto, o rastreio resumido a uma frase e o risco de perder a abertura na divisão.
- **As tags de tom são um risco transversal, não ligado à assinatura.** Se o TTS as pronunciar, todos os áudios terão trechos como "Tom: entusiasta e místico" falados.

### Gaps
- **Não ouvi nenhum áudio nem chamei o TTS**, por restrição da tarefa. Fica sem medida se o `gemini-3.1-flash-tts-preview` lê ou interpreta as tags `[Tom: …]` e como pronuncia "log2", "1024" e "pontimentos".
- Não segui a função `splitTtsChapters` até o fim, nem confirmei em que ponto do fluxo de produção o roteiro concatenado é dividido por marcador. A perda do texto anterior ao marcador está inferida do código e não foi observada.

---

## 7. Aderência à assinatura e comparação dos pares

### Takeaway
A assinatura muda de forma visível a abertura, o fechamento e o léxico. Pela contagem de `medidas.gemini.json`, os marcadores do próprio perfil passam de 0 → 5,1 por mil (Seeker) e de 0,5 → 6,6 por mil (Survivor), e chegam a 7,6 no Mastermind.

As proibições, porém, são cumpridas só em parte:
- **Survivor:** elimina as "metáforas desconectadas", mas traz marcadores aplicados fora de contexto e afirmações inventadas.
- **Mastermind:** viola "sensacionalismo" ("falha catastrófica", "ganho exponencial").
- **Seeker:** reduz o jargão sem contexto, mas não o zera.

### Cited Findings
- **Marcadores do próprio perfil** por mil palavras: seeker 0,0 → 5,12; survivor 0,47 → 6,57; mastermind-assinatura 7,59. Marcadores de outros perfis ficam entre 0,95 e 1,65 em todos. — [medidas.gemini.json](dados/gen/medidas.gemini.json)
- **Seeker**, proibições "tom burocrático" e "excesso de jargão sem contexto":
  - seeker-assinatura tem menos termos não definidos que seeker-atual (cerca de 5 contra 9; ver seção 5) e não tem "padrão de projeto" nem "*boundary errors*".
  - O tom não é burocrático. Abre com pergunta e fecha com convite ("Convido você a investigar de maneira autônoma…"), como a assinatura pede.
  - Persistem "iteração" e "escala logarítmica" sem definição.

  — [Saídas](dados/gen/conteudos.gemini.json); [Assinaturas](dados/assinaturas.json)
- **Survivor**, proibições "promessas vagas" e "metáforas desconectadas":
  - survivor-assinatura não tem metáfora de fantasia. survivor-atual tem "Dicionário no Escuro" e "selva do desenvolvimento de código", que são desconectadas.
  - survivor-assinatura promete o que não verificou ("estrutura exata e testada", "certeza absoluta") e cria um checklist com dois itens sem base. São "promessas vagas" em outro sentido.
  - O fechamento em checklist foi cumprido nos dois capítulos.

  — [Saídas](dados/gen/conteudos.gemini.json)
- **Mastermind**, proibições "sensacionalismo" e "saltos sem justificativa":
  - viola sensacionalismo com "falha catastrófica", "ganho exponencial" e "volumes massivos".
  - quanto a saltos, está bem: justifica o +1 de log2(1024) e por que O(n log n) supera O(n).
  - a abertura em tese foi cumprida; a síntese do fechamento, não.

  — [Saídas](dados/gen/conteudos.gemini.json)
- **seeker-atual × seeker-assinatura:**

  | Medida | seeker-atual | seeker-assinatura |
  |---|---|---|
  | Itens de fantasia | ≈21 | ≈12 ("pista", "mapa") |
  | "!" no áudio | 19 | 13 |
  | "?" no md | 0 | 5 |
  | `###` no md | 3 | 8 |
  | Flesch md | ≈49 | ≈53 |
  | Desvios de fidelidade | ≈5 | ≈5 (natureza diferente) |
  | Ponte em b2 | não | sim |

  — [medidas](dados/leitura/medidas_leitura.json); [Saídas](dados/gen/conteudos.gemini.json)
- **survivor-atual × survivor-assinatura:**

  | Medida | survivor-atual | survivor-assinatura |
  |---|---|---|
  | Palavras md | 1.271 | 1.471 |
  | Palavras áudio | 848 | 661 |
  | Rastreio no áudio | quase completo | resumido |
  | Rastreio em b2 | não | sim, o melhor dos cinco |
  | Checklists | 0 | 2 |
  | Pontes no md | 0 | 2 |
  | Desvios de fidelidade | ≈5 | ≈10 (vários ligados aos marcadores) |
  | `##` no md | 2 | 4 (fora da instrução) |
  | Flesch md | ≈48 | ≈52 |

  — [medidas.gemini.json](dados/gen/medidas.gemini.json); [medidas](dados/leitura/medidas_leitura.json)
- **mastermind-assinatura contra os "atual" de Seeker e Survivor:**
  - sem exclamações e quase sem fantasia, contra 19 "!" e cerca de 21 itens de fantasia em seeker-atual
  - Flesch md ≈37, contra ≈48–49
  - o melhor áudio em cobertura
  - único com código sem cerca e sem nenhum `###`
  - desvios ≈10, contra ≈5

  **Ressalva:** sem mastermind-atual, não dá para atribuir essas diferenças à assinatura e não ao perfil ou guia (Idris), que já muda o prompt base ("Lexicografia técnica", "calmo, calculista e pausado"). — [prompt mastermind](dados/gen/mastermind-assinatura.system.txt); [medidas](dados/leitura/medidas_leitura.json)

### Inferences
- **O efeito mais confiável da assinatura é retórico:** abertura, fechamento, léxico e menos detalhe sedutor no Seeker. O efeito sobre a correção técnica é nulo ou negativo.
- **O ponto de atenção para a literatura** é a "inserção de marcadores": quando o prompt pede palavras-assinatura, o modelo as encaixa mesmo onde o conceito não as comporta, e isso gera afirmações falsas ou vazias.
- **A amostra é de um único texto por condição e um único tópico.** Nenhuma diferença acima pode ser atribuída com segurança à assinatura e não à variação aleatória da geração.

### Gaps
- n = 1 por condição, sem repetições com a mesma semente nem com sementes diferentes. Não há como separar efeito da assinatura de ruído de amostragem.
- Falta o mastermind-atual, por falta de cota do Gemini, e com isso o terceiro par não existe.
- Nenhuma medida com alunos: compreensão, carga cognitiva, preferência por perfil. Todas as conclusões pedagógicas aqui são sobre o texto, não sobre o efeito no aprendizado.
