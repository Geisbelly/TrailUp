# Dashboard — descrição detalhada do estado atual (com dados reais)

Descrição exata do que aparece nos 13 prints enviados, elemento por elemento, na ordem e posição em que aparecem. Todos os prints são da mesma sessão (usuária "Geisbelly Admin Prof", turma-base com 2 alunos de teste).

## Mapa de correspondência entre os prints

Os 13 prints cobrem **2 telas** (a página do Dashboard, e um modal de detalhe de aluno aberto por cima dela), em diferentes posições de rolagem:

| Print (ordem enviada) | O que mostra | Relação com os outros |
|---|---|---|
| 1 | Topo da página Dashboard: cabeçalho, navegação, título, as 8 KPIs, início dos 2 gráficos | Início da página. Continua no print 2. |
| 2 | Dashboard rolado: fim dos 2 gráficos + "Lista de Alunos" completa (2 linhas) | Continuação do print 1. |
| 3 | Modal "Aluno Demo" aberto, aba **Visão Geral**, topo | Abre por cima do print 2 (mesmo fundo desfocado atrás). Continua no print 4. |
| 4 | Mesma aba Visão Geral, rolada — gráfico "Evolução do Aluno" completo | Continuação do print 3. |
| 5 | Aba **Perfil BrainHex** do mesmo modal | Troca de aba dentro do mesmo modal. |
| 6 | Aba **Trilha Visual**, sub-view "Hexágonos", topo | Troca de aba. Continua no print 7. |
| 7 | Mesma sub-view Hexágonos, rolada mais para baixo | Continuação do print 6. |
| 8 | Mesma aba Trilha Visual, sub-view trocada para **"Lista"** | Alternativa de visualização da mesma aba (não é rolagem, é outro estado — o toggle Hexágonos/Lista). |
| 9 | Aba **Personalização**, topo: contexto central + resumo de uso | Troca de aba. Continua nos prints 10, 11 e 12. |
| 10 | Mesma aba, rolada — início do "Histórico de Personalizações" (3 cards) | Continuação do print 9. |
| 11 | Mesma aba, rolada mais — fim do histórico (mais 1 card) + início de "Progresso dos itens personalizados" (tabela, 3 linhas) | Continuação do print 10. |
| 12 | Mesma tabela "Progresso dos itens personalizados", rolada até o fim (mais 8 linhas) | Continuação do print 11 — é o final da aba Personalização. |
| 13 | Volta à página Dashboard (modal fechado), mesma posição de rolagem do print 2, mas com o **dropdown "Todas as classes" aberto** | Mesmo estado do print 2, só que com o menu do filtro de classe aberto por cima da tabela. |

---

## Página Dashboard (prints 1, 2 e 13)

### Cabeçalho fixo no topo (igual em todas as telas do console, não só no Dashboard)

- Canto esquerdo: avatar circular roxo com iniciais "GA", ao lado o nome "Geisbelly Admin Prof" (negrito) e, abaixo dele, "Ulbra" (cinza, menor) — é a instituição do professor.
- Centro/direita: barra de navegação com 7 itens, cada um com ícone à esquerda do texto: "Dashboard" (ícone grade 2x2, pílula roxa preenchida — é a aba ativa), "Trilha" (ícone de nós conectados), "Classes" (ícone de capelo/formatura), "Personalizações" (ícone de estrela/sparkle), "Ranks" (ícone de troféu), "Meus Dados" (ícone de engrenagem), "Aprovações" (ícone de escudo).
- Extrema direita: "Sair" com ícone de seta saindo de uma porta.

### Título da página

- "DASHBOARD DE ALUNOS" — título grande, fonte serifada.
- Abaixo: "Acompanhe o desempenho dos alunos com permissao de acesso" (cinza, sem acentos — nota: "permissao" e "acesso" aparecem sem acento no texto real da tela).

### Primeira fileira de indicadores (4 cards, mesma largura, lado a lado)

Cada card tem: um rótulo em maiúsculas pequenas no canto superior esquerdo, um ícone no canto superior direito, e um número grande abaixo.

1. **TOTAL DE ALUNOS** (ícone de duas pessoas) — número: **2** — abaixo, em cinza pequeno: "com acesso liberado".
2. **MÉDIA DE NOTAS** (ícone de seta subindo/gráfico) — número: **0.0** — sem texto auxiliar.
3. **CONCLUSÃO MÉDIA** (ícone de check dentro de círculo) — número: **38%**.
4. **TAXA DE ACERTOS** (ícone de barras de gráfico) — número: **8%**.

