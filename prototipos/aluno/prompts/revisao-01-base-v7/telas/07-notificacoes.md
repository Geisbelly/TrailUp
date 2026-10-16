Tela 07 — **Notificações** (caixa de entrada + detalhe). Arquivo de saída: `v2/07-notificacoes.html`.

Shell completo, item ativo **Notificações** (contador "3" na sidebar). Perfil de exemplo: Conqueror. No app são duas rotas (`index` → `[id]`). Na web, **mestre-detalhe**: a lista à esquerda e o detalhe à direita, com âncora `#n-<id>` por notificação.

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/notificacoes/index.tsx`, `notificacoes/[id].tsx`, `components/CardNotificacao.tsx`.
- As notificações chegam da tabela `notificacoes` (caixa de entrada: só o que já foi entregue). O motor inteiro roda no banco. A tela não mostra nada da fila.
- Ao **abrir** uma notificação, ela é marcada como lida.

## 2. Dados de exemplo (7 itens, 3 não lidos)
| # | Lida? | Título | Corpo | Enviada |
|---|---|---|---|---|
| 1 | não | Hora de estudar | "Seu lembrete diário chegou. Equações do 1º grau está esperando: faltam 4 blocos." | há 12 min |
| 2 | não | Você subiu no ranking | "Você chegou ao 3º lugar em Pontos da turma. Faltam 70 pontos para o 2º." | há 1 h |
| 3 | não | Pausa sugerida | "Você estudou 50 minutos seguidos. Uma pausa curta ajuda a fixar o conteúdo." | há 3 h |
| 4 | sim | Conquista desbloqueada | "Você ganhou o emblema Primeira conquista." | ontem, 19:40 |
| 5 | sim | Módulo personalizado | "Reorganizamos Equações do 1º grau para começar por desafios curtos." | ontem, 08:15 |
| 6 | sim | Nova trilha publicada | "Prof. Helena Duarte publicou Razão e Proporção." | 21/09, 14:02 |
| 7 | sim | Volte para a trilha | "Faz 3 dias que você não estuda. Sua sequência está em risco." | 19/09, 18:30 |

Formato de hora (`formatSmartTime`): relativo até 24h ("há 12 min", "há 1 h"); depois, "ontem, 19:40" e "21/09, 14:02".

## 3. Grade (main de 1096px)
```
[seletor]
┌ cabeçalho: eyebrow / H1 / subtítulo ...................... [Marcar todas como lidas] [↻] ┐
┌ filtros Todas · Não lidas · Lidas ──────────────────────────────────────────────────────┐
┌ lista (5/12 = 448) ─────────────────┐ ┌ detalhe (7/12 = 628, sticky) ──────────────────┐
│ CardNotificacao × N (gap 8)         │ │ Título e estado · Quando · Conteúdo · Ações    │
└─────────────────────────────────────┘ └────────────────────────────────────────────────┘
```

## 4. Blocos

### 4.1 Cabeçalho
Eyebrow **"CAIXA DE ENTRADA"**, H1 **"Central de notificações"** (o `title` da tela no app é "Notificações"; o cabeçalho interno diz "Central de notificações"). Subtítulo: **"Aqui ficam avisos da plataforma, atualizações acadêmicas e eventos importantes."** Ações: fantasma "Marcar todas como lidas" (proposto; desabilitado sem não lidas) e ícone-botão recarregar 40 (`aria-label="Atualizar a caixa"`). O app atualiza puxando a lista para baixo; na web isso vira o botão.

### 4.2 Filtros
Filtros segmentados (§7.4 do mestre, `aria-label="Filtros de leitura"`): **"Todas 7" · "Não lidas 3" · "Lidas 4"**. Legenda 12 `textSubtle` ao lado: "Alterne entre todas, não lidas e lidas para encontrar rapidamente o que ainda precisa da sua atenção."

### 4.3 Item da lista (`CardNotificacao`, `aria-label="Não lida: Hora de estudar"`)
Linha clicável, raio 16, `padding: 14px 16px`, gap 14, altura mínima 84, `role="link"`:
- Ícone 40×40 (raio 12): não lida = envelope fechado 20 em `accent` sobre `accentMuted`; lida = envelope aberto 20 em `textSubtle` sobre `surfaceElevated`.
- Texto: linha 1 com "Não lida" (chip accent 10.5, só nas não lidas) e a hora à direita (11 `textMuted`, tabular); linha 2 com o título (2 linhas no máx.): não lida Inter 700 14.5 `text`, lida Inter 500 14.5 `textMuted`; linha 3 com o corpo em 1 linha e reticências, 13 `textSubtle`.
- Não lida: fundo `surface`, borda `1px solid accent` a 45% e barra de 3px `accent` na esquerda. Lida: fundo transparente, borda `var(--line)`.
- Selecionada (a que está no detalhe): fundo `surfaceElevated`, `aria-current="true"`.
- Ações rápidas no hover/foco (aparecem à direita, por cima da hora): ícone-botões 32 **"Marcar lida"** (envelope aberto) e **"Excluir"** (lixeira, `danger-text`). No teclado ficam sempre acessíveis por Tab. Chevron 16 `textSubtle` no fim da linha.
- **Diferença lida/não lida sem depender de cor:** ícone fechado/aberto, peso do título, chip "Não lida" e barra lateral.

### 4.4 Detalhe (`notificacoes/[id].tsx`), card `padding: 26px 28px`, sticky `top: 108px`
Quatro seções, separadas por `border-top: 1px solid var(--line)` e `padding: 18px 0`. Cada uma com eyebrow (o nome da seção é o texto do app):
1. **"Título e estado"**: título em Cinzel 700 22 `text` + chip "Lida" (neutro) ou "não lida" (accent).
2. **"Quando foi enviada"**: linha 1 relativa ("há 12 min", Inter 600 15 `text`); linha 2 completa ("24/09/2026 às 09:48", 13 `textSubtle`, tabular).
3. **"Conteúdo do aviso"**: corpo 15/1.7 `text` (texto completo). Se a notificação aponta para um lugar do app (ex.: o tópico), adicione o botão primário "Abrir Equações do 1º grau" → `04-topico.html`. É uma proposta: o app não tem esse botão.
4. **"Ações disponíveis"**: botões **"Marcar como não lida"** (secundário) e **"Excluir notificação"** (destrutivo contorno).
- Ajuda 12 `textSubtle` no pé: "Ao abrir, a notificação é registrada como lida. Você também pode excluí-la definitivamente pelo botão disponível."

### 4.5 Excluir (modal P destrutivo)
Título **"Excluir notificação"**, corpo **"Tem certeza de que deseja excluir esta notificação?"**, botões "Cancelar" · **"Excluir"** (destrutivo sólido). Erros em toast: "Não foi possível excluir." / "Não foi possível alterar o status."

## 5. Estados (seletor: "Com dados" · "Filtro: Não lidas" · "Tudo lido" · "Vazio" · "Carregando" · "Carregando detalhe" · "Notificação removida" · "Erro")
- **Filtro: Não lidas:** 3 itens. **Tudo lido** (filtro Não lidas sem itens): card vazio compacto com check 46 `success`, "Tudo em dia" e "Você leu todas as notificações." (proposto).
- **Vazio:** card vazio, ícone sino 46, título **"Sem notificações"**, corpo **"Você ainda não tem notificações por aqui."** O detalhe some e a lista ocupa as 12 colunas.
- **Carregando:** 5 esqueletos de 84px + esqueleto do detalhe.
- **Carregando detalhe:** no card da direita, esqueleto e o texto **"Carregando notificação"** / "Buscando detalhes...".
- **Notificação removida** (abriu um link de notificação que já não existe): card vazio no detalhe, **"Nada por aqui"**, botão fantasma "Voltar para a caixa".
- **Erro:** card de erro, "Não foi possível carregar suas notificações." + "Tentar novamente" (proposto: o app só registra no console).

## 6. Não fazer
- Tom de "aviso do jogo", não de e-mail corporativo: nada de assunto em caixa alta nem remetente.
- Não inventar categorias/ícones por tipo: a tabela não tem campo de tipo exibido pelo app.

## 7. Aceite
- [ ] Lida/não lida distinguíveis em escala de cinza.
- [ ] Filtros com contadores, lista e detalhe lado a lado.
- [ ] Detalhe com as 4 seções nomeadas como no app.
- [ ] Excluir com confirmação e textos do app.
