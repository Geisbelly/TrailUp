# Ranks — descrição detalhada do estado atual (com dados reais)

Descrição exata do que aparece nos 4 prints enviados. Turma de exemplo: "2N - 2026 | 2026.1", com 3 tipos de ranking configurados e 1 aluno pontuado.

## Mapa de correspondência entre os prints

| Print (ordem enviada) | O que mostra | Relação com os outros |
|---|---|---|
| 1 | Tela base "Gerenciamento de Rankings", completa: tipos de ranking, rankings ativos e a tabela de posições do ranking selecionado | Estado inicial da tela. |
| 2 | Modal **"Novo Ranking"** aberto sobre a tela base | Acionado pelo botão "+ Novo Ranking". |
| 3 | Modal **"Novo Tipo de Ranking"** aberto sobre a tela base | Acionado pelo botão "+ Novo Tipo". |
| 4 | Modal **"Editar Tipo de Ranking"** aberto, com os dados do tipo "Pontuação" já preenchidos | Acionado pelo ícone de editar (lápis) do card "Pontuação" em "Tipos de Ranking". |

---

## Tela base "Gerenciamento de Rankings" (print 1)

### Cabeçalho

- Título "GERENCIAMENTO DE RANKINGS", subtítulo "Configure tipos de ranking e acompanhe as posições dos alunos".

### Seção "Tipos de Ranking"

- Título "TIPOS DE RANKING", subtítulo "Configure os critérios de classificacao" (sem acento em "classificação", texto literal da tela).
- Botão roxo, canto superior direito: **"+ Novo Tipo"**.
- 3 cards lado a lado, cada um com: nome do tipo em negrito, o critério técnico embaixo (cinza, menor), e dois ícones à direita (lápis = editar, lixeira = excluir):

| Nome do tipo | Critério (texto embaixo) |
|---|---|
| Pontuação | Pontuacao (sem acento) |
| Tempo de Estudo | Tempo |
| Percentual Concluído | Percentual |

### Seção "Rankings Ativos" (coluna esquerda, abaixo dos tipos)

- Título "RANKINGS ATIVOS", subtítulo "Clique para ver posições".
- Botão roxo: **"+ Novo Ranking"**.
- Lista de 3 rankings, cada um num card com ícone de troféu, nome em negrito, "Turma | Período" embaixo (cinza), e os ícones de lápis/lixeira à direita:

| Ranking | Turma | Período |
|---|---|---|
| Percentual Concluído | 2N - 2026 | 2026.1 |
| Tempo de Estudo | 2N - 2026 | 2026.1 |
| Pontuação | 2N - 2026 | 2026.1 |

O card **"Percentual Concluído"** está com uma borda roxa contínua ao redor — é o ranking atualmente selecionado, cujas posições aparecem na coluna da direita.

### Coluna direita — posições do ranking selecionado

- Título "🏆 PERCENTUAL CONCLUÍDO - 2026.1" (nome do ranking + período).
- Cabeçalho de tabela: **# | Aluno | Pontos**.
- Uma única linha: ícone de coroa dourada + **"1"** (posição) | "Aluno Demo" | **"75"** (pontos, alinhado à direita).

---

## Modal "Novo Ranking" (print 2)

- Título "NOVO RANKING", botão "×" de fechar.
- Campo **"Tipo \*"** — dropdown vazio, placeholder "Selecione" (contorno roxo, em foco).
- Campo **"Classe (opcional)"** — dropdown com o valor **"Geral"** já selecionado.
- Campo **"Período \*"** — input vazio, placeholder "Ex: 2025.1".
- Botão roxo, largura total: **"Salvar"**.

## Modal "Novo Tipo de Ranking" (print 3)

- Título "NOVO TIPO DE RANKING", botão "×" de fechar.
- Campo **"Nome \*"** — input vazio, placeholder "Ex: Pontuacao Geral" (sem acento, contorno roxo em foco).
- Campo **"Descrição"** — textarea vazia, sem placeholder visível.
- Campo **"Critério"** — dropdown com o valor **"Pontuação"** já selecionado (valor padrão).
- Botão roxo: **"Salvar"**.

## Modal "Editar Tipo de Ranking" (print 4)

Mesmo layout do modal "Novo Tipo de Ranking", mas já preenchido com os dados existentes:

- Título "EDITAR TIPO DE RANKING" (muda de "Novo" para "Editar").
- **"Nome \*"** — "Pontuação" (o texto aparece selecionado/destacado em azul, como se estivesse pronto para ser substituído ao digitar).
- **"Descrição"** — preenchida com **"Ranking por pontuação acumulada"** (diferente do modal de criação, que tinha a descrição vazia).
- **"Critério"** — "Pontuação".
- Botão **"Salvar"**.

---

## Observações factuais (sem julgamento de design)

- Os subtítulos/valores técnicos usam grafia sem acento em pelo menos dois lugares: "classificacao" (subtítulo da seção Tipos de Ranking) e "Pontuacao" (placeholder do campo Nome no modal Novo Tipo) — os títulos visíveis ("Pontuação", "Percentual Concluído") têm acento normal; só esses dois textos auxiliares estão sem.
- O modal "Novo Ranking" não tem campo de nome — o nome do ranking parece ser derivado automaticamente do Tipo + Turma + Período escolhidos (é o que aparece como título "PERCENTUAL CONCLUÍDO - 2026.1" na coluna de posições).
- Não há print mostrando a confirmação de exclusão (lixeira) nem um ranking/tipo com mais de 1 aluno na tabela de posições.
