Tela 00 — **Entrada** (+ estado "Bem-vindo(a) de volta"). Arquivo de saída: `v2/00-entrada.html`.

Use o sistema visual do prompt mestre. Esta é uma tela **pré-login**: paleta **Pré-login** (§2.1), sem header, sem sidebar, sem seletor de perfil. Mantenha só o seletor de estado.

## 1. Fonte da verdade
- `mobile/src/app/(auth)/index.tsx` (entrada) e `mobile/src/app/(auth)/tela.tsx` (transição de 2s).
- Assets: `assets/entry-world.webp` (cenário público), `assets/trailup-brand-logo.png` (marca).

## 2. O que a tela precisa comunicar
É a primeira coisa que o visitante vê. Duas saídas, com peso visual diferente: **"Já tenho conta"** (principal, uso diário) e **"Criar conta"** (secundária, leva para fora do app). Não há guardião antes do login, só marca e cenário.

## 3. Grade (1440×900)

```
┌──────────────── painel de cenário 800px ────────────────┬──────── painel de ação 640px ────────┐
│ entry-world.webp cover                                   │  fundo background                    │
│ marca no canto sup. esq. (40,40)                         │  bloco central 400px, centralizado   │
│                                                          │  vertical e horizontalmente          │
│ legenda no canto inf. esq. (40, bottom 40)               │                                      │
└──────────────────────────────────────────────────────────┴──────────────────────────────────────┘
```
- `display: grid; grid-template-columns: minmax(0, 1fr) 640px; height: 100vh;`. Entre 1024 e 1279px, o painel de ação fica com 520px.
- Fronteira entre os painéis: `border-left: 1px solid var(--line)` no painel de ação.

## 4. Blocos

### 4.1 Painel de cenário (esquerda)
- `<img src="assets/entry-world.webp">` com `object-fit: cover; width: 100%; height: 100%;`, sem opacidade reduzida (é o único lugar em que o cenário aparece inteiro).
- Sobreposição: `linear-gradient(90deg, transparent 60%, background 100%)` para fundir com o painel da direita, mais `linear-gradient(to top, rgba(0,0,0,.55), transparent 45%)` para a legenda.
- **Marca** em `position: absolute; top: 40px; left: 40px;`: logo 40×40 + "TrailUp" em Cinzel 700 30 `text`, gap 12. (O app usa 40px e 38px de fonte, centralizado; aqui ela vai para o canto porque a ação fica à direita.)
- **Legenda** em `bottom: 40px; left: 40px;` largura máx. 440: Inter 400 14/1.6 `textMuted`: "Trilhas de estudo que se adaptam ao seu jeito de jogar." Esse texto **não existe no app**. Se a revisão pedir fidelidade estrita, remova o bloco inteiro; não troque por outra frase.

### 4.2 Painel de ação (direita)
Fundo `background`. Bloco central com largura 400, `display: flex; flex-direction: column; gap: 12px;`:
1. Eyebrow "ÁREA DO ALUNO" (§3), centralizado. `margin-bottom: 4px`.
2. **Título** "Sua próxima conquista começa aqui." em Cinzel 700 30/1.25 `text`, centralizado, `margin-bottom: 24px`. É o texto do app (25px lá).
3. **Botão primário** "Já tenho conta", largura 100%, **altura 56** (a mesma do app), fonte 16, ícone seta-para-direita 20 **à direita** do rótulo (no app a seta vem depois do texto), gap 12. Leva ao estado "Bem-vindo(a) de volta" (§5.2) e dali a `01-login.html`.
4. **Botão secundário** "Criar conta", largura 100%, altura 54, fonte 16, ícone "pessoa com +" 20 à **esquerda** em `accent`, texto `accent` (no app o texto é na cor primária, não branco), borda `1px solid borderStrong`, fundo `surface`. Ao lado do rótulo, ícone "abre em nova aba" 14 `textSubtle` e `aria-label="Criar conta (abre o site de cadastro em nova aba)"`. `href="#"` com `target="_blank"`. **Não desenhe o cadastro.**
5. Nota abaixo, `margin-top: 8px`, centralizada, 12/1.5 `textSubtle`: "O cadastro e o questionário de perfil acontecem no site do TrailUp." Adaptação web, não está no app. Explica o ícone de nova aba.

## 5. Estados (seletor: "Entrada" · "Bem-vindo(a) de volta")

### 5.1 Entrada
Conforme §4.

### 5.2 Bem-vindo(a) de volta (transição de 2s, `tela.tsx`)
Tela inteira (sem os dois painéis), fundo `background` + camada de salão (`HallBackground`: a faixa atmosférica da §5.4 do mestre com opacidade 1). Conteúdo centralizado, coluna, gap 10:
- Título "BEM VINDO(A) DE VOLTA!" em Cinzel 700 34/1.2, cor `#ffffff`, `letter-spacing: .04em`.
- Subtítulo "Sentimos sua falta, ficamos felizes que tenha voltado." em Inter 400 16/1.6, cor `rgba(255,255,255,.72)`, **duas linhas**, quebra depois de "felizes" (como no app).
- Anel 120×120, `border: 2px solid <accent a 55%>`, raio 50%, `margin-top: 22px`, com o logo 64×64 no centro e brilho de destaque (§4 do mestre).
- Barra de progresso fina de 2s embaixo do anel (largura 160, altura 3, trilho `surfaceElevated`, preenchimento `accent`, animação linear 2s), para mostrar que a tela avança sozinha. Adaptação web.
- No protótipo, depois de 2s vai para `01-login.html`. Com o seletor em "Bem-vindo(a) de volta", ela fica parada (não redireciona) para inspeção.

## 6. Interações
- Enter/Espaço no botão focado aciona. Foco inicial em "Já tenho conta".
- Hover dos botões conforme §7.1 do mestre.

## 7. Não fazer
- Não pôr guardião, perfil BrainHex ou cor de perfil aqui.
- Não desenhar formulário de cadastro nem o questionário.
- Não usar o violeta `#9b5de5` do V7: a marca do aluno é `#c1a1ff` (via fórmula).

## 8. Aceite
- [ ] Painéis 1fr / 640px, cenário inteiro à esquerda com o degradê de fusão.
- [ ] Título e botões com os textos exatos do app; seta à direita no primário, ícone à esquerda no secundário.
- [ ] "Criar conta" sinalizado como saída externa (ícone + `aria-label`).
- [ ] Estado "Bem-vindo(a) de volta" com o texto em caixa alta e o subtítulo em duas linhas.
- [ ] Nenhum token de perfil. Só a paleta Pré-login.
