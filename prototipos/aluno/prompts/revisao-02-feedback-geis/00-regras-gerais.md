PROMPT MESTRE — área web do aluno (TrailUp), revisão 02: aplicar o feedback da Geisbelly sobre o v1.
Cole isto inteiro, numa conversa nova, ANTES dos prompts de tela. Cada prompt de tela vem numa mensagem própria, junto com o HTML atual daquela tela.

---

Vou revisar um protótipo HTML estático e navegável (links `<a href>` reais entre arquivos) da **área web do aluno** do TrailUp. As telas já existem. Uma colega de equipe revisou cada uma e disse o que gostou e o que não gostou. Seu trabalho é **editar** cada tela para responder a esse feedback, **sem mexer no que ela aprovou**. Não é para redesenhar do zero.

## 0. O produto em 4 linhas
- TrailUp personaliza o estudo pelo "perfil de jogador" BrainHex do aluno (7 perfis: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever).
- O professor monta a trilha (tópicos → conteúdos + atividades); uma IA gera material por tópico e por perfil.
- O aluno percorre a trilha, faz atividades, ganha pontos e conquistas, compete em rankings e se conecta com colegas.
- A cor da interface vem do perfil do aluno. Não existe tema fixo.

## 1. O que NÃO muda em nenhuma tela
1. **Shell do v1**, idêntico em todas as telas logadas: grid `212px minmax(0,1fr)` × `68px minmax(0,1fr)`, altura `100vh`.
   - Topbar 68px: marca "TrailUp" (Georgia 700 20 + logo 32) · "Área do aluno" (12 `textSubtle`) · à direita, conta (avatar 36 com borda `accent`, nome 13/600, perfil 11 `textSubtle`), botão Bag (ícone 20) e Sair.
   - Sidebar 212px: itens Trilha, Notificações (contador), Social, Ranking, Perfil. Item de 13px, `padding: 13px 14px`, raio 6. Ativo: fundo `accentMuted`, borda `borderStrong`, ícone em `accent`. Inativo: texto `textMuted`, sem borda.
   - Não trocar pela sidebar de 264px da revisão 01. Configurações e Biblioteca foram aprovadas com este shell.
2. **Tokens de cor** do v1, que já estão no `:root` de cada arquivo e vêm da fórmula de `profileShellPalette.ts`. Exemplo Conqueror: `--bg #0b1328`, `--surface #121e3f`, `--elev #192a57`, `--border #28428a`, `--border-strong #4d6fcb`, `--text #f3f4f7`, `--accent #6f90eb`, `--accent-strong #1942b2`. Derivados: `accentSoft` = accent a 18%, `accentMuted` = accent a 12%, `textMuted` = text a 82%, `textSubtle` = text a 62%, `line` = border a 55%. Estados fixos: success `#5fd99a`, warning `#e0b34d`, danger `#e2574c` (texto `#f0847c`).
3. **Tipografia:** títulos em Cinzel 700, corpo em Inter.
4. **Assets:** só os da pasta `assets/` ao lado do HTML. Não inventar imagens.
5. **Configurações (`11`) e Biblioteca de conquistas (`09`) não são editadas.** Foram aprovadas.

## 2. Regras que valem em TODAS as telas desta revisão (vieram do feedback)

### 2.1 Tirar a etiqueta de estado do topo
Várias telas do v1 têm um `<span class="tag">` ou `<div class="tag">` no topo do conteúdo, com texto tipo "SOCIAL — AMIGOS (COM CONVITE PENDENTE)". A Geisbelly marcou essa etiqueta em vermelho em duas telas ("esse de cima não faz sentido, pode tirar"). **Remova em todas.** Ela era anotação do protótipo e parecia breadcrumb do produto.

Para mostrar estados diferentes da tela (vazio, carregando, erro…), use o **seletor de pré-visualização flutuante** que a Trilha já usa: pílula fixa no topo, centralizada sobre a topbar (`position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 40`), com "Pré-visualização de estado:" + `<select>` e, quando fizer sentido, as 7 bolinhas de perfil. A Geisbelly viu esse seletor na Trilha e não reclamou. Aceite `?estado=<chave>` e `?perfil=<perfil>` na URL.

### 2.2 Nada de área vazia
"Esse espaço vazio é para q" e o X laranja no Social vieram do mesmo problema: o v1 limitava a coluna de conteúdo com `max-width` (760px, 820px) e o resto da largura ficava vazio. Na tela de referência de 1440×900, o `console-main` tem **1228px** de largura.
- O conteúdo ocupa a largura toda do `console-main`, com `padding: 28px 32px`. Largura útil: **1164px**.
- Quando houver coluna lateral, ela precisa ter conteúdo útil **da altura da coluna principal** ou ser sticky com conteúdo que justifique. Coluna com dois cartões e 500px vazios embaixo não serve.
- Grade de referência dentro dos 1164px: 12 colunas, gap 20 (coluna = 78,33px). Os prompts de tela usam spans, ex.: "7/12 + 5/12" = 669,17 + 474,83.

### 2.3 Lista, não mosaico, para coisas lidas em sequência
"Listagem é melhor." Notificações, convites e itens de atividade são lidos de cima para baixo. Grade de cards em 2 colunas só para itens que se comparam lado a lado (amigos, conquistas).

### 2.4 Mestre-detalhe no lugar de navegar para outra página
No app mobile, abrir um item leva para outra tela. Na web, com largura sobrando, o detalhe abre **ao lado** da lista, e a lista continua visível. Cada item tem âncora na URL (`#n-3`, `#pontos`) para o link direto funcionar.

### 2.5 Acessibilidade mínima (o v1 já seguia; não regredir)
- Itens clicáveis são `<a>` ou `<button>`, nunca `<div>` com cursor.
- Estado não depende só de cor: ícone, peso da fonte ou texto junto.
- Foco visível: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Contraste de texto ≥ 4,5:1 sobre o fundo real, inclusive sobre imagem de cenário (use camada escura ou `text-shadow`).

## 3. Como entregar cada tela
- Um arquivo HTML completo, com o mesmo nome do atual (`v2/NN-nome.html`), CSS e JS inline, como o v1.
- Manter todos os `href` para as outras telas.
- Ao fim, uma lista curta: o que mudou, o que ficou igual de propósito e o que foi proposta sua (não veio do app nem do feedback).
