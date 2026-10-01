# Prompt Fase 2 — Trilhas, PARTE 5 de 5: editor de tópico — aba "Cards"

Última parte da tela Trilhas. Continuação das partes 1–4. Mesma tela do editor de tópico (cabeçalho + coluna esquerda da Parte 3) — esta parte cobre a terceira e última sub-aba da coluna direita: **Cards**.

## Identificação
- Fonte de conteúdo: `Console Trilha.dc.html` da V5, anexado a este prompt (mesmo arquivo das partes anteriores).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Use a mesma base de layout já estabelecida na Parte 3 — não recrie, só troque o conteúdo da coluna direita para esta aba.

## Aba "Cards"
Layout em 2 colunas dentro da aba: lista de cards existentes à esquerda, formulário de novo card à direita.

### Coluna "Cards existentes" (+ contador badge)
Lista de cards, cada um como uma linha: título + prévia do corpo (a resposta/descrição do card), um **selo de reaproveitamento** (ex. "em 2 conteúdos" quando o card também é usado em outro lugar, ou visual equivalente para "só aqui" quando é exclusivo deste conteúdo), e 3 ícones: editar, duplicar, excluir.

**Editar** expande um formulário inline: "Título do card" + "Descrição" (campos com o conteúdo atual), Cancelar + "Salvar card".

**Excluir** mostra confirmação inline: "Excluir o card '{título}' deste conteúdo?" + nota "Ele é removido só daqui. Se estiver vinculado a outro conteúdo, lá ele continua." + Cancelar + Excluir.

**Estado vazio:** "Nenhum card para este conteúdo."

### Painel "Novo card" (largura fixa, à direita)
Nota de contexto "Vinculado a **{conteúdo}**". Link/checkbox "Reaproveitar card de outro conteúdo" (permite escolher um card já cadastrado em outro conteúdo do mesmo tópico, em vez de criar um novo do zero). Campos "Frente (título)" e "Verso (resposta)". Botão "Salvar card".

## Lembrete final (vale para toda a tela Trilhas, as 5 partes)
Cards **nunca** são irmãos de "Conteúdos" no mesmo nível hierárquico — eles vivem dentro de um conteúdo específico e podem ser reaproveitados entre conteúdos do mesmo tópico (por isso o selo de reaproveitamento). Questões (Parte 4) pertencem só ao conteúdo em que foram criadas/vinculadas. Confirme, ao final desta parte, que as 5 partes da tela Trilhas formam um sistema visual coerente entre si antes de considerar a tela pronta.

## O que NÃO fazer
Não deixe o botão "Reaproveitar card de outro conteúdo" parecer uma ação de criar — ele é uma forma alternativa de vincular algo que já existe. Não esqueça o selo de reaproveitamento na lista de cards existentes.
