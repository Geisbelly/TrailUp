Tela 07 — **Notificações**. Arquivo: `v2/07-notificacoes.html` (edite o atual, que anexo). Item ativo da sidebar: **Notificações**. Perfil de exemplo: Conqueror.

## 1. Feedback
> "Listagem é melhor. Esse de cima não faz sentido, pode tirar, falta a visualização da notificação e esse espaço vazio é para q."

No print, ela marcou em laranja a etiqueta "NOTIFICAÇÕES — MISTURA LIDA/NÃO LIDA" e a grade de cards de 2 colunas, e riscou a coluna da direita ("Seu ritmo" / "Próximo lembrete") com a área vazia embaixo dela.

## 2. Fica como está
- Eyebrow "CAIXA DE ENTRADA" e H1 "Notificações" em Cinzel.
- Filtros **Todas · Não lidas · Lidas** em pílula (o ativo em `accent`).
- Os 6 avisos de exemplo, com os mesmos títulos, textos, ícones e horas do v1 (tabela abaixo).
- Diferença lida × não lida: não lida com o selo "NOVA" e borda mais forte.

## 3. O que muda
1. **Sai** a etiqueta do topo (regra 2.1 do mestre). Os estados vão para o seletor flutuante.
2. **A grade de 2 colunas vira lista** de uma coluna (regra 2.3).
3. **Sai** a coluna "Seu ritmo / Próximo lembrete". O lugar dela é o **detalhe da notificação** (mestre-detalhe, regra 2.4). A sequência de dias não se perde: vira um chip no cabeçalho.
4. **Entra** a visualização da notificação, com o que o app mostra em `notificacoes/[id].tsx`.

## 4. Grade (1164px úteis)
```
[seletor flutuante de estado]
┌ cabeçalho: eyebrow / H1 / subtítulo .............. [⚡ 5 dias seguidos] [Marcar todas como lidas] [↻] ┐
┌ filtros Todas 6 · Não lidas 2 · Lidas 4 ────────────────────────────────────────────────────────────┐
┌ lista (5/12 = 468,33) ───────────┐ ┌ detalhe (7/12 = 675,67, sticky top 28) ──────────────────────────┐
│ item × 6, gap 8                  │ │ Título e estado · Quando foi enviada · Conteúdo · Ações           │
└──────────────────────────────────┘ └──────────────────────────────────────────────────────────────────┘
```
Lista e detalhe começam na mesma linha e o detalhe é `position: sticky`, então nunca sobra área vazia ao lado da lista.

## 5. Blocos

### 5.1 Cabeçalho
- Eyebrow "CAIXA DE ENTRADA", H1 "Notificações", subtítulo 14 `textSubtle`: **"Aqui ficam avisos da plataforma, atualizações acadêmicas e eventos importantes."** (texto do app).
- À direita: chip neutro com `object-bolt.png` 18 + **"5 dias seguidos"** (substitui o card "Seu ritmo"); botão fantasma **"Marcar todas como lidas"** (desabilitado sem não lidas); ícone-botão 40 recarregar (`aria-label="Atualizar a caixa"`).

### 5.2 Filtros
Os mesmos 3 do v1, agora com contador: **Todas 6 · Não lidas 2 · Lidas 4**.

### 5.3 Item da lista (`<a href="#n-1">`, um por notificação)
Linha de altura mínima 84, raio 16, `padding: 14px 16px`, gap 14:
- Ícone 40×40 raio 12, o mesmo tipo do v1 (lembrete, ranking, IA, conquista com `object-trophy.png`).
- Linha 1: título (não lida Inter 700 14.5 `text`; lida Inter 500 14.5 `textMuted`) + selo "NOVA" nas não lidas; hora à direita (11 `textSubtle`).
- Linha 2: o texto em **uma linha** com reticências, 13 `textSubtle`.
- Não lida: fundo `surface`, borda `accent` a 45% e barra de 3px `accent` à esquerda. Lida: fundo transparente, borda `line`.
- **Selecionada** (a que está no detalhe): fundo `elev`, `aria-current="true"`.
- No hover/foco, à direita: ícone-botões 32 "Marcar como lida" e "Excluir" (lixeira em `danger-text`).