### Segunda fileira de indicadores (mais 4 cards, mesmo padrão visual)

5. **ABANDONO MÉDIO** — número: **50.0%** — sem ícone visível nesta fileira (os cards desta segunda fileira não mostram ícone, diferente da primeira).
6. **CONCLUSÃO MÉDIA** — número: **0.0%** — repete exatamente o mesmo rótulo do card 3 ("Conclusão Média"), mas aqui com um valor diferente (0.0% em vez de 38%) — os dois cards têm o rótulo idêntico e valores diferentes.
7. **USO DO CHAT APÓS ERRO** — número: **0.0%**.
8. **TEMPO MÉDIO DE USO** — número: **508.5min**.

### Bloco de dois gráficos, lado a lado

**Card esquerdo — "Abandono por Perfil"**
- Título "ABANDONO POR PERFIL", subtítulo "Segmentação por perfil da turma selecionada".
- No canto superior direito do card, um seletor/dropdown mostrando "Majoritário".
- Gráfico de **barras verticais**: eixo Y com marcações 0, 25, 50, 75, 100. No eixo X aparecem **duas colunas, ambas rotuladas "mastermind"** (o mesmo rótulo se repete duas vezes, uma para cada barra) — a primeira barra é vermelha e vai até perto de 90 no eixo Y; olhando o print 2 (mais completo), há uma segunda marcação "mastermind" à direita sem barra visível de mesma cor associada claramente destacada (a área abaixo dela aparenta vazia/baixa). As linhas de grade são tracejadas.

**Card direito — "Distribuição de Notas"**
- Título "DISTRIBUIÇÃO DE NOTAS", subtítulo "Faixas baixa, média e alta".
- Gráfico de **pizza/rosca**: metade de cima vermelha, metade de baixo laranja. Rótulo de dados "baixa: 100.0%" com uma linha guia apontando para a fronteira entre as duas cores. No print 13, ao passar o mouse, aparece uma caixa de tooltip branca "baixa : 100" sobreposta à fatia laranja.

### "Lista de Alunos" (abaixo dos gráficos)

- Título "LISTA DE ALUNOS", subtítulo "Clique em um aluno para ver detalhes e visualizar sua trilha".
- Linha de filtros: campo de busca com ícone de lupa, placeholder "Buscar por nome ou email...", ocupando a maior parte da largura; à direita, um dropdown "Todas as classes" (no print 13, este dropdown está **aberto**, mostrando 3 opções em lista: "✓ Todas as classes" com check marcado, "2N - 2026", "SPD - 3N 2026/2" — o menu aberto fica sobreposto por cima do início da tabela).
- Cabeçalho da tabela: **Aluno | Classe | Perfil | Nota Média | Progresso | Acertos | Ações**.
- Linha 1: "Aluno Demo" (negrito) com "demo@trailup.app" (cinza, menor, embaixo) | "2N - 2026" | badge marrom/bronze "mastermind" | badge vermelho arredondado "0.0" | barra de progresso roxa preenchida a ~75% com o texto "75.0%" ao lado | "15.0%" | um botão circular azul/roxo com ícone de olho (ação de visualizar).
- Linha 2: "Aluno Demo" / "demo@trailup.app" | "SPD - 3N 2026/2" | badge "mastermind" | badge vermelho "0.0" | barra de progresso quase vazia (marrom, ~0%) com "0.0%" ao lado | "0.0%" | ícone de olho, mas neste caso **sem o fundo azul preenchido** (parece um outline simples, diferente do botão da linha 1 — pode ser um estado de hover/foco diferente, ou uma inconsistência visual entre as duas linhas).

---

## Modal "Aluno Demo" (prints 3 a 12)

Abre centralizado, por cima da página Dashboard (que fica escurecida/desfocada atrás). Cabeçalho do modal, fixo nas 4 abas: ícone de capelo + "ALUNO DEMO" à esquerda, botão "×" de fechar no canto superior direito. Logo abaixo, 4 abas em formato de pílula: **Visão Geral** | **Perfil BrainHex** | **Trilha Visual** | **Personalização** — a aba ativa fica com contorno roxo.

### Aba "Visão Geral" (prints 3 e 4)

Dentro de uma caixa com borda roxa fina:

- Duas colunas de dados: à esquerda "Email" (rótulo cinza pequeno) / "demo@trailup.app" (valor branco); à direita "Classe" / "2N - 2026".
- Logo abaixo, mais duas colunas: "Modo de Operação" / "Conteúdo Primeiro"; "Perfil Dominante" / badge marrom "mastermind".
- Abaixo, 4 mini-cards lado a lado, cada um com um ícone pequeno + rótulo + valor grande:
  - Ícone de seta subindo — "Nota Média" — **0.0**
  - Ícone de check — "Concluído" — **75.0%**
  - Ícone de barras — "Acertos" — **15.0%**
  - Ícone de relógio — "Tempo Total" — **0.39min**
