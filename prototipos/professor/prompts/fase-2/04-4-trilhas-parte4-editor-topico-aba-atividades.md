# Prompt Fase 2 — Trilhas, PARTE 4 de 5: editor de tópico — aba "Atividades"

Continuação das partes 1–3. Mesma tela do editor de tópico (cabeçalho + coluna esquerda já definidos na Parte 3) — esta parte cobre a segunda sub-aba da coluna direita: **Atividades**.

## Identificação
- Fonte de conteúdo: `Console Trilha.dc.html` da V5, anexado a este prompt (mesmo arquivo das partes anteriores).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Use a mesma base de layout (cabeçalho + coluna esquerda) já estabelecida na Parte 3 — não recrie, só troque o conteúdo da coluna direita para esta aba.

## Aba "Atividades"
Título "Atividades vinculadas" + contador total (badge).

**Lista de questões**, cada uma como um card: número (badge), chip do tipo (ex. "Múltipla escolha"), pontos (ex. "2 pontos"), o enunciado completo da questão, e no rodapé do card: link "Editar", link "Duplicar", e botão "Excluir…" (contorno destrutivo).

**Ao clicar em "Editar"**, o card expande um formulário inline com:
- Enunciado (campo com o texto atual, editável).
- "Tipo da questão" — escolha em pílulas (ex. Múltipla escolha / Verdadeiro-falso / Dissertativa).
- "Pontuação" — campo numérico.
- Quando o tipo permitir (múltipla escolha / verdadeiro-falso): seção "Alternativas · gabarito" — lista de alternativas, cada uma com um indicador de rádio (marcado na que é a correta) + letra (A/B/C…) + texto da alternativa.
- Rodapé: Cancelar + "Salvar questão" (principal).

**Ao clicar em "Excluir…"**, mostra confirmação inline (não um modal separado): "Excluir esta questão de '{conteúdo}'?" + nota "Ela é removida só deste conteúdo. Se a mesma questão estiver vinculada a outro conteúdo, lá ela continua." + Cancelar + Excluir (destrutivo).

**Estado vazio:** "Nenhuma atividade vinculada."

**Abaixo da lista**, 2 blocos lado a lado:
- **"Vincular existente"** — área onde o professor escolhe uma questão já cadastrada em outro conteúdo do mesmo tópico, para reaproveitá-la aqui.
- **"Criar nova questão"** — mini-formulário: campo de enunciado (placeholder "Enunciado…"), select de tipo (placeholder "Múltipla escolha ▾") + campo de pontos lado a lado, seção "Alternativas · gabarito" com pelo menos 2 alternativas de exemplo (A, B) + link "+ Adicionar alternativa", e botão "+ Criar".

## O que NÃO fazer
Não junte "editar" e "excluir" num só fluxo — são duas interações inline separadas, cada uma com sua própria expansão. Não esqueça o texto exato da nota de exclusão (ela deixa claro que a questão pode estar vinculada a outros conteúdos).
