Tela 06 — **Social**, redesenho. Arquivo: `v3/06-social.html` (edite o atual). Item ativo da sidebar: **Social**. Perfil de exemplo: Conqueror (Amina T.).

## 1. Feedback
Dois comentários da Geisbelly (09/10/2026):

> "tem que destacar a loja"

Resolvido pela aba própria da Loja (regra 2.1). **O card da Loja sai do Social.**

> "o social tem arena, batalha, ranqueada e tudo que envolva social, então corrigir o design"

O Social do v2 mostra só a parte de **relacionamento** (convites, amigos, guildas). Falta a parte **competitiva e coletiva**, que é o que dá motivo para o aluno abrir a aba.

## 2. De onde vem cada peça (nada inventado)

| Peça | Fonte |
|---|---|
| Eventos com missões, metas coletivas, desafios e arena | `prototipos/professor/v9/Console Eventos (Fase 2)` — o professor abre o evento; o aluno precisa vê-lo |
| Arena de batalhas (a "ranqueada"): critério, classificação, confrontos | `prototipos/professor/v9/Console Rank de Batalhas (Fase 2)` |
| Batalhas rápidas: modos **Todos, Velocidade, Precisão, Duelo, Duplo** | Banco: `guilda_desafios.modo` (`20260913_02_social_chat_desafios_presenca`); app: `GuildChatModal.tsx` |
| Questões compartilhadas no chat, chat de guilda e chat privado | `GuildChatModal`, `PrivateChatModal`, `social_chat_*` |
| Quem está online | `social_presenca_turma` |
| Guildas, convites, amigos, perfil público | `docs/superpowers/specs/2026-09-12-social-guildas-perfil-publico-design.md` |
| Arte da arena por perfil | `mobile/src/assets/design/arena-<perfil>.webp` (já em `v3/assets/arena-conqueror.webp`) |

**Leitura de "ranqueada":** é a **Arena** do evento: classificação própria, confrontos pareados por desempenho, inscrição opcional. **"Batalha"** são os desafios rápidos entre colegas e guilda, que já existem no banco. Confirmar com a Geis (decisão S1).

## 3. Regras que o V9 do professor já fixou (o aluno precisa enxergar)
Escreva-as na tela, perto de onde importam, em 12 `textSubtle`:
- **Arena é opt-in.** "Entrar na arena é opcional."
- **Não afeta o rank principal.** "O ranking da arena não muda sua posição no ranking da turma."
- **Vitória por acerto; tempo só desempata.**
- **Pareamento por proximidade de desempenho, nunca aleatório.**
- **Quem perde não perde pontos**, só ganha menos que quem venceu.
- **Evento:** a modalidade individual sempre existe; quem não está em guilda participa sozinho sem perder nada; a composição da guilda é congelada na abertura.
- **Medalha de participação para todo mundo que participar**, junto com a de destaque.

## 4. Grade (1164px úteis)

```
[seletor flutuante]
┌ cabeçalho: CONEXÕES DA JORNADA / Social / subtítulo ───────────────────────────────────────────┐
┌ atalhos: Evento · Arena · Batalhas · Convites 1 · Amigos 6 · Encontrar 9 · Guildas 2 ──────────┐
┌ coluna principal (8/12) ─────────────────────────────┐ ┌ coluna lateral (4/12, sticky) ─────────┐
│ EVENTO EM ANDAMENTO (herói)                           │ │ Online agora                           │
│ ARENA (ranqueada)  — classificação + seu confronto    │ │ Guilda em destaque (+ chat)            │
│ BATALHAS — lançar + desafios abertos                  │ │ Guildas no evento                      │
│ CONVITES · AMIGOS · ENCONTRAR COLEGAS (aprovados)     │ │ Sua rede                               │
│                                                       │ │ Guildas da turma                       │
└───────────────────────────────────────────────────────┘ └────────────────────────────────────────┘
```
O que a Geis aprovou na revisão 02 (convite, grade de amigos, guilda em destaque, rede) **fica igual**, só desce na página. Os atalhos continuam sendo pílulas que **rolam até o bloco** (não são abas).

## 5. Blocos novos

### 5.1 Evento em andamento (`#evento`)
Card herói largura toda da coluna: fundo `linear-gradient(160deg, elev, surface)`, borda `accent` 1px, raio 16, `padding 22px 24px`.
- Topo: chip `success` **"Aberto"** + "6º ano B · Equações do 1º grau · 06/10–12/10".
- Título Georgia 700 22: **"Semana das Equações"**. Descrição 13 `textMuted`: "Resolva missões e desafios de Equações do 1º grau. A turma tem uma meta coletiva e a arena está aberta."
- **Como você participa:** chip "Em guilda · Legião Azul" (ou "Individual"). Nota 12: "A modalidade individual sempre existe. Quem não está em guilda participa sozinho, sem perder pontos."
- Três mini-blocos em grade de 3 (fundo `bg` 60%, raio 12):
  - **Missões** "2 de 3" + barra;
  - **Meta da turma** "1.120 de 1.500 pts" + barra ("objetivo coletivo, separado da sua pontuação");
  - **Seus pontos no evento** "38 de 60" (entram no rank principal da turma).
- Pé: recompensa "Medalha de participação garantida · Destaque para o melhor resultado · +40 moedas" e botão primário **"Continuar missões"** (→ `03-trilha.html`).

