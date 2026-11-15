# Geração de conteúdo e papel do professor: análise e propostas — 15/11/2026

Base: `Monografia TrailUp - atualizada 2026-11-15 - revisão (limpa, só para leitura).docx`
(texto em `versoes/monografia-v31-2026-11-15.txt`; os `§N` são dessa versão).
Código conferido na `origin/main` de 15/11/2026. Tudo aqui é **proposta**: a autora decide o que entra.
Nenhuma afirmação de literatura foi acrescentada, porque nenhuma fonte sobre supervisão humana de conteúdo
gerado por IA foi acessada nesta rodada (ver a seção 5).

## 1. Diagnóstico: o sistema tem o argumento, o texto não o usa

O TrailUp **não entrega ao aluno conteúdo gerado sem validação**. O professor tem portões em cada etapa da
geração, e a maioria deles é garantida pelo banco, não pela interface. O texto descreve esses portões, mas
eles estão **espalhados no capítulo 5** (§454, §459 a §462, §497, §498, Quadro 7 e Quadro 16) e quase não
aparecem onde a banca forma o juízo:

| Onde | O que diz hoje sobre o professor validar o que a IA gera |
| --- | --- |
| Resumo (§81) | Nada. O professor aparece só como quem recebe a ordem sugerida "como hipótese" |
| 1.2 a 1.5 | Só o objetivo de "preservar o conteúdo curricular original" (§258) |
| 1.6 Justificativa (§268) | Cita "validação" no pipeline, sem dizer que é do professor |
| 1.7 Delimitação (§271) | Bom: não pretende "substituir o professor" nem "produzir autonomamente o currículo" |
| Cap. 4 (método) | Nada |
| Cap. 5 | O conteúdo está todo aqui, mas sem um quadro que o reúna |
| 8.2 (resultados) | Só "7 missões sugeridas pela IA, das quais 5 aprovadas" (§550), sem ser lido como validação |
| 8.5 (discussão) | Nada |
| Cap. 9 | Item k: a aprovação existe, mas nenhum material novo tinha sido decidido em 12/11 |
| Cap. 10 | Nada |

**Risco na banca.** "A IA gera o conteúdo. Quem garante que está certo?" é a pergunta mais previsível para
um sistema que gera texto, áudio, apresentação, trilha, questões e cards com modelo de linguagem. Hoje a
resposta está no sistema, mas só aparece no texto para quem ler o capítulo 5 inteiro.

**Achado que o texto subestima.** A correção da dissertativa e do código por modelo de linguagem não é a
palavra final: a nota da IA entra na fila de correção da aba Notas como **"revisar"**, e o professor
confirma ou ajusta. Quando a IA não consegue corrigir, a entrega fica "sem nota" e o professor dá a nota
(`frontend/src/components/console/notas/fila.ts` e `PainelDeCorrecao.tsx`). O Quadro 10 e a §510 só dizem
"corrigida por modelo de linguagem".

## 2. O que o código sustenta (conferido na `origin/main`)

