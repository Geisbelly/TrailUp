# Prompt Fase 2 — Rankings

## Identificação
- Nome da tela: **Rankings** (item de sidebar), título interno "Gerenciamento de Rankings". Corresponde ao arquivo `Console Ranks.dc.html` da V5.
- Fonte de conteúdo: `Console Ranks.dc.html` da V5, anexado a este prompt.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`.

## Estados
`com dados` (padrão) / `carregando` / `novo tipo` (formulário aberto) — os 3 existem no código.

## Cabeçalho
Título "Rankings" + subtítulo "Configure os critérios de classificação e acompanhe as posições dos alunos."

## Layout em 2 colunas

### Coluna esquerda

**Card "Tipos de ranking"** — cabeçalho (título + subtítulo "O critério define como as posições são calculadas") + botão principal "+ Novo tipo".
- **Formulário "Novo tipo de ranking"** (inline, não modal): campo Nome, campo Descrição, escolha em pílulas de **Critério** (Pontuação/Tempo/Acertos, cada um com ícone), nota explicando a ordenação ("Pontuação ordena do maior para o menor. Tempo ordena do menor para o maior."). Cancelar + "Criar tipo".
- **Carregando:** 3 linhas em skeleton + "Carregando tipos de ranking…".
- **Com dados:** lista de tipos — ícone hexagonal (cor do critério) + nome + descrição + pílula do critério (pontuação/tempo/acertos, cada cor própria) + ícones editar/excluir. **Excluir abre confirmação inline**: "Excluir o tipo '{nome}'?" + aviso "N ranking(s) ativo(s) usa(m) este tipo e deixará(ão) de ser calculado(s). As posições já registradas são apagadas." + Cancelar/"Excluir tipo". 3 exemplos: Pontuação geral (critério pontuação), Velocista (critério tempo), Precisão (critério acertos).

**Card "Rankings ativos"** — cabeçalho + botão secundário "+ Novo ranking". Lista de linhas clicáveis (a selecionada tem destaque de borda): nome + "{turma} · {n} alunos · atualizado {quando}" + pílula de status (**ativo**=verde / **encerrado**=cinza, borda tracejada) + seta. 4 exemplos: "Pontuação geral · Física I" (selecionado), "Velocista · Física I", "Precisão · Física II", "Pontuação geral · Laboratório" (encerrado).

### Coluna direita — painel de posições
Cabeçalho: rótulo "Posições · critério {critério}" + título "{ranking} · {turma}" + chip de período.

**Pódio (top 3)**, em 3 colunas com o 1º lugar mais alto no centro: cada posição tem avatar hexagonal com iniciais, nome, pontuação (XP), e um bloco numerado (1/2/3) abaixo — o 1º lugar com brilho/gradiente violeta de destaque, o 2º em prata, o 3º em bronze.

**Tabela de posições 4+:** colunas # / Aluno / Perfil (ícone+nome) / XP (ou métrica do tipo selecionado). Rodapé: "{n} de {total} alunos" + botão "Ver todas as posições".

## Assistente "Escriba"
Mesmo componente global, contextualizado: "lê os dados de rank", sugestões "Quem está subindo?" / "Algum aluno estagnado?".

## O que NÃO fazer
Não remova a confirmação de excluir tipo de ranking. Não simplifique o pódio para uma lista simples — é uma peça visual própria com 1º/2º/3º lugar destacados.
