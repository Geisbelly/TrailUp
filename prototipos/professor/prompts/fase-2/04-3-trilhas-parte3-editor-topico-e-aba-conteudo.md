# Prompt Fase 2 — Trilhas, PARTE 3 de 5: editor de tópico — estrutura + aba "Conteúdo"

Continuação das partes 1 e 2. Esta parte cobre o **editor de tópico** (abre ao clicar num cartão do mapa, na Parte 1): seu cabeçalho, a coluna esquerda (dados do tópico + lista de conteúdos), e a primeira das 3 sub-abas da coluna direita — **Conteúdo**. As abas "Atividades" e "Cards" vêm nas partes 4 e 5.

## Identificação
- Fonte de conteúdo: `Console Trilha.dc.html` da V5, anexado a este prompt (mesmo arquivo das partes anteriores) — o bloco do editor de tópico é o estado `showTopicEditor`.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Sem print específico — o conteúdo vem do código da V5.

## Cabeçalho do editor de tópico
Link "← Voltar à trilha" (volta ao mapa da Parte 1), divisor, título "Editar Trilha de Conhecimento" + trilha de contexto "Física I › {tópico} · gerenciamento de nós de conteúdo e avaliações", e à direita um indicador de salvamento automático (ponto + rótulo, ex. "Salvo às 15:47").

**Importante:** quando o editor de tópico está aberto, a barra superior do mapa (seletor de turma + botões "Gerar trilha com IA"/"Novo tópico"/"Salvar dependências", da Parte 1) **não aparece** — só o cabeçalho acima.

## Coluna esquerda (largura fixa, ~320px, rolável)
- Campo "Título do tópico".
- "Classe" e "Ordem" lado a lado.
- "Descrição rápida" (textarea) + link "Gerar com IA" (ícone de estrela).
- "Nós de conteúdo" + contador (badge). Botão tracejado "+ Adicionar novo conteúdo". Lista de conteúdos, cada linha com: alça de arrastar (⋮⋮), número, nome, badge do formato (ex. TEXTO/ATIVIDADE/LINK EXTERNO/PDF), um selo de contagem de questões quando houver, e um ícone de editar. Clicar num item da lista o seleciona, mostrando seu detalhe na coluna direita.
- Bloco tracejado "Fonte deste tópico": ícone de arquivo (ex. PDF, com selo "PDF") + nome do arquivo (ex. "cinematica-cap3.pdf") + tamanho e nº de páginas extraídas.

## Coluna direita — 3 sub-abas: Conteúdo (esta parte) / Atividades (parte 4) / Cards (parte 5)
Quando nenhum conteúdo estiver selecionado na lista da esquerda, mostrar: "Selecione um nó de conteúdo na lista à esquerda."

### Aba "Conteúdo" (ativa por padrão ao selecionar um item)
Título "Editar Conteúdo". Campos "Título do conteúdo" e "Formato" (select) lado a lado.

Conforme o formato do conteúdo selecionado, mostrar uma destas 3 seções (são estados diferentes, não uma combinação):

- **Formato com arquivo anexado (ex. PDF):** seção "Arquivos ou URL" com uma miniatura da primeira página do arquivo (mockup visual de página de documento) + nome do arquivo + tamanho + nota "Pré-visualização da primeira página" + botão "Abrir arquivo". Abaixo, zona tracejada "Adicionar mais arquivos" com a nota "PDF · DOC/DOCX · PPT/PPTX · vídeo · áudio · máx. 200 MB". Link "Ou cole uma URL direta".
- **Formato de texto:** textarea monoespaçada "Material (markdown)", com o corpo do texto.
- **Formato de link externo:** campo "URL do link externo" (contendo **só a URL**, sem texto misturado) + campo separado "Descrição do link (opcional)" + card de **pré-visualização automática** do link: ícone/inicial do domínio, nome do domínio, título da página, descrição (quando houver), e botão "Abrir página externa".

Rodapé, comum aos 3 formatos: botão tracejado "Sugerir cards e atividades" (ícone de estrela) + botão principal "Atualizar conteúdo".

## O que NÃO fazer
Não misture as 3 variações de formato de conteúdo numa única tela — são alternativas, mostradas conforme o formato do conteúdo selecionado. Não esqueça de que o campo de URL deve conter só a URL, com a descrição num campo separado.
