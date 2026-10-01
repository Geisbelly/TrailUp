Prompt de correção — adicionar campo de moedas (atividades, tópico, missões, eventos)

## Contexto

Feedback direto da dona do projeto: **"tem que ter o campo de moedas. tanto em atividades (opcional) quanto em tópico (opcional)"** e **"missões, eventos também podem [ter] valor pontos e moedas."**

Não vi o print desta correção especificamente — o anexo que deveria mostrá-la chegou repetido de uma rodada anterior. O que segue vem só do texto dela, combinado com a issue **#142** (Moedas separadas do XP), já que a regra de fundo de lá se aplica aqui: **moeda é um valor separado de pontos/XP, nunca a mesma coisa com nome diferente.**

## CORRIGIR — adicionar campo "Moedas" (opcional) nestes 4 lugares

1. **Trilha → editor de tópico** (`04-3-trilhas-parte3-editor-topico-e-aba-conteudo.md`): no formulário do tópico (coluna esquerda), adicionar um campo **"Moedas"** (numérico, opcional) — ao lado de onde hoje só existe pontuação/dados do tópico.
2. **Trilha → editor de atividade** (aba "Atividades" do editor de tópico, `04-4-trilhas-parte4-editor-topico-aba-atividades.md`): no formulário de criar/editar questão/atividade, adicionar um campo **"Moedas"** (numérico, opcional) ao lado do campo "Pontuação" já existente.
3. **Missões** (`01-missoes-cadastrar-e-aprovar.md`): no formulário de nova/editar missão, adicionar um campo **"Moedas"** (numérico, opcional) ao lado do campo "Pontuação" já existente — distinto do campo "Recompensa" que já estava especificado (recompensa é um item da loja/bônus; moedas é o valor direto em moeda que a missão concede).
4. **Eventos** (`02-eventos.md` — considerando também a correção `14-eventos-estrutura-modular.md`): no formulário de novo/editar evento, adicionar um campo **"Moedas"** (numérico, opcional) ao lado do campo "Pontuação" já existente.

## Regra que vale nos 4 lugares
- O campo é sempre **opcional** — nada aqui se torna obrigatório.
- Moedas nunca substitui ou se mistura com o campo de pontuação/XP existente — são dois valores lado a lado, cada um com seu próprio rótulo, nunca um único campo combinado.

## O que NÃO fazer
Não torne o campo "Moedas" obrigatório em nenhum dos 4 formulários. Não funda o campo de moedas com o de pontuação num único input.
