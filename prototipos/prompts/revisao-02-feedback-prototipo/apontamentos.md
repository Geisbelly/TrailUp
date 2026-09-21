# TrailUp / Console — Apontamentos sobre o protótipo já ajustado (rodada 2)

Feedback da dona do projeto sobre os prints do protótipo depois da primeira rodada de ajustes (`revisao-01-apontamentos`). Cada item abaixo corresponde a um print específico enviado por WhatsApp — mantive o nome do arquivo original de cada um para referência cruzada. Este documento só **descreve o problema**; os prompts de correção vêm depois, quando os prints novos (com dados reais, não mais em estado vazio) chegarem.

---

## 1. Modal "Conteúdo Gerado" (aba Apresentação) — `WhatsApp Image 2026-09-07 at 15.20.56`

**O que o print mostra:** um modal "Mastermind · Cinemática" com abas Texto/Áudio/Apresentação. Na aba Apresentação, uma lista de 8 slides, cada um com botão "Regenerar slide", mais um botão "Regenerar apresentação inteira" e um campo de instrução pontual ("Regenerar slide 3 de Mastermind").

**O problema:** a estrutura de dados por trás disso está errada. **Um mesmo conteúdo não gera "uma" apresentação, "um" texto e "um" áudio** — ele gera **X apresentações em HTML, X textos em markdown e X áudios**, um conjunto para cada perfil BrainHex (os 7 perfis). O modal atual trata isso como se fosse uma única geração fixa para "Mastermind", sem deixar claro que existem outras X-1 gerações irmãs (uma por perfil) por trás do mesmo conteúdo.

Além disso, faltam dois pontos centrais que já estavam nos apontamentos da rodada 1 e continuam sem solução:
- **O professor precisa poder dizer o que quer alterar** (uma instrução livre, não só "regenerar de novo") — isso existe parcialmente no campo de instrução do slide, mas não está claro que serve pra isso, nem existe em Texto/Áudio.
- **O conteúdo em si precisa estar visível.** Hoje a lista mostra só os *títulos* dos slides ("Problema de abertura", "A fórmula, deduzida"...) — o professor não consegue ver o slide de verdade, o texto de verdade, nem ouvir o áudio dentro dessa tela. Ele decide regenerar sem nunca ter visto o que existe.

## 2. Editor de Trilha — breadcrumb "Onde estou" — `WhatsApp Image 2026-09-07 at 15.22.40`

**O que o print mostra:** a barra "ONDE ESTOU: Física I › Vetores › Conteúdo: Movimento uniforme — leitura › Questão 1 de 3", no topo do editor de trilha.

**O problema:** **isso mais confunde do que ajuda.** A ideia de mostrar profundidade de navegação é válida, mas a execução atual (essa barra específica, nesse formato) não está cumprindo esse papel — precisa ser repensada, não só ajustada visualmente.

## 3. Editor de Trilha — toggle "Conteúdos / Cards" no nível do tópico — `WhatsApp Image 2026-09-07 at 15.23.18`

**O que o print mostra:** dentro do painel do tópico "Vetores", duas pílulas lado a lado, como abas do mesmo nível: "Conteúdos 4" e "Cards 6".

**O problema estrutural:** isso está errado — **cards ficam dentro de conteúdos**, não são um grupo irmão/paralelo aos conteúdos no mesmo nível hierárquico. Tratar "Conteúdos" e "Cards" como duas abas equivalentes do tópico sugere uma relação que não existe (reforça o mesmo erro de modelagem já apontado na rodada 1 sobre a Trilha). Além do problema estrutural, **a visualização em si está cansativa, confusa e estranha** — mesmo ignorando a hierarquia errada, não é uma boa leitura visual.

## 4. Grade de Cards de estudo (aba "Cards") — `WhatsApp Image 2026-09-07 at 15.24.23`

**O que o print mostra:** 6 cards em grade (ex.: "Velocidade média = Δs / Δt", "Unidades: km/h → m/s"), cada um com um selo de quantos conteúdos usam aquele card, e um tile "+ Novo card".

**O problema:** **não dá pra editar os cards.** Existe criar (`+ Novo card`) e existe ver quantos conteúdos usam cada card, mas nenhuma ação de editar um card existente.

## 5. Lista de conteúdos de um tópico — `WhatsApp Image 2026-09-07 at 15.24.54`

