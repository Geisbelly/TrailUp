# Trilha — descrição detalhada do estado atual (com dados reais)

Descrição exata do que aparece nos 8 prints enviados, elemento por elemento. Turma usada como exemplo: "SPD - 3N 2026/2", com 5 tópicos cadastrados (Introdução, SPD - Aula 2, SPD - Aula 3, SPD - Aula 4, SPD - Aula 5).

> Nota à parte: em todos os prints aparece, no canto inferior esquerdo da tela, um aviso "⚠ Alerta de baixa... / Emitido agora" — isso é uma **notificação do Windows** (provavelmente bateria fraca do notebook), não faz parte da interface do TrailUp. Ignorar.

## Mapa de correspondência entre os prints

| Print (ordem enviada) | O que mostra | Relação com os outros |
|---|---|---|
| 1 | Tela base da Trilha, com o dropdown de classe **aberto** (mostrando as opções) | Estado de interação sobre a tela base. |
| 2 | Modal **"Novo Tópico"** aberto por cima da tela base | Acionado pelo botão "+ Novo Topico" da tela base. |
| 3 | Tela base da Trilha, dropdown fechado, layout dos nós igual ao do print 1 | Mesmo estado do print 1, sem o menu aberto — mostra a legenda completa que estava tampada. |
| 4 | Painel de tela cheia **"Editar Trilha de Conhecimento"** (tópico "Introdução"), com o formulário **"Novo Conteúdo"** aberto à direita, topo | Aberto ao clicar para editar o tópico "Introdução". Continua no print 5. |
| 5 | Mesmo painel, rolado — fim do formulário "Novo Conteúdo" (textarea + botões de ação) | Continuação do print 4. |
| 6 | Tela base da Trilha novamente, mas com o **layout dos nós mudado**: agora em fileira reta conectada por setas retas (antes eram linhas curvas) | Estado seguinte aos prints 4-5 (depois de sair do editor do tópico) — os nós foram reorganizados/arrastados. |
| 7 | Idêntico ao print 6 (mesmo layout, mesmo horário 19:51, mesmos dados) | Aparenta ser o mesmo estado do print 6, sem diferença visível. |
| 8 | Modal **"Nova Classe / Turma"** aberto por cima da tela do print 6/7 | Acionado a partir da tela base (provavelmente pela opção "+ Nova classe" do dropdown de classe). |

---

## Tela base "Trilha de Tópicos" (prints 1, 3, 6 e 7)

### Cabeçalho da página

- Título "TRILHA DE TÓPICOS" (fonte serifada), subtítulo "Escolha a classe, cadastre tópicos e defina dependências/pré-requisitos visualmente."
- Uma pílula de status, à direita do título, com ícone de "carregando" (círculo giratório) e fundo escuro com borda âmbar: **"⟳ 2 gerações em andamento · 10/10 alvos · 4 erros"** — os "4 erros" aparecem em vermelho dentro do mesmo texto.
- À direita da pílula de status: um seletor "SPD - 3N 2026/2" (dropdown da classe atual), o botão roxo **"+ Novo Topico"**, e o botão em tom bronze/âmbar **"Salvar dependências"**.

### Linha de legenda (abaixo do cabeçalho)

Texto corrido em cinza claro, com ícones/bolinhas coloridas embutidas:
"↕ Arraste o fundo para navegar · arraste o nó para reposicionar **🔵 Conector esquerdo (D) → Pré-requisito 🟢 Conector direito (N) → Próximo** Clique numa seta para removê-la"

(No print 1, o final dessa linha — "Clique numa seta para removê-la" — fica coberto pelo menu do dropdown de classe aberto.)

### Dropdown de classe aberto (só no print 1)

Menu suspenso abaixo do seletor, opções:
- "✓ SPD - 3N 2026/2" (destacada em roxo sólido, é a opção atualmente selecionada, com um check à esquerda)
- "2N - 2026"
- "+ Nova classe"

### Canvas com os nós da trilha