- Mais abaixo, ainda dentro da mesma caixa de borda roxa: título "EVOLUÇÃO DO ALUNO", subtítulo "Nota, acertos e progresso ao longo dos dias". Gráfico de **linha**: eixo Y com 0, 25, 50, 75, 100; eixo X com datas "24/08, 26/08, 30/08, 03/09, 05/09". Três linhas: uma **azul** que sobe de ~62 até um pico de ~87 (por volta de 26/08) e depois cai abruptamente até 0 (por volta de 30/08), permanecendo em 0 até o fim; uma linha **verde** horizontal reta em 75; uma linha **laranja/amarela** horizontal reta em 0 (colada no eixo).

### Aba "Perfil BrainHex" (print 5)

- Título "PERFIL BRAINHEX" com ícone de átomo/engrenagem circular, subtítulo "Distribuição dos 7 perfis de aprendizagem".
- Lista de perfis com barra de porcentagem (só 2 aparecem no print — os outros 5 perfis provavelmente têm 0% e não aparecem, ou estão abaixo, fora do que foi capturado):
  - **mastermind** + badge roxa "Dominante", à direita "85%" — barra bicolor (roxo preenchido até ~85%, resto em marrom/bronze).
  - **conqueror**, à direita "60%" — mesma barra bicolor, preenchida até ~60%.

### Aba "Trilha Visual" (prints 6, 7 e 8)

- Dois botões de alternância no canto superior direito: "Hexágonos" (ícone de grade) e "Lista" (ícone de lista) — no print 8 o botão "Lista" aparece preenchido/ativo (roxo sólido), e nos prints 6-7 é "Hexágonos" que está sendo exibido.
- Um card roxo cheio, de largura total: "TRILHA" (rótulo pequeno) / "2N - 2026" (título grande) à esquerda; "Progresso" / "XP 750/1000" à direita; abaixo, uma barra de progresso horizontal quase cheia (~75%).
- Texto "Visualizando trilha de **Aluno Demo**".

**Sub-view "Hexágonos" (prints 6 e 7):** uma coluna vertical de nós conectados por uma linha, de cima para baixo:
1. Hexágono roxo com ícone de **estrela**, rótulo "Aula 4", status "Disponível" (print 6, primeiro nó visível no topo).
2. (Rolando mais, print 7) Uma forma de seta/hexágono no topo do print (cortada, sem rótulo visível de qual nó é).
3. Hexágono roxo com **check**, rótulo "Introdução", status "Concluído".
4. Hexágono roxo com **check**, rótulo "Aula 2", status "Concluído".
5. Hexágono roxo com **check**, rótulo "Aula 3", status "Concluído" (último visível, corta aqui).

Nota: a ordem exibida de cima para baixo é **Aula 4 (Disponível) → Introdução (Concluído) → Aula 2 (Concluído) → Aula 3 (Concluído)** — ou seja, o nó "disponível" aparece antes dos nós "concluídos" na lista vertical, não depois.

**Sub-view "Lista" (print 8):** os mesmos nós, agora como linhas horizontais com borda arredondada e leve brilho roxo, cada uma com: ícone hexagonal à esquerda (presente/caixa de presente para "Disponível", check para "Concluído"), título e status embaixo dele, e uma seta ">" à direita. Ordem visível: "AULA 4 / Disponível" (destacada com borda mais forte) → "INTRODUÇÃO / Concluído" → "AULA 2 / Concluído" (cortada no fim do print).

### Aba "Personalização" (prints 9, 10, 11 e 12)

**Topo (print 9):** duas colunas.

- **Coluna esquerda — "CONTEXTO CENTRAL DO ALUNO"** (ícone de sparkle): subtítulo "Perfis, preferências, histórico e sinais usados pela API para personalizar o módulo." Duas badges: "mastermind 85%" e "conqueror 60%". Abaixo, duas colunas de rótulo/valor: "MODO DE OPERACAO" / "Conteúdo Primeiro" e "PERFIL DOMINANTE" / "mastermind". Abaixo disso, uma caixa de código (fundo escuro, texto monoespaçado) mostrando o JSON bruto usado pela IA:
  ```json
  {
    "aluno": {
      "id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
      "nome": "Aluno Demo",
      "email": "demo@trailup.app",
      "apelido": "Belly",
      "descricao": "Aluno de teste para trilhas",
      "modo_resposta": "imediato",
      "modo_operacao": "Conteúdo Primeiro"
    },
    "perfil_brainhex": [
      { "perfil": "mastermind", "afinidade": 85 },
      { "perfil": "conqueror", "afinidade": 60 }
      // (corta aqui no print)
  ```