### 5.2 Arena (`#arena`) — a ranqueada
Card com a arte `arena-<perfil>.webp` ao fundo (como no Ranking: imagem a 55% + degradê para `bg`), raio 16, `padding 22px 24px`.
- Cabeçalho: eyebrow **"ARENA · SEMANA DAS EQUAÇÕES"**, título Georgia 22 **"Arena de batalhas"**, chips "Critério: Pontuação" e "12 inscritos".
- Duas colunas (`1.1fr 1fr`, gap 20):
  - **Seu confronto desta rodada** (card `surface` 85%): dois lados com avatar 56, nome e placar Georgia 32: **Amina T. 64 × 61 Bianca L.**; o estado vai no rótulo do card: "Seu confronto desta rodada · **você está vencendo**" (`success`), "empate" ou "você está perdendo". Linha: "Vitória por acerto. Tempo só desempata." Botão primário **"Responder rodada"** (3 questões de Equações). 
  - **Classificação da arena** (top 5 + você): posição, avatar 28, nome, valor "pts". Amina destacada em 4º. Dados: 1º Kwame R. 92 · 2º Marina S. 88 · 3º Diego A. 81 · **4º Amina T. 64 (você)** · 5º Bianca L. 61.
- Pé (12 `textSubtle`): "Pareamento por proximidade de desempenho, nunca aleatório. Quem perde não perde pontos, só ganha menos. O ranking da arena não muda sua posição no ranking da turma."
- Estado **"Fora da arena"**: no lugar do confronto, texto "Entrar na arena é opcional." + botão **"Entrar na arena"**.
- Estado **"Sem arena"** (nenhum evento com arena): card compacto "Nenhuma arena aberta agora. Quando seu professor abrir um evento com arena, ela aparece aqui." (texto adaptado do V9).

### 5.3 Batalhas (`#batalhas`) — desafios rápidos
Título de bloco "BATALHAS". Duas partes:
1. **Lançar uma batalha** — 5 cards pequenos em grade de 5 (ou 3+2), um por modo do banco, cada um com ícone de traço, nome e uma linha:
   - **Duelo** — "Você contra um colega, mesmas questões." (espadas cruzadas, o ícone `sword-cross` do app)
   - **Duplo** — "Você e um colega contra outra dupla."
   - **Velocidade** — "Quem acerta mais rápido."
   - **Precisão** — "Quem erra menos."
   - **Todos** — "A guilda inteira responde junto."
   Clicar abre um diálogo: escolher **com quem** (amigos online primeiro, ou a guilda) e **o tópico** (só tópicos liberados para os dois, regra `fn_questao_liberada`), 3 questões. Botão "Lançar desafio".
2. **Desafios abertos** — lista de linhas (64px): ícone do modo, título, quem, estado, ação:
   - "**Diego A.** te desafiou · Duelo · 3 questões de Equações" — **Aceitar** · Recusar
   - "**Legião Azul** · Precisão · você respondeu 2 de 3" — **Continuar**
   - "Você venceu **Zuri & Mateo** · Velocidade · 3 × 2" — chip "Encerrado"
   Nota: "Questões bloqueadas para você não aparecem: só entra o que você já liberou na trilha."

### 5.4 Amigos ganham "Desafiar"
Na grade de amigos aprovada, o botão de conversa continua; o "Desfazer" vai para um menu de 3 pontos e no lugar dele entra **"Desafiar"** (abre o diálogo do 5.3 já com o amigo escolhido). Desafiar é a ação que se repete; desfazer amizade é rara.

## 6. Coluna lateral
1. **Online agora** (`social_presenca_turma`): avatares 32 com ponto verde em linha, "5 colegas online" — Marina, Diego, Bianca, Rafael, Kwame. Clicar abre o perfil público.
2. **Guilda em destaque** (aprovado), com o botão "Abrir chat da guilda". Uma linha a mais: "Desafio de Precisão em andamento".
3. **Guildas no evento** (separado do rank individual, como no V9): 1º Exploradores do Norte · 2º **Legião Azul (sua)** · 3º Fênix Rubra. Nota: "O resultado da guilda existe só dentro do evento e não entra no ranking da turma."
4. **Sua rede** (aprovado).
5. **Guildas da turma** (aprovado).

## 7. Estados (seletor flutuante)
"Com dados" · "Sem evento aberto" · "Fora da arena" · "Desafio recebido" · "Sem convites" · "Sem amigos" · "Carregando" · "Erro"
- **Sem evento aberto:** os blocos Evento e Arena viram um card compacto "Nenhum evento aberto agora." e as Batalhas sobem.
- **Fora da arena:** ver 5.2.
- **Desafio recebido:** um aviso no topo da coluna principal (faixa `accent`): "Diego A. te desafiou para um Duelo" + Aceitar.

## 8. Não fazer
- Não trazer o card da Loja de volta.
- Não usar abas: os atalhos rolam até os blocos.
- Não mostrar a arena como algo obrigatório nem misturar o ranking da arena com o ranking da turma.
- Não usar barra de progresso normalizada na classificação da arena (o V9 proíbe com poucos participantes): mostre posição e valor.
- Não mudar o visual dos blocos aprovados (convite, amigos, guilda em destaque, rede).

## 9. Aceite
- [ ] Evento em andamento com missões, meta coletiva e seus pontos.
- [ ] Arena com confronto, classificação e as regras escritas (opt-in, não afeta o rank, perder não tira pontos).
- [ ] Batalhas com os 5 modos do banco e desafios abertos.
- [ ] Amigos com "Desafiar"; online agora; guildas no evento.
- [ ] Sem card de Loja; blocos aprovados intactos.