| Etapa | O que a IA faz | O que o professor decide | Quem garante | Onde |
| --- | --- | --- | --- | --- |
| Proposta de trilha | Propõe tópicos, conteúdos, atividades, questões e cards a partir da descrição e das fontes que o professor envia | Ajusta, remove ou refaz tópicos, e aplica ou descarta a proposta | Nada entra na turma sem aplicar; a proposta fica em `trilha_rascunho`, que o aluno não lê | `20261110_08`, `GenerateTrailDialog.tsx` |
| Publicação do tópico | — | Rascunho, publicado ou agendado | Tópico novo nasce em **rascunho**, inclusive o da trilha da IA; a RLS restritiva esconde o tópico e tudo o que pende dele (conteúdos, atividades, questões, cards, material personalizado) | `20261110_10`, `20261110_11` |
| Material por perfil (texto, áudio, apresentação) | Gera a partir do conteúdo e das fontes do professor | Aprova ou recusa (com motivo), por item, por tópico × perfil ou pela turma | Nasce `pendente` e volta a `pendente` sempre que muda; só o professor dono (pelo JWT) muda o estado, e o worker não consegue aprovar; a decisão confere a versão que o professor viu; a RLS restritiva esconde o não aprovado | `20261110_09` |
| Cards gerados | Escreve cards a partir do conteúdo | Herdam a decisão do material | Policy restritiva `cards_personalizados_aprovado_sel` | `20261110_09` |
| Progresso e aviso ao aluno | — | — | O progresso conta só o aprovado; o aviso "material novo" sai na aprovação, não na geração | `20261110_09` |
| Geração automática | — | Liga ou desliga em Meus dados | — | Quadro 7 |
| Missões sugeridas | Propõe missões, quando o professor pede | Aprova ou recusa, com motivo | CHECK no banco impede missão da IA sem aprovação; o banco aplica catálogo de métricas, teto, sem link nem e-mail; log de cada decisão | `20261102_20` |
| Insights e intervenções | Escreve sínteses e sugestões | Aceita ou descarta; não edita o texto | GRANT por coluna | `20260929_01` |
| Correção de dissertativa e código | Dá uma nota e um feedback contra a resposta esperada do professor | Confirma ou ajusta a nota na fila de correção; dá a nota quando a IA falha | Fila `notas_fila()`; `avaliado_em` só com a decisão do professor | `20261016_04`, `20261016_05` |
| Alteração do professor | Classifica a alteração (cosmética ou relevante) e se o aluno precisa revisar | Decide quando não há modelo | Sem modelo, fica `pendente_analise`; nada é inventado | `20261101_12` |

**Primeira camada, automática** (§482): guardrails sobre a saída dos modelos (ordem da trilha, tópicos que
existem, grounding da resposta do Guardião, alunos citados pela Lumi). **Segunda camada, humana:** os portões
da tabela. O texto pode apresentar as duas como camadas de um mesmo desenho.

**Origem da regra, que o texto deve dizer como é.** A aprovação do material foi uma decisão de produto da
autora em 10/11/2026 (docstring da `20261110_09`), não uma regra derivada da Evidence Base. Ela não entra no
Quadro 23 como decisão apoiada pela leitura.

## 3. O que chega ao aluno sem passar pelo professor

Esta lista precisa estar no texto. Se a banca a montar sozinha, ela desmente o §462.

| O que | Por que não passa pelo professor | O que reduz o risco |
| --- | --- | --- |
| Perguntas do diagnóstico do tópico | Geradas por aluno, sob demanda | Opcional, sem nota, uma vez por tópico; o banco valida tamanho, quantidade e gabarito dentro das opções (`20261105_22`) |
| Resposta do Guardião (chat) | Em tempo real | Grounding verificado por uma segunda chamada; não entrega a resposta da atividade (§482) |
| Nome e falas do boss | Geradas por tópico × perfil | Sem linha, valem as falas fixas; não é conteúdo da disciplina |
| Texto das notificações | Sugerido pela IA | Passa pela guarda de texto do banco (`20261105_03`, `_08`) |
| Adequação por aluno (`ai_patch`) | Camada leve, por aluno | Muda ordem, ênfase, tema e cronômetro, não o conteúdo (§524) |
| Feedback imediato da correção | O app chama a mesma correção na hora (`20261108_01`) | A nota fica na fila de correção até o professor confirmar ou ajustar, e as moedas da atividade só entram depois disso (`20261016_05`, `20261017_07`) |

> **Aplicado em 15/11/2026** no docx `papel do professor`, com tudo da seção 4 menos a medição sugerida
> da 4.8. O [CONFERIR] da 4.3 foi resolvido pela linha acima.

## 4. Propostas de texto, por lugar

Formato: onde, o que fazer e a redação proposta. A ordem é do maior para o menor efeito.

### 4.1 Capítulo 5: um quadro que reúna os portões (maior efeito)

**Onde:** depois do §462, antes da seção 5.5.
**O quê:** um parágrafo de entrada, um quadro e um parágrafo de limite.

> O Quadro N reúne os pontos em que o professor decide sobre o que a IA gerou. Em cada um, a geração é
> automática, mas a entrega ao aluno depende de uma decisão dele, e a maior parte dessas decisões é
> garantida pelo banco, e não apenas pela interface: o que não foi aprovado não é lido pelo aplicativo do
> aluno, e nenhum caminho de geração consegue aprovar o próprio material.

*Quadro N – Pontos de decisão do professor sobre o que a IA gera*

