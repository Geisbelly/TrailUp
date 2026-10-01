# Prompt Fase 2 — Trilhas, PARTE 1 de 5: mapa/canvas + modais de duplicar/excluir tópico

Esta tela (Trilhas) foi dividida em 5 prompts sequenciais, por ser a mais complexa funcionalmente de todo o console. Envie os 5 nesta ordem, na mesma conversa:
1. **Esta parte** — barra superior, mapa/canvas de tópicos, modais de duplicar/excluir tópico.
2. Parte 2 — modal "Gerar trilha com IA" (fluxo de 6 etapas).
3. Parte 3 — editor de tópico: cabeçalho + coluna esquerda + aba "Conteúdo".
4. Parte 4 — editor de tópico: aba "Atividades".
5. Parte 5 — editor de tópico: aba "Cards".

## Identificação
- Nome da tela: **Trilhas** (item de sidebar), título interno "Trilha de Tópicos".
- Fonte de conteúdo: `Console Trilha.dc.html` da V5, anexado a este prompt — leia o arquivo inteiro antes de gerar, mesmo que esta parte só peça o mapa.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. As prints desta tela mostram o mapa/canvas — é exatamente o que esta parte cobre.

## Hierarquia de dados a preservar em toda a tela (não é negociável, vale para as 5 partes)
**Trilha → Tópicos → Conteúdos → (Cards e Questões, dentro de cada conteúdo).** Cards podem ser reaproveitados entre vários conteúdos do mesmo tópico; Questões pertencem a um conteúdo específico. Esta estrutura já está implementada na V5 — mantenha exatamente assim em todas as partes.

## Estados da tela (existem os 3 no código — gere pelo menos o 1 e 2 nesta parte; o 3 é o assunto das partes 3–5)
1. **Turma não selecionada:** ícone + "Escolha uma turma para abrir o canvas" + texto explicando que cada turma tem sua trilha + botões "Gerar trilha com IA" e "Selecionar turma".
2. **Editor (mapa/canvas)** — estado principal desta parte, descrito abaixo.
3. **Editor de tópico** — assunto das partes 3, 4 e 5.

## Barra superior (fora do editor de tópico)
Seletor de turma (ícone+nome "Física I"+"2026/1 · 8 tópicos · 34 alunos"+seta) à esquerda. À direita: **"Gerar trilha com IA"** (botão principal, ícone de estrela — abre o modal da Parte 2), **"Novo tópico"** (secundário), **"Salvar dependências"** (secundário-cobre).

## Mapa da trilha (canvas)
- Cabeçalho do card: título "Trilha de Tópicos" + ícone de ajuda "?" (tooltip explicando arrastar/clicar) + pílula de status ("2 gerações em andamento · 5/8 alvos · 1 erro", com spinner). Legenda à direita: "— Sequência" (linha cheia) / "- - Pré-requisito" (linha tracejada).
- Canvas pannable e com zoom (arrastar o fundo navega, arrastar um cartão reposiciona o tópico), com conectores curvos com seta entre os cartões.
- **Cartão de tópico:** número de sequência, ícone hexagonal com o número do tópico, título, pílulas "DEP {tópico}" / "NEXT {tópico}", e no rodapé ícones de **duplicar** e **excluir**, sempre visíveis (não escondidos atrás de hover). Clicar no corpo do cartão abre o editor de tópico (partes 3–5).
- Botão tracejado "+ Adicionar tópico ao final" no canto do canvas.
- Controles de zoom no canto inferior direito: −, percentual, +, divisor, "ajustar à tela", "centralizar".
- Conteúdo de exemplo dos 8 tópicos de "Física I": Introdução à Física, Medidas e Unidades, Cinemática, Vetores, Dinâmica, Trabalho e Energia, Rotação, Fluidos — use esses nomes/sequência como exemplo de conteúdo no canvas.

## Modais de confirmação
- **Duplicar tópico:** "Cria uma cópia de '{tópico}' com os mesmos conteúdos, cards e questões associados. A cópia entra sem nenhum progresso de aluno vinculado." Cancelar + "Duplicar tópico".
- **Excluir tópico:** "Excluir '{tópico}' remove permanentemente seus conteúdos, cards e questões associados. Esta ação não pode ser desfeita." Cancelar + "Excluir tópico" (destrutivo).

## Assistente "Escriba" (componente global — gere aqui, não precisa repetir nas partes 2–5 desta tela)
Botão flutuante no canto inferior direito, tooltip "Pergunte ao Escriba". Painel de chat: cabeçalho ("Escriba" + "O guia do professor · lê os dados desta trilha"), mensagem de apresentação, 2 chips de pergunta sugerida ("Que tópico trava mais?" / "O que falta revisar?"), campo de texto + botão de enviar.

## O que NÃO fazer
Não remova os ícones de duplicar/excluir dos cartões nem as confirmações desses 2 modais.
