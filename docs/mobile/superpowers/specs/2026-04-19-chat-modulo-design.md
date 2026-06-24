# Design: Chat no Módulo — Remoção de Preview Automático e Botão de Descarte

**Data:** 2026-04-19
**Branch:** base-teste
**Escopo:** Remover comportamento proativo do IAMentorPanel no escopo `modulo`

---

## Problema

No escopo `modulo`, o `IAMentorPanel` exibe dois elementos que não deveriam aparecer:

1. **Preview automático** — um balão flutuante (`previewBubble`) aparece acima do botão do guia mostrando a mensagem do cue antes de o usuário interagir.
2. **Botão "Entendi"** — dentro do painel aberto, um botão (`actionsRow`) chama `handleDismissCue`, marcando o cue como lido sem ação explícita do usuário.

## Design da Correção

### Arquivo afetado

- `src/components/ia/IAMentorPanel.tsx`

### Mudanças

**1. Remover `previewBubble`**

Apagar o bloco condicional que renderiza o balão de preview (atualmente guarded por `previewText && scope !== "trilha_home"`). O `previewText` permanece no código pois ainda alimenta `currentTitle` no cabeçalho do painel aberto.

**2. Remover `actionsRow`**

Apagar o bloco condicional `{cue || scope !== "trilha_home" ? <View style={styles.actionsRow}>...</View> : null}`. O botão "Entendi"/"Conversa" que chama `handleDismissCue` ou `handleClose` é removido por completo.

**3. Limpar StyleSheet**

Remover `styles.previewBubble` e `styles.previewText` do `StyleSheet.create` (código morto após remoção dos elementos).

### O que permanece intacto

- O botão launcher (avatar/ícone) que abre o painel
- O painel de chat completo (mensagens, input, envio)
- O ponto de notificação (`unreadDot`) no launcher
- O botão de silenciar/reativar guia
- Todo o comportamento de `trilha_home`

### Resultado esperado

O guia continua disponível, mas só exibe sua mensagem quando o usuário abre o painel. Nenhuma mensagem aparece automaticamente e não há botão que marque o cue como lido sem ação explícita.