Fundo escuro, quadriculado bem sutil. Cada tópico é um cartão retangular com cantos arredondados e borda roxa fina, contendo:
- Ícone de documento (dentro de um círculo roxo) + título do tópico em negrito.
- Dois ícones no canto superior direito do cartão: lápis (editar) e lixeira (excluir).
- Uma ou duas "pílulas" de relação: **"? DEP [Nome do tópico]"** (fundo azulado) quando o tópico tem um pré-requisito, e/ou **"? NEXT [Nome do tópico]"** (fundo esverdeado) quando aponta para o próximo tópico da sequência.
- Rodapé do cartão: à esquerda o número de sequência (**#1, #2...**), à direita o id interno (**id:131, id:133...**), ambos em cinza pequeno.
- Dois pontos de conexão nas laterais do cartão: um círculo azul com a letra **"D"** no lado esquerdo, um círculo verde com a letra **"N"** no lado direito.

**Os 5 tópicos, com seus dados exatos:**

| Cartão | # | id | DEP (pré-requisito) | NEXT (próximo) |
|---|---|---|---|---|
| Introdução | 1 | 131 | — (não tem) | SPD - Aula 2 |
| SPD - Aula 2 | 2 | 133 | Introdução | SPD - Aula 3 |
| SPD - Aula 3 | 3 | 134 | SPD - Aula 2 | SPD - Aula 4 |
| SPD - Aula 4 | 4 | 135 | SPD - Aula 3 | SPD - Aula 5 |
| SPD - Aula 5 | 5 | 136 | SPD - Aula 4 | — (não tem) |

**Layout/posição dos cartões e das linhas de conexão — isto muda entre os prints 1/3 e os prints 6/7:**

- **Nos prints 1 e 3:** Introdução, SPD-Aula 2, SPD-Aula 3 e SPD-Aula 4 ficam lado a lado na mesma linha horizontal; SPD-Aula 5 fica sozinha, mais abaixo e à esquerda (por baixo de "Introdução"/"Aula 2"). As linhas de conexão são **curvas**: existe uma curva longa saindo de "SPD - Aula 4" (lado direito) que dá a volta por cima e desce até "SPD - Aula 5", e outra curva curta ligando "SPD - Aula 5" de volta para a esquerda, fora da tela visível.
- **Nos prints 6 e 7:** os 4 primeiros cartões continuam na mesma linha horizontal, mas agora ligados por **setas retas** (não mais curvas) apontando da direita de um cartão para a esquerda do próximo. "SPD - Aula 5" continua abaixo e à esquerda, mas agora ligada a "SPD - Aula 4" por uma **linha reta na diagonal**, e há uma pequena curva no canto inferior esquerdo do próprio cartão "SPD - Aula 5" (parece a mesma alça de conexão "solta" que aparecia antes).

### Controles de zoom (canto inferior direito, iguais em todos os prints da tela base)

Uma barra pequena com, da esquerda para a direita: botão "−" (diminuir zoom), o percentual atual **"85%"**, botão "+" (aumentar zoom), um ícone de tela cheia/ajustar, e um ícone de "mover" (setas em cruz).

---

## Modal "Novo Tópico" (print 2)

Card centralizado sobre o fundo escurecido da tela base.

- Título "NOVO TÓPICO" (esquerda) e botão "×" de fechar (direita).
- Subtítulo: "Crie um novo tópico de estudo".
- Campo **"Nome \*"** (obrigatório): input de texto vazio, com contorno roxo (em foco), placeholder "Ex: Introdução a Redes".
- Campo **"Descrição"**: textarea vazia, placeholder "Descrição do tópico".
- Campo **"Ordem"**: input numérico com o valor **"1"** já preenchido.
- Texto informativo, sem rótulo de campo: "Classe selecionada: SPD - 3N 2026/2".
- Botão grande, roxo, largura total: **"Criar Tópico"**.

---

## Painel "Editar Trilha de Conhecimento" (prints 4 e 5)

Ocupa a tela inteira (não é mais um modal pequeno). Aberto para o tópico **"Introdução"**.

### Cabeçalho do painel

- Ícone + título "EDITAR TRILHA DE CONHECIMENTO", subtítulo "Gerenciamento avançado de nós de conteúdo e avaliações."
- Canto superior direito: link "Cancelar" e botão roxo **"Salvar Trilha"** (com ícone de disquete).

### Coluna esquerda (painel do tópico, fixa — igual nos prints 4 e 5)

- **"TÍTULO DO TÓPICO"** — campo preenchido com "Introdução".
- Lado a lado: **"CLASSE"** — dropdown "SPD - 3N 2026/2"; **"ORDEM"** — campo "1".
- **"DESCRIÇÃO RÁPIDA"** — com um link roxo "⚡ Gerar com IA" alinhado à direita do rótulo; abaixo, uma textarea vazia, placeholder "Objetivos...".
- Linha divisória.
- **"NÓS DE CONTEÚDO"** com um contador em círculo mostrando **"1"**.
- Um botão/cartão tracejado, com borda e texto **verdes**, ícone "+": **"PREENCHENDO NOVO..."** — indica que uma criação está em andamento (o formulário à direita).
- Abaixo, o único nó de conteúdo já existente, num cartão cinza-escuro: número "1", um ícone de "arrastar" (pontinhos), título **"Introdução"**, e duas etiquetas: **"ARQUIVO"** (cinza) e um selo verde com check e o número **"12"**.

### Coluna direita — formulário "Novo Conteúdo" (topo no print 4, fim no print 5)

- Cabeçalho: ícone "+" e título "NOVO CONTEÚDO"; à direita, "× Cancelar".
- **"TÍTULO DO CONTEÚDO"** — input vazio, placeholder "Ex: Introdução à Lógica".
- **"FORMATO"** — dropdown com o valor **"Texto / Artigo"** selecionado.
- **"MATERIAL (MARKDOWN)"** — uma grande caixa de texto vazia, placeholder "# Digite seu conteúdo aqui...". No canto inferior direito da caixa (visível no print 5, quando ela está vazia/sem foco) aparece uma pequena etiqueta cinza "Markdown Suportado".
- Rodapé do formulário (visível no print 5): à esquerda um botão de contorno roxo **"✨ Sugerir Cards & Atividades"**; à direita um botão preenchido **verde** **"+ Criar Conteúdo"**.

---

## Modal "Nova Classe / Turma" (print 8)

Sobre o fundo da tela base (no layout já reorganizado dos prints 6/7).

- Ícone de capelo + título "NOVA CLASSE / TURMA", botão "×" de fechar.
- Subtítulo: "Crie a turma para gerenciar tópicos e conteúdos no console."
- **"DESCRIÇÃO DA TURMA \*"** — input com contorno roxo (em foco), placeholder "Ex: Turma 2026.1 - Programação Web".
- **"MATÉRIA EXISTENTE"** — dropdown, placeholder "Selecione ou crie uma nova abaixo".
- **"NOVA MATÉRIA (opcional)"** — dois campos: input "Nome da matéria" e textarea "Descrição da matéria".
- Rodapé: link "Cancelar" à esquerda, botão roxo com ícone de capelo **"🎓 Criar Classe"** à direita.

---

## Observações factuais (sem julgamento de design, só o que salta aos olhos nos dados)

- A pílula "2 gerações em andamento · 10/10 alvos · 4 erros" fica visível **o tempo todo** na tela base, em todos os 4 prints dela — não é algo que aparece só ao clicar em "Gerar"; parece ser um indicador persistente de status da turma inteira.
- O texto das pílulas de relação usa literalmente o prefixo "**?**" antes de "DEP" e "NEXT" (ex.: "? DEP", "? NEXT") — não é reticência minha, é o texto exato que aparece na tela.
- O selo verde "12" no nó de conteúdo "Introdução" (print 4) não tem rótulo explicando o que aquele número representa (aparece ao lado da etiqueta "ARQUIVO").
- Entre os prints 1/3 e os prints 6/7, o **estilo da linha de conexão muda** de curva para reta, e a posição relativa dos cartões parece a mesma — não ficou claro, só pelos prints, se isso foi uma ação manual (arrastar) ou uma re-renderização automática do mesmo grafo.