| O que a IA gera | O que o professor decide | Como o sistema garante |
| --- | --- | --- |
| Proposta de trilha (tópicos, conteúdos, atividades, questões e cards) | Ajusta, remove ou refaz tópicos e aplica ou descarta a proposta | A proposta fica em rascunho, fora do alcance do aluno; o tópico aplicado nasce em rascunho |
| Publicação do tópico | Rascunho, publicado ou agendado | O aluno não lê o tópico não liberado nem nada do que pende dele |
| Material por perfil (texto, áudio, apresentação e cards) | Aprova ou recusa, por item, por tópico ou pela turma | O material nasce pendente e volta a pendente quando muda; só o professor dono decide, sobre a versão que viu |
| Missões sugeridas | Aprova ou recusa | Missão da IA não chega ao aluno sem aprovação, por regra do banco |
| Insights e intervenções | Aceita ou descarta | O professor não altera o texto gravado pela IA |
| Nota de dissertativa e de código | Confirma ou ajusta | A nota da IA fica na fila de correção até a decisão do professor |
| Classificação de alteração do professor | Decide quando não há modelo | Sem modelo, nada é classificado automaticamente |

*Fonte: elaborado pela autora a partir das migrações do banco e do código do console (TRAILUP, 2026a).*

> Nem tudo o que a IA produz passa por esse filtro. As perguntas do diagnóstico do tópico, as respostas do
> Guardião, as falas do boss e o texto das notificações chegam ao aluno sem decisão do professor, porque são
> geradas sob demanda ou em tempo real. Nesses casos o controle é automático: o diagnóstico é opcional e não
> vale nota, a resposta do Guardião passa pela verificação de grounding, as falas do boss têm reserva fixa e
> as notificações passam pela guarda de texto do banco (seção 5.5).

### 4.2 Seção 5.4, §460: dizer que a proposta é editável e que há dois portões

**Trocar** "Nada entra na turma sem que o professor aplique a proposta."
**por:** "Antes de aplicar, o professor pode ajustar, remover ou refazer tópicos da proposta. Nada entra na
turma sem que ele a aplique, e o tópico aplicado nasce em rascunho, como qualquer tópico novo: a trilha
proposta pela IA passa por duas decisões do professor antes de chegar ao aluno."

### 4.3 Seção 5.7, Quadro 10 e §510: a nota da IA é revisada

**Quadro 10, coluna "Onde é corrigida":** na linha Dissertativa, acrescentar ao fim "; a nota fica na fila
de correção do professor, que a confirma ou ajusta". Na linha Código, o mesmo.

**§510, depois de** "contra a resposta esperada definida pelo professor.":
"A nota atribuída pelo modelo é uma sugestão: ela entra na fila de correção da aba Notas, onde o professor a
confirma ou ajusta, e a resposta que o modelo não consegue corrigir fica sem nota até a decisão dele."
[CONFERIR antes de aplicar: o que o aluno vê entre a correção da IA e a confirmação do professor.]

### 4.4 §462: precisar a frase sobre a nota

**Trocar** "não atribui nota por conta própria fora das regras definidas pelo professor"
**por:** "não fecha a nota de uma resposta aberta sem a confirmação do professor"
(só se o [CONFERIR] da 4.3 confirmar; senão, manter a frase atual).

### 4.5 Resumo (§81): uma frase

O Resumo tem 408 palavras; a NBR 6028 admite até 500. **Inserir depois de** "...um banco PostgreSQL que
concentra filas, agendamentos e autorização.":
"O professor continua responsável pelo conteúdo: a trilha proposta pela IA só entra na turma quando ele a
aplica, e o material gerado para cada perfil só chega ao aluno depois de aprovado por ele, regra garantida
pelo banco."
O Abstract recebe a tradução correspondente.

### 4.6 Seção 1.5, objetivo específico (§258)

**Trocar** "preservar o conteúdo curricular original produzido pelo professor como referência principal da
disciplina;"
**por:** "preservar o conteúdo curricular original produzido pelo professor como referência principal da
disciplina e manter com ele a decisão sobre o que a IA gera antes que chegue ao aluno;"
Mudar objetivo é decisão da autora com o orientador; o objetivo novo é atendido pelo Quadro N da 4.1.

### 4.7 Seção 1.6, §268: dizer de quem é a validação

