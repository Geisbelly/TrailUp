# Chat no Módulo — Remoção de Preview Automático e Botão de Descarte

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o balão de preview automático e o botão "Entendi" do `IAMentorPanel` no escopo `modulo`, deixando o guia disponível apenas quando o usuário abre o painel.

**Architecture:** Deleção cirúrgica de dois blocos JSX em `IAMentorPanel.tsx` e remoção dos estilos mortos correspondentes. Nenhuma lógica nova, nenhuma prop nova, sem testes unitários necessários (componente visual).

**Tech Stack:** React Native, TypeScript

---

### Task 1: Remover previewBubble, actionsRow e estilos mortos

**Files:**
- Modify: `src/components/ia/IAMentorPanel.tsx`

- [ ] **Step 1: Localizar e remover o bloco `previewBubble`**

No arquivo `src/components/ia/IAMentorPanel.tsx`, encontrar e remover o bloco condicional que renderiza o balão de preview (linhas ~549-565). O trecho a deletar é:

```tsx
          {previewText && scope !== "trilha_home" ? (
            <Pressable
              onPress={handleOpen}
              style={[
                styles.previewBubble,
                {
                  width: panelWidth,
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderStrong,
                },
              ]}
            >
              <Text numberOfLines={2} style={[styles.previewText, { color: palette.textMuted }]}>
                {previewText}
              </Text>
            </Pressable>
          ) : null}
```

Deixar `previewText` no código — ele ainda alimenta `currentTitle` no cabeçalho do painel.

- [ ] **Step 2: Localizar e remover o bloco `actionsRow`**

Ainda em `src/components/ia/IAMentorPanel.tsx`, encontrar e remover o bloco condicional do botão "Entendi" (linhas ~744-761). O trecho a deletar é:

```tsx
          {cue || scope !== "trilha_home" ? (
            <View style={styles.actionsRow}>
              <Pressable
                style={[
                  styles.primaryActionButton,
                  {
                    backgroundColor: palette.accentMuted,
                    borderColor: palette.borderStrong,
                  },
                ]}
                onPress={cue ? handleDismissCue : handleClose}
              >
                <Text style={[styles.primaryActionText, { color: palette.accent }]}>
                  {cue?.actionLabel ?? "Entendi"}
                </Text>
              </Pressable>
            </View>
          ) : null}
```

- [ ] **Step 3: Remover estilos mortos do StyleSheet**

No `StyleSheet.create` do mesmo arquivo, remover as entradas `previewBubble` e `previewText` (código morto após remoção dos elementos).

Localizar no StyleSheet as chaves `previewBubble` e `previewText` e deletar seus blocos completos.

- [ ] **Step 4: Verificar TypeScript**

Rodar:
```bash
npx tsc --noEmit
```

Esperado: nenhum erro novo introduzido por esta mudança.

- [ ] **Step 5: Commit**

```bash
git add src/components/ia/IAMentorPanel.tsx
git commit -m "fix(chat): remove auto-preview bubble and dismiss button from modulo scope"
```