- **Coluna direita — "RESUMO DE USO"** (ícone de alvo): três estatísticas empilhadas, cada uma com rótulo pequeno em maiúsculas e valor grande abaixo: "PERSONALIZACOES" — **4**; "ITENS PERSISTIDOS" — **68**; "TEMPO PERSONALIZADO" — **95.0min**.

**"Histórico de Personalizações" (prints 10 e 11):** título com ícone de documento, subtítulo "Justificativa, formatos gerados e sequência entregue ao aluno." Uma lista de cards, cada um assim:

| Personalização | Tag (canto sup. direito) | Texto | Badges de formato | Etapas geradas | Gerado em |
|---|---|---|---|---|---|
| #3638 · Tópico 129 | `cards` | "Conteúdo compartilhado por perfil BrainHex." | apresentacao, audio, cards, markdown | 3 | 23/08/2026, 19:14:19 |
| #3608 · Tópico 128 | `misto` | "Sem justificativa registrada." | apresentacao, audio, markdown | 3 | 22/08/2026, 12:48:10 |
| #3607 · Tópico 128 | `cards` | "Conteúdo compartilhado por perfil BrainHex." | apresentacao, audio, cards, markdown | 3 | 22/08/2026, 09:43:00 |
| #3572 · Tópico 125 | `cards` | "Conteúdo compartilhado por perfil BrainHex." | apresentacao, audio, cards, markdown | 3 | 21/08/2026, 14:52:20 |

(A lista pode continuar além do que foi capturado — o print 11 corta logo depois do 4º card para começar a próxima seção.)

**"Progresso dos itens personalizados" (prints 11 e 12):** título, subtítulo "Tempo, pontuação e status persistidos por passo do módulo personalizado." Tabela com colunas **Item | Tipo | Status | Tempo | Pontos | Atualizado**. Todas as linhas visíveis têm Tipo = `content` e Status = badge roxa "concluido" (sem acento), Pontos = `0` em todas as linhas. Linhas, na ordem em que aparecem:

1. "Parte 3 de 3: Motivações Tecnológicas e Propriedades Fundamentais" — 7.1 min — 06/09/2026, 02:14:51
2. "Parte 12 de 13: Encerramento Elegante e Conceito de Graceful Shutdown" — 9.3 min — 06/09/2026, 02:07:31
3. "Parte 13 de 13: Tratamento de Exceções de Rede e Blocos de Proteção" — 0.2 min — 06/09/2026, 01:57:53
4. "Parte 3 de 3: NA PRÁTICA: Aplicações Críticas no Mundo Real" — 0.0 min — 25/08/2026, 13:58:19
5. "Parte 1 de 4: Evolução e Visão Geral da Computação Distribuída" — 0.0 min — 25/08/2026, 13:58:18
6. "Parte 1 de 3: Panorama e Evolução da Computação Descentralizada" — 0.1 min — 25/08/2026, 13:58:17
7. "Parte 2 de 3: Aspectos Cruzados de Projeto e Resiliência" — 0.0 min — 25/08/2026, 13:58:16
8. "Parte 3 de 3: NA PRÁTICA: Aplicações Críticas no Mundo Real" (repetida) — 0.1 min — 25/08/2026, 13:58:09
9. "Parte 2 de 3: Aspectos Cruzados de Projeto e Resiliência" (repetida) — 0.1 min — 25/08/2026, 13:58:04
10. "Parte 1 de 3: Panorama e Evolução da Computação Descentralizada" (repetida) — 0.2 min — 25/08/2026, 13:57:59
11. "Etapa personalizada 1" — 0.1 min — 25/08/2026, 13:57:46

Esta é a última linha visível — o print 12 termina logo depois dela, com espaço vazio abaixo (parece ser o fim da lista e o fim da aba).

**Observação factual (não é crítica, é só um dado que salta aos olhos na tabela):** os itens 4, 8 e 9-10 têm **títulos repetidos** com timestamps diferentes e tempos bem pequenos (0.0–0.2 min), todos dentro de um intervalo de poucos segundos entre si (13:57:46 a 13:58:19) — parecem eventos de teste/seed gerados em sequência rápida, não uso real espaçado no tempo.