**O que o print mostra:** dentro do tópico "Vetores", a lista de conteúdos ("Movimento uniforme — leitura", "Gráficos de posição e velocidade", "Queda livre — simulação", "Lista de exercícios 2026" — este último mostrando "PDF · extraindo conteúdo (7 de 11 páginas)").

**O problema:** **falta a pré-visualização do conteúdo anexado.** Quando um conteúdo tem um arquivo por trás (o PDF "Lista de exercícios 2026", por exemplo), o professor não tem como ver esse arquivo — só o nome e o status de extração. Precisa dar pra abrir/pré-visualizar o que foi anexado.

## 6. Mapa da Trilha — nós sem posicionamento livre — `WhatsApp Image 2026-09-07 at 15.25.28`

**O que o print mostra:** uma fileira de 4 nós do mapa ("Fluidos", "Rotação", "Trabalho e Energia", "Dinâmica"), dispostos em grade fixa.

**O problema:** **precisa ser possível arrastar os nós** para reposicioná-los livremente no canvas — hoje a disposição parece fixa/automática, sem controle manual de posição. (Isso é além do pan/zoom do canvas já pedido na rodada 1 — é sobre mover os próprios nós dentro do espaço, não mover a câmera.)

## 7. Detalhe de conteúdo (Cinemática) — barra de rolagem — `WhatsApp Image 2026-09-07 at 15.26.05`

**O que o print mostra:** o painel de detalhe do conteúdo "Movimento uniforme — leitura", com a lista de questões abaixo, e uma barra de rolagem vertical bem grossa e genérica na lateral direita.

**O problema:** **a barra lateral está fora do padrão visual** do resto da interface — parece a barra de rolagem padrão do navegador, não uma barra desenhada para combinar com o resto do console.

## 8. Dashboard — Jornada do Aluno, detalhe de um passo — `WhatsApp Image 2026-09-07 at 15.27.30`

**O que o print mostra:** a visualização de jornada com nós hexagonais marcados por estado (concluído, errou, 2ª tentativa, fora de ordem, retorno), e abaixo o painel de detalhe de um passo específico ("Passo 7 de 10 · Vetores · Áudio · Soma de Vetores"), com conteúdo acessado, atividade, resposta dada, resultado, tempo gasto, tentativa, ordem em que foi feito e progresso — exatamente o que a rodada 1 pediu.

**Feedback (positivo, com um pedido de evolução):** **gostou desta tela.** Pedido novo, para evoluir em cima dela: implementar a opção do **professor fazer intervenções** naquele ponto específico da jornada do aluno — adicionar comentários, sugestões de intervenção, guias etc. diretamente ali, no contexto daquele passo.

## 9. Turmas — linha de ações do card — `WhatsApp Image 2026-09-07 at 15.29.05`

**O que o print mostra:** no card da turma "Física I", uma linha de botões só com texto: "Matrículas", "Abrir trilha", "Duplicar", "Excluir" (mais "Editar" numa segunda linha).

**O problema:** **mal projetado** — dá pra colocar ícones nessas ações e deixar a linha de botões muito melhor (mais escaneável, menos poluída visualmente como texto puro).

---

## Resumo rápido (para referência futura ao escrever os prompts de correção)

| # | Tela / elemento | Tipo de problema |
|---|---|---|
| 1 | Modal de conteúdo gerado (Personalizações) | Estrutural (modelo de dados: 1 conteúdo → X gerações por perfil) + falta de visualização real do conteúdo |
| 2 | Breadcrumb "Onde estou" (Trilha) | Interação/clareza — repensar, não só ajustar |
| 3 | Toggle Conteúdos/Cards no tópico (Trilha) | Estrutural (cards são filhos de conteúdo, não irmãos) + visual cansativo |
| 4 | Grade de Cards (Trilha) | Funcionalidade faltando — editar card |
| 5 | Lista de conteúdos do tópico (Trilha) | Funcionalidade faltando — preview de arquivo anexado |
| 6 | Mapa da Trilha (canvas) | Funcionalidade faltando — arrastar nós livremente |
| 7 | Detalhe de conteúdo (Trilha) | Visual — scrollbar customizada |
| 8 | Jornada do Aluno (Dashboard) | Aprovado + pedido de nova funcionalidade — intervenções do professor |
| 9 | Card de turma (Classes) | Visual — usar ícones nas ações |
