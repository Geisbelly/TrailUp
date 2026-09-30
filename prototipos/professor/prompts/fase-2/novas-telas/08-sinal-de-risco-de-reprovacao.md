# Prompt — adição à Visão geral: sinal de risco de reprovação

## Identificação
- Não é uma tela nova — é uma **adição ao Dashboard (Visão geral) já existente**, especificamente à aba "Visão geral" da turma (mesma aba do bloco "Precisam de atenção" já especificado em `../03-1-visao-geral-parte1-estados-e-visao-geral.md`).
- Fonte de conteúdo: issue **#135** (Sinal de risco de reprovação, visível só para o professor), anexada a este prompt.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## Diferença em relação ao bloco "Precisam de atenção" que já existe
O Dashboard já tem um bloco "Precisam de atenção" (alunos fora da curva de abandono/nota/progresso). Este sinal é **mais específico e mais sensível**: um indicador composto de risco de reprovação, calculado a partir de queda de eventos por semana, acertos, presença e prazos perdidos — e a fonte é explícita que ele **nunca pode aparecer para o aluno, só para o professor** (é dado sensível, tratado como alerta precoce, não como exposição pública). Trate como um nível de detalhe **a mais** dentro do fluxo já existente, não como um card solto duplicando "Precisam de atenção".

## Onde encaixar
Ao abrir o detalhe de um aluno sinalizado (o painel de detalhe do aluno já especificado em `../03-3-visao-geral-parte3-detalhe-do-aluno.md`), adicionar um bloco **"Sinal de atenção"** (evite o termo "risco de reprovação" como rótulo de UI — é informação sensível; prefira uma linguagem de suporte, não de veredito) contendo:
- Os **fatores que dispararam o sinal**, listados individualmente — nunca só um número/score sem explicação (ex. "Queda de atividade nas últimas 2 semanas", "Acertos abaixo de 50%", "3 prazos perdidos seguidos", "Presença abaixo do esperado"). Cada fator é uma linha própria, não um parágrafo corrido.
- Um tom de **apoio, não punitivo** — a fonte é explícita sobre isso: a resposta ao sinal deve ser de apoio, então qualquer texto de acompanhamento sugerido (ex. um link para a aba "Intervenções do professor" já existente na Trilha Visual) deve soar como "aqui está o que pode ajudar", não como alarme.

## Onde NÃO encaixar
- **Nunca no card resumido do aluno** na tabela principal, nem em nenhum lugar visível de relance/em lista — é informação que exige abrir o detalhe do aluno para ver, precisamente porque é sensível.
- **Nunca em nenhuma tela ou visão acessível ao aluno** ou aos colegas dele — isso vale para qualquer app deste sistema, não só o console.

## Estados
- Sem fatores de risco identificados: simplesmente não mostrar o bloco "Sinal de atenção" para aquele aluno — ausência é a normalidade, não um estado vazio a ser desenhado.

## O que NÃO fazer
Não use linguagem de veredito ("está reprovando", "vai reprovar") — a fonte pede explicitamente uma resposta de apoio, não punitiva. Não mostre esse sinal em nenhuma lista/tabela resumida — só dentro do detalhe individual do aluno. Não junte isso com o bloco "Precisam de atenção" já existente como se fossem a mesma coisa — são dois sinais complementares, com fontes de dado e propósito diferentes.