**Trocar** "A documentação de implementação registra pipeline de resolução de contexto, definição do plano,
geração de materiais, validação, persistência e publicação (TRAILUP, 2026a)."
**por:** "A documentação de implementação registra pipeline de resolução de contexto, definição do plano,
geração de materiais, validação automática, aprovação pelo professor e publicação (TRAILUP, 2026a). O
material gerado por modelo de linguagem pode conter erro de conteúdo, e quem conhece a disciplina é o
professor; por isso o sistema gera, mas é ele quem decide o que o aluno recebe."

### 4.8 Seção 8.2: o que foi medido da validação

Um parágrafo novo, com o que já está no texto, sem número novo:
"A validação pelo professor tem pouca medida até aqui. Das 7 missões sugeridas pela IA até 5 de novembro de
2026, o professor aprovou 5 (seção 5.9). A aprovação do material personalizado entrou em 10 de novembro, e em
12 de novembro nenhum material novo tinha passado por decisão do professor; o material anterior foi aprovado
pela migração que criou a regra (seção 5.4)."

**Medição sugerida antes da defesa** (só leitura, se a autora pedir): quantas decisões de aprovação e de
recusa existem e com que motivos, quantas notas da IA o professor confirmou e quantas ajustou, quantas
propostas de trilha foram aplicadas e quantos tópicos foram removidos antes de aplicar.

### 4.9 Capítulo 7: medir o trabalho de validar

O custo da validação recai sobre o professor e não está no estudo proposto. Duas propostas:
- no roteiro da entrevista docente (§650), uma pergunta sobre o tempo gasto para revisar o material e as
  notas, e sobre o que ele recusou e por quê;
- no Quadro 21, entre os indicadores auxiliares de operação: taxa de aprovação e de recusa do material,
  tempo até a decisão e proporção de notas da IA ajustadas pelo professor.

### 4.10 Seção 8.5: um parágrafo de discussão

**Inserir depois do §731:**
"A aprovação muda o tipo de sistema: a geração é automática, mas a entrega é supervisionada. Ela tem dois
custos que este trabalho não mediu. O primeiro é o trabalho do professor: com sete perfis e quatro materiais
por perfil, um tópico pode ter até 28 itens para revisar, e a aprovação em lote por tópico ou pela turma
reduz os cliques, mas não o tempo de leitura. O segundo é a aprovação por inércia: a conferência da versão
garante que o professor decidiu sobre o material que viu, e não que o leu. Se a revisão virar um clique sem
leitura, o portão continua existindo no banco, mas deixa de ser uma validação."

### 4.11 Capítulo 9: limitações

**Item k, acrescentar ao fim:** "; a revisão pelo professor não cobre o diagnóstico do tópico, as respostas
do Guardião, as falas do boss nem o texto das notificações, e o tempo que ela custa ao professor não foi
medido".

### 4.12 Capítulo 10, §757: a aprovação como propriedade do banco

**Inserir depois de** "...progresso e autorização para o banco.":
"Pelo mesmo princípio, o professor continua responsável pelo que o aluno recebe: o material gerado só é
entregue depois da aprovação dele, e essa regra está no banco, não apenas na interface."

## 5. Lacuna de literatura

Nenhum documento do corpus trata da supervisão humana de conteúdo educacional gerado por modelo de
linguagem. Por isso nenhuma das propostas acima afirma o que a literatura diz sobre o tema: a regra aparece
como decisão de projeto, com o motivo dito pela autora. Se a autora quiser apoio na literatura, a busca
precisa ser feita e a fonte lida antes de citar (R-IA-06). Termos de busca sugeridos, **sem fonte acessada**:
"human-in-the-loop" com "generative AI" e "educational content"; "teacher oversight" com "AI-generated";
diretrizes de órgãos de educação sobre IA generativa.

## 6. Ordem sugerida

1. 4.1 (quadro), 4.2 e 4.3 com o [CONFERIR]: corrigem o capítulo 5 e criam o lugar para onde o resto aponta.
2. 4.5, 4.7, 4.10, 4.11 e 4.12: levam o argumento ao Resumo, à justificativa, à discussão e à conclusão.
3. 4.6 e 4.9: dependem da autora com o orientador (objetivo e desenho do estudo).
4. 4.8: só depois da medição, se a autora a pedir.
