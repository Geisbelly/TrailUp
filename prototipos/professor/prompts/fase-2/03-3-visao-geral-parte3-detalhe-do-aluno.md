# Prompt Fase 2 — Visão geral (Dashboard), PARTE 3 de 3: detalhe do aluno

Continuação das partes 1 e 2 (estados da tela + abas Visão geral/Evolução/Conteúdo). Esta parte cobre a tela de **detalhe de um aluno**, que abre ao clicar numa linha da tabela "Alunos da turma" (Parte 1). É a parte mais rica em conteúdo de toda a tela de Dashboard — não simplifique nenhuma das 4 sub-abas.

## Identificação
- Fonte de conteúdo: `Console Dashboard.dc.html` da V5, anexado a este prompt (mesmo arquivo das partes 1 e 2) — o bloco do detalhe do aluno é o estado `isStudent`.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Sem print específico para esta parte — o conteúdo vem do código da V5.

## Cabeçalho do detalhe
- Link "← Física I · todos os alunos" para voltar à tabela.
- Card de cabeçalho: avatar grande + nome (ex. "Marina Corrêa") + e-mail/data de matrícula + chip do perfil dominante + **ilustração do Guardião do perfil** (ex. `assets/mastermind.webp` — use a ilustração do Guardião correspondente ao perfil de cada aluno). 5 blocos de estatística lado a lado: Nota média, Trilha concluída, Acertos, Abandono (com rótulo saudável/atenção + comparação com a média da turma), Tempo/sessão.
- 4 abas internas: **Visão geral / Perfil BrainHex / Trilha visual / Personalização.**

## Aba "Visão geral" (do aluno)
Gráfico de linha "Evolução do aluno" (aluno vs. média da turma, sem 1 a sem 10). Coluna lateral: card "Última atividade" (status + título + detalhes de tempo/acertos/tentativas + uso do chat + histórico "Antes:" com as 2 atividades anteriores) e card de alerta "Atenção" quando aplicável (ex. "Dois tópicos consecutivos ficaram sem atividade nos últimos 9 dias.").

## Aba "Perfil BrainHex"
Lista de barras horizontais com a afinidade do aluno nos 7 perfis (ex. Mastermind 92%, Seeker 68%, Achiever 61%, Conqueror 44%, Socializer 29%, Daredevil 22%, Survivor 15%). Card lateral "Perfil dominante": ilustração do Guardião, nome do perfil, parágrafo explicando como esse perfil aprende, 3 chips de traço (ex. Estratégia, Quebra-cabeças, Autonomia).

## Aba "Trilha visual"
Título "Jornada real de {nome}" com a nota explícita "Na ordem em que ela realmente percorreu — não na ordem cadastrada da trilha. Clique em um passo para investigar." Barra de XP (ex. "3.480 / 5.000"). Linha de "Desvios detectados" com chips (ex. "2 retornos a tópico anterior", "1 tópico feito fora de ordem", "1 abandono no meio do conteúdo") + contagem total de passos registrados.

Sequência horizontal de nós hexagonais conectados, cada um clicável, com legenda de 4 estados: Passo concluído, Errou ou abandonou, Retorno/repetição, Passo selecionado.

**Ao selecionar um passo**, abre um painel de detalhe com:
- Cabeçalho (hexágono do tópico + ordem + nome + status + timestamp).
- Grade de **8 campos**: Conteúdo acessado, Atividade, Resposta dada (+esperada), Resultado (ícone+cor+nota), Tempo gasto, Tentativa, Ordem em que foi feito, Progresso neste ponto (%+barra).
- Nota contextual (ícone+título+texto) sobre o passo.
- Botões "Ver conteúdo entregue" + "Abrir conversa do chat".
- **"Intervenções do professor neste passo"**: campo de texto + botão "Salvar comentário".
- **"Histórico deste passo"**: lista de intervenções anteriores (avatar+timestamp+texto) ou, se não houver nenhuma, o texto "Nenhuma intervenção registrada ainda neste passo."

## Aba "Personalização" (do aluno)
Card "Material personalizado" — lista de tópicos com barra de consumo e status (ex. "Consumido", "3 de 4", "1 de 3", ou "Em espera" com borda tracejada para tópicos ainda não liberados, nota "Material já gerado, será liberado com o tópico"). Coluna lateral: card "Consumo total" (% geral + barra + nota) e card "Ações" com "Regerar material pendente" (principal), "Ver conteúdo gerado" (secundário), divisor, e "Descartar personalizações…" (destrutivo) com aviso "Pede confirmação por escrito. Apaga todo o material já gerado para esta aluna."

## O que NÃO fazer
Não corte nenhuma das 4 sub-abas. Não simplifique a grade de 8 campos do passo da trilha para menos campos. Não esqueça o histórico de intervenções (mesmo vazio, o estado vazio tem texto próprio).
