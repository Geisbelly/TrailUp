# Prompt Fase 2 — Visão geral (Dashboard), PARTE 1 de 3: estados da tela + aba "Visão geral"

Esta tela (Visão geral / Dashboard) foi dividida em 3 prompts sequenciais, porque é a mais densa do console. Envie os 3 nesta ordem, na mesma conversa:
1. **Esta parte** — estrutura geral, os 4 estados da tela, e a aba "Visão geral" (turma inteira).
2. Parte 2 — abas "Evolução" e "Conteúdo".
3. Parte 3 — o detalhe do aluno (abre ao clicar numa linha da tabela desta parte).

## Identificação
- Nome da tela: **Visão geral** (item de sidebar), título interno "Dashboard de Alunos".
- Fonte de conteúdo: `Console Dashboard.dc.html` da V5, anexado a este prompt — leia o arquivo inteiro antes de gerar, mesmo que esta parte só peça o começo da tela.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md` para cor, tipografia, cards, botões, sidebar e header. As prints desta tela mostram só o estado "com dados", aba "Visão geral" — os demais estados abaixo não têm print, mas existem no código da V5 e precisam ser gerados do mesmo jeito.

## Seletor de turma e janela temporal (topo, comum a todos os estados e às 3 partes)
- Rótulo "Turma selecionada" acima de um seletor clicável: ícone + nome da turma (ex. "Todas as turmas") + contagem ("3 turmas · 74 alunos") + seta.
- À direita: segmentado "30 dias / Semestre / Tudo" + texto "Atualizado há N min".

## Os 4 estados da tela (existem no código via a prop `estado`) — gere todos os 4 nesta parte
1. **Carregando:** cards em skeleton (efeito shimmer) no lugar dos KPIs e gráficos, com o texto "Consultando o desempenho da turma…".
2. **Vazio:** ícone + título "Nenhum aluno nesta turma ainda" + texto explicando que os indicadores aparecem quando alunos aceitarem a matrícula + botões "Convidar alunos" (principal) e "Montar a trilha" (secundário).
3. **Erro:** cartão com aviso "!" + título "Não foi possível carregar os indicadores" + explicação de que os dados estão salvos, nada foi perdido + botões "Tentar novamente" e "Ver status do serviço".
4. **Com dados:** o conteúdo principal, com 3 abas internas — **Visão geral / Evolução / Conteúdo**. Esta parte cobre só a primeira aba; as outras vêm na parte 2.

## Aba "Visão geral" (dentro do estado "com dados")

**Primeira fileira — 3 KPIs grandes**, cada um com ícone decorativo e brilho de fundo:
- **Total de alunos** — "34", legenda "com acesso liberado", selo verde "+3" + "matrículas aceitas nesta semana".
- **Média de notas** — "7.4", legenda "de 10", selo verde "+0,3" + "subindo · era 7,1 no período anterior".
- **Conclusão média** — "62%", legenda "da trilha", barra de progresso com marcador na meta (60%), selo verde "No previsto" + "marca: 60% esperado nesta semana".

**Bloco "Precisam de atenção"** (destaque em dourado): ícone com número "5", título "Precisam de atenção", subtítulo "5 de 34 alunos fora da curva da turma. A média esconde estes casos.", chip explicando o critério ("Critério: abandono acima de 30%, nota abaixo de 5,0, progresso 20 pontos abaixo do previsto ou 7 dias sem atividade"). Abaixo, uma lista de linhas clicáveis (cada uma abre a jornada do aluno, ver Parte 3): avatar + nome + perfil, chip de severidade, motivo + comparação com a turma, link "Abrir jornada".

**Segunda fileira — 4 métricas secundárias**, cada uma com ícone, valor, barra fina e selo de avaliação:
- Taxa de acertos — 71%, "Bom · meta 70%".
- Abandono médio — 18.5%, "Atenção · acima da meta de 15%".
- Chat após erro — 43%, "Informativo · quem pede ajuda erra menos depois".
- Tempo médio de uso — 24.8 min/sessão, "mediana 21 min · estável vs. período anterior" (sem barra).

**Dois gráficos lado a lado:**
- **"Abandono por perfil"** — barras para os 7 perfis BrainHex (Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever), cada barra na cor-assinatura do perfil, com um ícone hexagonal da cor do perfil abaixo de cada barra e o nome do perfil embaixo. Linha tracejada de média ("média 18,5%"). Seletor "Majoritário" no canto.
- **"Distribuição de notas"** — gráfico de rosca com 4 faixas (9–10 alta = 11, 7–8 média-alta = 12, 5–6 média = 7, 0–4 baixa = 4), centro mostrando a média geral ("7.4"), legenda lateral com cor+faixa+contagem, e um insight abaixo: "4 alunos na faixa baixa concentram 62% do abandono da turma."

**Tabela "Alunos da turma":** cabeçalho com busca por nome/e-mail + filtro "Todos os perfis". Colunas: Aluno (avatar+nome+email), Perfil dominante (chip colorido), Nota, Progresso na trilha (barra+%), Acertos (%), Abandono (%+rótulo), seta. Rodapé "Mostrando 8 de 34 alunos" + Anterior/Próxima. **Clicar numa linha abre o detalhe do aluno — isso é o assunto da Parte 3 deste prompt, não gere esse detalhe ainda aqui.**

## Assistente "Escriba" (componente global — ver prompt mestre)
Botão flutuante no canto inferior direito (ícone de livro/pena, gradiente dourado/bronze), tooltip "Pergunte ao Escriba". Ao abrir: painel de chat com cabeçalho (avatar+"Escriba"+"O guia do professor · lê os dados desta turma"), mensagem inicial de apresentação, 2 chips de pergunta sugerida ("Quem precisa de atenção?" / "Onde a turma mais erra?"), indicador de "digitando"/"consultando", campo de texto "Pergunte ao Escriba…" + botão de enviar. Gere este componente nesta parte — ele é o mesmo em todas as 3 partes desta tela, não precisa repeti-lo nas partes 2 e 3.

## O que NÃO fazer
Não reduza os 4 estados a 1. Não misture a tabela de alunos com o detalhe do aluno — são telas/momentos diferentes. Não esqueça o Escriba.
