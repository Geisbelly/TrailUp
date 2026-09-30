Prompt final de ajuste — tela **Trilha**. Esta é a tela mais crítica de todo o console. **Importante:** o que está no ar hoje é mais simples do que uma versão anterior que já tinha sido parcialmente corrigida — este prompt pede para reconstruir a tela inteira com a hierarquia completa, não só ajustar o que existe agora.

## A hierarquia correta (não é negociável — está errado se não for isto)

**Trilha → Tópicos → Conteúdos → (Cards e Questões, dentro de cada conteúdo).**

- Cards e Questões **nunca** são irmãos de "Conteúdos" no mesmo nível — eles vivem **dentro** de um conteúdo específico.
- Um Card pode estar vinculado a **mais de um** conteúdo (reaproveitamento) — a interface precisa mostrar isso (ex.: selo "em 2 conteúdos") e permitir vincular um card já existente a um novo conteúdo, em vez de forçar recriar.
- Questões pertencem ao conteúdo selecionado, não ao tópico como um todo solto.

## Tela 1 — Mapa da Trilha (canvas com os tópicos)

### MANTER

- Cabeçalho: título "Trilha de Tópicos" + subtítulo.
- A pílula de status "⟳ N gerações em andamento · X/Y alvos · N erros", à direita do título.
- Seletor de classe, botão "+ Novo Tópico", botão "Salvar dependências" — mesma posição, canto superior direito.
- Os cartões de tópico no canvas: ícone + título + pílulas "DEP"/"NEXT" indicando pré-requisito/próximo + número de sequência (#N) + id — mantenha esse cartão como está.
- Controles de zoom no canto inferior direito (−, %, +, ajustar à tela).

### REMOVER

- A linha de legenda atual ("Arraste o fundo para navegar... Conector esquerdo (D)... Conector direito (N)... Clique numa seta para removê-la") pode ficar mais discreta — hoje ocupa uma linha inteira de texto corrido; considere um ícone de "?" com tooltip, ou texto bem menor, para não competir visualmente com o canvas.

### ADICIONAR / CORRIGIR

- **Arrastar os nós livremente.** Cada cartão de tópico precisa poder ser reposicionado à mão dentro do canvas (isto é diferente de arrastar o fundo para navegar — é mover o próprio cartão). Confirme que isso funciona e persiste a posição.
- **Barra de rolagem customizada.** Onde quer que apareça uma barra de rolagem (painéis laterais, listas longas), ela precisa ter o estilo visual do console (fina, na paleta de cores do tema) — nunca a barra padrão cinza/genérica do navegador.

## Tela 2 — Editor de um Tópico (ao clicar/editar um cartão do mapa)

Isto precisa ser **reconstruído** com esta estrutura, de cima para baixo:

### Cabeçalho do editor

- Título "Editar Tópico" (ou nome do tópico), com ações "Cancelar" e "Salvar" no canto superior direito — igual ao padrão já usado.
- Uma indicação simples de contexto (ex.: "Física I › Vetores") — **não** repita o formato confuso de breadcrumb com "Onde estou" testado antes; algo mais simples como um texto pequeno acima do título já resolve.

### Coluna esquerda — dados do tópico (fixa, não rola junto com o conteúdo)

- Campo "Título do Tópico".
- Campos "Classe" e "Ordem" lado a lado.
- Campo "Descrição rápida" com atalho "Gerar com IA".
- Abaixo, a lista de **Conteúdos** deste tópico (não "Nós de Conteúdo" genérico — nomeie como "Conteúdos"). Cada item da lista mostra: ícone do formato (texto/PDF/vídeo/link), título do conteúdo, e um contador de quantas questões tem. Um botão "+ Novo Conteúdo" no topo desta lista.

### Coluna direita — detalhe do conteúdo selecionado na lista da esquerda

Ao clicar num conteúdo da lista à esquerda, a coluna direita mostra, de cima para baixo:

1. **Cabeçalho do conteúdo:** título, formato, e se for um arquivo (PDF, etc.), um botão/link "Pré-visualizar arquivo" que abre o arquivo anexado (hoje isso não existe — só aparece o nome do arquivo e "extraindo conteúdo (N de M páginas)", sem forma de abrir/ver o PDF em si).
2. **Corpo do conteúdo** (texto/markdown) editável, como já existe hoje no formulário "Novo Conteúdo".
3. **Seção "Cards vinculados a este conteúdo"**: uma lista de cards (título + descrição curta), cada um com um selo indicando em quantos outros conteúdos ele também aparece (ex.: "em 2 conteúdos", ou "só aqui" se for exclusivo). Botão "+ Vincular card existente" (escolher um card já cadastrado em outro conteúdo do mesmo tópico) e botão "+ Novo card" (criar do zero). **Os cards editam-se clicando neles** — hoje não dá para editar um card existente, só criar; corrija isso.
4. **Seção "Questões deste conteúdo"**: lista de questões (enunciado + tipo: múltipla escolha/verdadeiro-falso/dissertativa + pontos), cada uma com ações "Editar", "Duplicar", "Excluir". Botão "+ Nova questão".

### O que isso substitui

Isso substitui tanto a versão simplificada de hoje (só uma lista "Nós de Conteúdo" sem Cards nem Questões visíveis) quanto a versão anterior com "Conteúdos 4 / Cards 6" como duas abas separadas no nível do tópico — nenhuma das duas está certa. A estrutura certa é: **conteúdo selecionado → cards dele + questões dele, ambos visíveis ao mesmo tempo na coluna direita**, não abas concorrentes.

## Tela 3 — Fluxo "Gerar Trilha com IA"

O botão continua no mesmo lugar (mapa da trilha, canto superior direito). O que precisa existir é o fluxo em etapas visíveis: **Configurar → Gerar → Processando → Resultado → Revisar → Ajustar.**

- **Configurar:** o modal/formulário atual de descrever o que quer (mantenha).
- **Processando:** enquanto gera, mostrar um estado de progresso com uma frase curta do que está acontecendo naquele momento (ex.: "Analisando o material enviado...", "Montando o tópico 3 de 8...") — nunca só um spinner genérico parado.
- **Resultado + Revisar/Ajustar:** depois de gerado, mostrar a proposta (lista de tópicos sugeridos) com a opção de pedir ajustes pontuais antes de aceitar (ex.: "esse tópico não devia aparecer" ou "aprofunde mais o tópico 2") — não só "aceitar tudo" ou "descartar tudo".

A pílula de status "2 gerações em andamento · N/N alvos · N erros" que já existe no topo da tela do mapa pode continuar sendo o indicador persistente de que há gerações acontecendo em segundo plano — isso está bom, não precisa mudar.