Dados (do v1):
| # | Lida | Ícone | Título | Texto | Hora |
|---|---|---|---|---|---|
| 1 | não | lembrete | Hora de estudar | 20 minutos em "Equações do 1º grau" mantêm sua sequência viva. | Hoje, 19:00 |
| 2 | não | ranking | Você subiu no ranking! | 12ª posição em Tempo de Estudo da turma. Continue assim! | Ontem, 21:14 |
| 3 | sim | IA | Percebi que "Frações" te tomou mais tempo | Que tal revisar com os cards rápidos antes de seguir? | Segunda, 14:02 |
| 4 | sim | conquista | Conquista: "Fronteira Avançada" | 2 tópicos seguidos sem errar nenhuma questão. | Sexta passada |
| 5 | sim | lembrete | Marina S. aceitou seu convite | Vocês agora são amigos na jornada. | Quarta passada |
| 6 | sim | ranking | Nova categoria de ranking disponível | "Pontos" já está valendo pra turma inteira. | 2 semanas atrás |

### 5.4 Detalhe (card `padding: 26px 28px`, raio 20, fundo `surface`, borda `line`)
Selecionada por padrão: a nº 1. Quatro seções, com os nomes do app, separadas por `border-top: 1px solid var(--line)` e `padding: 18px 0`, cada uma com eyebrow:
1. **"Título e estado"**: ícone 48 do tipo + título em Cinzel 700 22 + chip "Não lida" (accent) ou "Lida" (neutro).
2. **"Quando foi enviada"**: "Hoje, 19:00" (Inter 600 15) e, abaixo, a data completa "29/09/2026 às 19:00" (13 `textSubtle`).
3. **"Conteúdo do aviso"**: texto completo, 15/1.7 `text`. Quando o aviso aponta para um lugar do app, botão primário para ir até lá: nº 1 "Abrir Equações do 1º grau" → `04-topico.html`; nº 2 e nº 6 "Ver ranking" → `05-ranking.html`; nº 4 "Ver conquista" → `09-biblioteca-conquistas.html`; nº 5 "Ver amigos" → `06-social.html`. (Proposta: o app não tem esse botão.)
4. **"Ações disponíveis"**: **"Marcar como não lida"** (secundário) e **"Excluir notificação"** (contorno `danger`).
- Rodapé 12 `textSubtle`: "Ao abrir, a notificação é registrada como lida. Você também pode excluí-la definitivamente pelo botão disponível." (texto do app).
- Abrir uma não lida no protótipo a marca como lida: tira o selo, atualiza os contadores dos filtros e o número da sidebar.

### 5.5 Excluir (modal pequeno, borda `danger-border`)
Título "Excluir notificação", texto "Tem certeza de que deseja excluir esta notificação?", botões "Cancelar" · "Excluir" (sólido `danger`). Textos do app.

## 6. Estados (seletor flutuante)
"Com dados" · "Filtro: Não lidas" · "Tudo lido" · "Vazio" · "Carregando" · "Notificação removida" · "Erro"
- **Tudo lido** (filtro Não lidas sem itens): na lista, check 46 `success`, "Tudo em dia", "Você leu todas as notificações."
- **Vazio:** lista e detalhe dão lugar a um card vazio centralizado na largura toda: sino 46, **"Sem notificações"**, **"Você ainda não tem notificações por aqui."** (texto do app).
- **Carregando:** 6 esqueletos de 84px na lista + esqueleto do detalhe.
- **Notificação removida:** detalhe com "Nada por aqui" e botão fantasma "Voltar para a caixa".
- **Erro:** card de erro "Não foi possível carregar suas notificações." + "Tentar novamente".

## 7. Não fazer
- Não voltar para grade de 2 colunas.
- Não deixar coluna lateral com pouco conteúdo. Se o detalhe estiver vazio (nenhuma selecionada), mostre um convite: sino 46 + "Escolha uma notificação para ler".

## 8. Aceite
- [ ] Sem etiqueta no topo; sem área vazia à direita.
- [ ] Lista de uma coluna; lida × não lida distinguíveis em escala de cinza.
- [ ] Detalhe ao lado com as 4 seções nomeadas como no app.
- [ ] Os 7 estados no seletor.
