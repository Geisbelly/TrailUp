# Prompt Fase 2 — Personalizações, PARTE 3 de 3: modal "Ver conteúdo gerado"

Última parte da tela Personalizações. Continuação das partes 1 e 2. Esta parte cobre o modal que abre ao clicar num card/linha de perfil (Parte 1) ou em "Ver material gerado" (Parte 2, aba Por aluno).

## Identificação
- Fonte de conteúdo: `Console Personalizacoes.dc.html` da V5, anexado a este prompt (mesmo arquivo das partes anteriores).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Sem print específico — o conteúdo vem do código da V5.

## Modal "Ver conteúdo gerado"
Cabeçalho: ícone com iniciais do perfil + rótulo "Conteúdo gerado" + título "{Perfil} · {Conteúdo}" + X.

- **Sem material:** "Nenhum material gerado ainda para este perfil." + texto + botão "Gerar".
- **Com material**, 3 sub-abas: **Texto / Áudio / Apresentação.**
  - **Texto:** nota de contagem de palavras, bloco com o texto de fato (não só o título) — use como exemplo o texto do perfil Mastermind: *"Um carro percorre 240 km em 3h. Antes de qualquer definição, resolva: qual é a velocidade média em m/s? A resposta guia a regra — não o contrário..."* — cada perfil tem seu próprio tom (Seeker é exploratório/investigativo, Mastermind resolve-primeiro-nomeia-depois, Daredevil é ritmo acelerado com cenário de risco). Botão "Regenerar este texto".
  - **Áudio:** nota de duração, player (botão play + barra de progresso + "Roteiro: {nota de tom}"). Botão "Regenerar este áudio".
  - **Apresentação:** nota "{N} slides gerados... regenere um slide isolado sem afetar os demais" + botão "Regenerar apresentação inteira". Lista de slides (número+título+nota "gerado em"/"reescrito em", botão "Regenerar slide" por item) — **expansível**, mostrando o slide completo (título+corpo) num box de proporção 16:9. Use como exemplo os títulos de slide do Mastermind: "Problema de abertura", "Onde a resposta certa esbarra", "A fórmula, deduzida", "Segundo problema, mais difícil", "Gráfico: ler antes de calcular", "Aceleração como taxa de variação", "Desafio de fechamento", "O que praticar a seguir".

## Fluxo de regeneração (compartilhado pelos 3 formatos), em 4 passos
1. **Instrução:** "O que você quer mudar?" (textarea opcional, nota "Pode deixar em branco — nesse caso, regenera com o mesmo direcionamento de antes."). Cancelar/Continuar.
2. **Confirmação:** título, "Motivo" (chip colorido + texto — ex. "Pedido manual do professor", "Material parcial — 1 conteúdo nunca foi gerado", "Falha anterior — timeout no serviço de síntese de voz", "Conteúdo desatualizado — o professor trocou o PDF-fonte em 04/09"), "O que muda nesta geração" (lista com marcadores), nota do que **não** muda (ex. "As respostas e o progresso dos alunos neste conteúdo não são afetados."). Cancelar/"Confirmar regeneração".
3. **Processando:** spinner + rótulo dinâmico.
4. **Concluído:** ícone de check + rótulo de conclusão.

## Verificação final (vale para as 3 partes de Personalizações)
Confirme que as 3 partes desta tela — Por perfil, Estrutura/Por aluno/Turma, e este modal — usam o mesmo padrão visual de card, tabela, pílula de status e botão, para parecerem uma única tela coerente.

## O que NÃO fazer
Não simplifique o modal para mostrar só os títulos dos slides — o conteúdo de fato (texto, áudio, slide) precisa estar visível, é o ponto central desta tela. Não pule o passo de confirmação (motivo + o que muda) antes de regenerar.
