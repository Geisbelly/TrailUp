# Celular v1 — regras gerais (cole inteiro antes de qualquer tela)

Você está prototipando o **app do aluno do TrailUp no celular**. A referência visual é o **protótipo web v4** (`prototipos/aluno/v4/`): mesma identidade, mesmos textos, mesmos dados de exemplo, mesmos estados. O trabalho é **adaptar**, não reinventar: o que o v4 decidiu (hierarquia, nomes, mensagens de erro, ordem dos blocos) continua decidido. O que muda é o que a tela pequena e o toque exigem.

O contexto do produto (perfis BrainHex, fórmula da paleta, guardiões, tipografia, contraste AAA) está em `../00-contexto-geral.md` e continua valendo inteiro.

## 1. O aparelho

- **Quadro de referência: 390 × 844** (iPhone 14 / Pixel 7 em pontos). Desenhe para essa largura e confira que nada quebra em **360** (Android pequeno) nem estoura em **430** (iPhone Pro Max).
- Cada HTML mostra a tela **dentro de uma moldura de aparelho** quando aberto no computador (cantos de 44px, barra de status falsa com `9:41`, indicador de início embaixo) e **ocupa a tela inteira** quando aberto num celular de verdade (largura até 500px): aí a moldura e a barra de status falsa somem. A moldura é `assets/aparelho.css`, compartilhada por todas as telas.
- **Áreas seguras:** nada de texto ou botão nos 47px de cima (barra de status) nem nos 34px de baixo (indicador de início). Use `env(safe-area-inset-*)` no modo tela cheia.
- O seletor de **pré-visualização de estado** fica **fora** do aparelho, em cima, como no v4 (`?estado=` na URL continua funcionando).

## 2. Toque, não mouse

- **Alvo de toque mínimo de 48 × 48px** (botão, link de texto isolado, ícone). Link no meio de uma frase pode ser menor, desde que a frase tenha altura de linha ≥ 20px.
- **Nada depende de hover.** O que no v4 aparecia no hover (dica, botão "…") vira visível ou vai para um toque longo / menu.
- Campos de 52px de altura, fonte de **16px** nos `input` (abaixo disso o iOS dá zoom ao focar).
- **Teclado:** toda tela com campo tem um estado "teclado aberto". O conteúdo sobe para o campo focado continuar visível, e o botão principal continua alcançável sem fechar o teclado.

## 3. Navegação

- **Antes do login:** sem barra de abas. Voltar é um botão no canto superior esquerdo (48px, seta + rótulo curto), além do gesto/botão do sistema.
- **Depois do login:** **barra de abas inferior** (o app já tem: Trilha, Notificações, Social, Ranking, Perfil). A barra lateral do v4 **não** existe no celular. A Loja, que no v4 é item da barra lateral, volta a ser aberta pelo Perfil e pelo Social; a parte da Loja decide o atalho.
- **Coluna lateral do v4 vira bloco empilhado** abaixo do conteúdo principal, ou uma folha que sobe de baixo (bottom sheet) quando é consulta rápida. Cada parte decide qual, e diz por quê.
- Modais do v4 viram **folhas de baixo** (cantos de 20px só em cima, alça de 36 × 4px) quando são ação curta, ou **tela cheia** com "Fechar" no topo quando são longos.

## 4. Visual

- Mesmos tokens do v4 por tela (a entrada/login usa a paleta da marca, sem perfil; as telas logadas usam a paleta do perfil da aluna de exemplo, **Amina T., Conqueror**).
- Raio de 6–8px nos cartões e campos, como no v4. Só as folhas de baixo têm 20px.
- Títulos em Georgia; corpo em `system-ui`/Inter, como no v4.
- **Animação respeita `prefers-reduced-motion`**, como no v4.

## 5. Peças compartilhadas

- `assets/aparelho.css` e `aparelho.js`: moldura, barra de status, indicador de início e o teclado falso (`teclado(true)`).
- `assets/tema.js` e `app.css` (telas logadas): os 7 perfis e a fórmula da paleta do v4, a barra de abas (`abasHTML`), o hexágono dos tópicos (`hexSVG`), a folha de baixo, os chips e o seletor de perfil no `.preview` (`?perfil=` na URL).
- **Artes:** as telas logadas usam direto as do v4 (`../v4/assets/`: emblemas, rostos, cenários de mapa e trilha, Bag, moedas), sem copiar. Copiar só o que for novo do celular.

## 6. Entrega de cada parte

1. Este prompt + o prompt da parte (`telas/…`).
2. Os HTML em `prototipos/aluno/mobile-v1/`, com os mesmos nomes do v4 (`00-entrada.html`…), cada um com o seletor de estado.
3. Uma linha na tabela do `README.md` marcando a parte como aplicada.
