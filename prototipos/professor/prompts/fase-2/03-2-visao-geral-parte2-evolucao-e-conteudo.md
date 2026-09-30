# Prompt Fase 2 — Visão geral (Dashboard), PARTE 2 de 3: abas "Evolução" e "Conteúdo"

Continuação do prompt anterior (Parte 1 — estados da tela + aba "Visão geral"). Esta parte cobre as outras 2 abas internas do estado "com dados" da mesma tela: **Evolução** e **Conteúdo**. Use a mesma base (cabeçalho, seletor de turma, sidebar, abas) já estabelecida na Parte 1 — não recrie do zero, só adicione o conteúdo destas 2 abas.

## Identificação
- Fonte de conteúdo: `Console Dashboard.dc.html` da V5, anexado a este prompt (mesmo arquivo da parte 1).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Sem print específico para estas 2 abas — o conteúdo vem do código da V5.

## Aba "Evolução"
- 4 KPIs: Conclusão da trilha (62%, +11 pts, "nos últimos 30 dias · era 51%"), Nota média (7,4, +0,3, "tendência de alta há 4 semanas"), Atividades entregues (216, −18%, "queda na semana da prova de Cálculo"), Abandono (18,5%, −2,4 pts, "caindo, mas ainda acima da meta de 15%").
- **"Evolução da turma"** — gráfico combinado (linha + barras) semana a semana (sem 1 a sem 10 de Física I): linha de conclusão da trilha, linha tracejada de nota média, barras de atividades entregues, com uma anotação destacada "semana da prova" no ponto de queda.
- **"Mudanças relevantes"** — linha do tempo de eventos, cada um com data, tag colorida (Melhora/Queda/Estrutura/Risco) e descrição. Conteúdo de exemplo: 04/09 Melhora "Acertos em Dinâmica subiram de 58% para 74%"; 27/08 Queda "Entregas caíram 18% na semana"; 19/08 Estrutura "Tópico 'Trabalho e Energia' liberado"; 12/08 Risco "2 alunos passaram de 30% de abandono".

## Aba "Conteúdo"
- 3 cartões de destaque: **Mais consumido** (Áudio · Cinemática, 31 de 34 abriram, nota sobre áudio ser o formato preferido), **Maior dificuldade** (borda vermelha; Leitura · Vetores (parte 2), 54% de erro, "Pior que a média da turma (29%) — revisar"), **Maior conclusão** (borda verde; Quiz · Leis de Newton, 94%, "Formato curto funciona nesta turma").
- **Tabela "Conteúdo por tópico":** colunas Conteúdo, Formato, Consumo (barra), Dificuldade/erro (%+rótulo), Conclusão (%+rótulo).

## O que NÃO fazer
Não recrie o cabeçalho/seletor de turma/abas do zero com um estilo diferente do que já ficou definido na Parte 1 — devem parecer a mesma tela, só trocando de aba.
