# Parte 2 — Trilha (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/03-trilha.html`.

## De onde vem

- **v4:** `03-trilha.html`. Topo com a marca, a Bag e o avatar; barra lateral; HUD de vidro (emblema, "Mapa da jornada · Reinos de Matemática" ou "Sua trilha · Matemática", 56% e "4 de 8 módulos", botão do guia); tabuleiro no modo do perfil (**mapa** para Seeker, Daredevil e Conqueror; **árvore** para Survivor e Mastermind; **lista** para Socializer e Achiever), sem seletor de modo; painel à direita com o tópico selecionado; o guia (mentor) num botão redondo no canto; celebrações dos portões; tutorial.
- **App hoje:** `app/(tabs)/trilha/index.tsx` → `TrilhaBase` (o mapa `MapaViewStable`, a árvore `TrilhaArvoreSimple` e a lista `TrilhaLinearList`), barra de abas inferior, `BagModal` e `EscolhaTurma`.

## O que fica igual ao v4 (não mude)

- Os 8 tópicos de exemplo, com os mesmos estados (4 concluídos, "Equações do 1º grau" em andamento a 43% e personalizado, "Razão e Proporção" disponível, "Porcentagem" e "Geometria Plana" bloqueados com pré-requisitos), os nomes de país e capital do mapa e a justificativa da personalização.
- O modo vem do perfil, sem seletor. O seletor de perfil (7 bolinhas) fica no seletor de pré-visualização, fora do aparelho.
- O hexágono por estado (concluído, em andamento, disponível, bloqueado), o selo "Você parou aqui" com o rosto do guardião e as cores do território.
- Os textos do painel: "Você parou aqui", "Próximo disponível", "Concluído", "Conteúdo selado", "Pré-requisitos: …", "Continuar", "Iniciar tópico", "Revisar tópico", "Módulo personalizado", "Conversar com …".
- Os estados do seletor: Com dados, Tópico bloqueado selecionado, Tópico concluído selecionado, Carregando, Vazio, Erro, Escolha de turma, Sem turma, Progresso desatualizado, Aluno novo (Social e Ranking bloqueados), Cerimônia: Amizades liberadas.

## O que muda no celular

### Topo
- **Barra do topo de 56px** (abaixo da área segura): emblema do perfil (32px) + "Mapa da jornada" (eyebrow) e "Reinos de Matemática" (Georgia 18, uma linha, reticências); à direita, a **Bag** (arte do perfil, 44px) e o botão do **guia tutorial** ("?", 44px). O avatar sai do topo: o Perfil já é uma aba.
- **Progresso logo abaixo**, numa linha: barra de 6px + "56% · 4 de 8 módulos". Com "Progresso desatualizado", a contagem vira o chip de aviso.

### Tabuleiro (ocupa o resto, rola na vertical)
- **Mapa:** o continente vira **2 colunas × 4 fileiras** (no v4 são 4 × 2), em serpentina de cima para baixo, com a estrada ligando as capitais. Rola na **vertical** (no v4 rolava na horizontal). Hexágono de 56px, nome do país em 2 linhas no máximo.
- **Árvore:** uma coluna, níveis de cima para baixo, rótulo ao lado do hexágono (48px). Níveis com dois tópicos (3 e 4) ficam lado a lado, com o rótulo embaixo.
- **Lista:** as linhas do v4 em largura total, 72px de altura.
- O tabuleiro abre rolado até o tópico em andamento.

### Painel → folha de baixo
- O painel do v4 vira uma **folha de baixo** com dois tamanhos:
  - **Recolhida** (sempre visível, logo acima da barra de abas): hexágono 40px, eyebrow + nome do tópico selecionado, e o botão principal ("Continuar", "Iniciar tópico" ou "Revisar tópico") à direita. Tocar na alça ou no nome expande.
  - **Expandida** (até ~70% da altura): o resto do painel do v4 (progresso do módulo, conteúdos e atividades, personalização com "Conversar com …", e "Todos os módulos (8)").
- **Tocar num nó seleciona e atualiza a folha recolhida**, com o botão principal à vista. Tocar no nó já selecionado abre o tópico. É a lição do #549: na web, o clique só trocava o painel lateral e o aluno achava que o nó não abria. No celular a folha fica embaixo do polegar e mostra o botão na hora; o segundo toque entra direto.
- **Nó bloqueado:** a folha expande sozinha com "Conteúdo selado" e os pré-requisitos (no lugar do modal do v4), com "Ver …" levando ao pré-requisito.

### Guia (mentor)
- O botão redondo do guardião fica no canto inferior direito, **acima da folha recolhida**. Abre o chat em **tela cheia**, com "Fechar" no topo e o campo de mensagem acima do teclado.

### Barra de abas
- Trilha (ativa) · Notificações (2) · Social · Ranking · Perfil, com ícone + rótulo, 64px + área segura.
- **Aluno novo:** Social e Ranking com cadeado; tocar abre a explicação do portão.
- **Cerimônia: Amizades liberadas:** tela cheia, com o emblema, "Amizades liberadas!", o texto do portão e "Ver o Social".

### Estados sem tabuleiro
- Vazio, Erro, Sem turma e Escolha de turma ocupam a área do tabuleiro, centralizados, com a barra de abas visível. Na Escolha de turma, os cartões das turmas ficam empilhados, em largura total.
- **Carregando:** esqueleto do topo, de 5 hexágonos e da folha recolhida, com "Carregando trilhas · Preparando sua jornada." 

## Fora do escopo desta parte

- O tutorial de primeiro acesso: fica para quando as abas todas existirem no celular, porque ele passa por elas.
- A Bag aberta (é a mesma folha em todas as telas; entra na parte do Perfil).
