# Turmas, Administração e Painel técnico: pesquisa de UX e estrutura

Pesquisa feita em 05/11/2026 para reorganizar três áreas do console: turmas e matrículas, Administração e Painel técnico. A estrutura atual foi a base: nada que existia saiu; o que mudou de lugar ou de forma está em [o que mudou de comportamento](#o-que-mudou-de-comportamento).

**Limite desta pesquisa:** é revisão de referências publicadas, não teste com professores. As telas foram conferidas com dados simulados, em desktop (1360 px) e celular (390 px). O que ela não diz é se o professor acha o fluxo mais rápido; para isso seria preciso observar uso real.

## O que os problemas tinham em comum

| Tela | Problema | Por que atrapalha |
|---|---|---|
| Turmas | Só cartões, sem busca nem filtro | Com muitas turmas, comparar exige rolar e ler cartão por cartão |
| Matrículas | Importar, adicionar e remover empilhados em 620 px; matrícula um a um | A lista útil tinha 220 px de altura, e adicionar 30 alunos sem CSV eram 30 cliques |
| Administração | Um cartão por professor, cada um com um `<select>` de todos os alunos; 40 molduras sem filtro | Achar um professor ou uma moldura era rolar; a escolha de aluno não tinha busca |
| Auditoria | JSON cru e UUID de aluno; filtro exigia digitar o nome exato da operação | O registro existia, mas não respondia "quem mudou o quê" |
| Painel técnico | Abria em "Disponibilidade"; os gatilhos ficavam na última aba | Saber se estava tudo bem exigia visitar quatro abas |

## Princípios adotados

### Listas e tabelas

- **Tabelas servem a quatro tarefas:** encontrar registros, comparar, ver ou editar uma linha, e agir sobre vários. A primeira coluna identifica o registro por um nome legível, não por um id gerado. Filtros precisam ser fáceis de achar, rápidos e mostrar o que está ativo. Para lote, caixa por linha, "selecionar todos" e as ações junto da tabela. ([NN/g, Data Tables](https://www.nngroup.com/articles/data-tables/))
- **Lote:** a barra de ações aparece no topo ao selecionar, as ações de linha ficam desligadas nesse modo, e o cabeçalho tem caixa de três estados. Carregamento com skeleton. ([Carbon, Data Table](https://carbondesignsystem.com/components/data-table/usage/))
- **Filtros:** instantâneos para uma categoria, à vista e não dentro de menu, com a contagem e um jeito de limpar. ([Carbon, Filtering](https://carbondesignsystem.com/patterns/filtering/))
- **Ver um registro:** um painel lateral mostra o detalhe sem perder a lista; uma janela modal cobre os vizinhos. ([NN/g, Data Tables](https://www.nngroup.com/articles/data-tables/))

### Adição em massa

- Validar antes de gravar e dizer o resultado por linha: "não encontrado", "já existe", "formato inválido". Modelo de arquivo disponível. ([Microsoft Entra, bulk import](https://learn.microsoft.com/en-us/entra/identity/users/groups-bulk-import-members))
- O campo que aceita e-mails direto e o autocomplete de pessoas são a referência de adição rápida. ([Google Classroom](https://support.google.com/edu/classroom/answer/6020282))
- Mostrar primeiro o caminho comum e deixar o avançado a um passo, sem passar de dois níveis. ([NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/))

### Ações destrutivas

- Confirmar só o que tem consequência séria, explicar o efeito e rotular os botões pelo resultado, como "Remover da turma" e "Manter na turma". ([NN/g, Confirmation Dialog](https://www.nngroup.com/articles/confirmation-dialog/))

### Painel operacional

- Um painel responde "o que está quebrado e por quê", sintomas antes de causas, com o SLI em destaque. Latência, tráfego, erros e saturação são os sinais de ouro. ([Google SRE, Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/), [Workbook](https://sre.google/workbook/monitoring/))
- Dado com mais de 4 a 5 minutos já muda a resposta a um incidente. Alerta precisa ser acionável, e um mesmo erro global alerta uma vez. ([Workbook, Monitoring](https://sre.google/workbook/monitoring/), [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/))
- Painel operacional dá a informação crítica rápido; barras e linhas, sem cor como única informação. ([NN/g, Dashboards](https://www.nngroup.com/articles/dashboards-preattentive/))
- Contar uma história e mostrar só o que tem problema, com hierarquia e detalhe sob demanda. ([Grafana, Best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/))

Canvas e Moodle não entram como referência: as páginas de ajuda deles não abriram durante a pesquisa.

## A estrutura

### Turmas (`ClassManagementSection.tsx`)

- Busca por turma ou matéria, filtros de um clique (Todas, Com trilha, Sem trilha, Sem alunos) e ordenação. Só aparecem com mais de uma turma.
- Duas formas de ver: **Cartões** (como era, e o padrão) e **Lista** (`TabelaDeTurmas.tsx`), para comparar. A escolha fica salva no navegador. No celular são sempre cartões.

### Matrículas (`turmas/ModalMatriculas.tsx`)

Janela de 860 px e altura fixa, com três abas. Turma vazia abre direto em adicionar.

- **Na turma** (`AbaNaTurma.tsx`): tabela com busca, filtro "Termo pendente", seleção e remoção em lote. Quem falhar ao remover continua selecionado.
- **Adicionar por busca** (`AdicionarPorBusca.tsx`): marca um ou vários e matricula num INSERT só. Quem já está na turma aparece no fim, sem caixa, para explicar por que não dá para marcar.
- **Colar ou importar lista** (`AdicionarPorLista.tsx`): aceita planilha, vírgula, campo "Para" de e-mail ou CSV. A conferência mostra quem vai entrar, quem já está, quem não tem conta e o que não é e-mail, antes de gravar. Depois, os e-mails sem conta continuam no campo.

**Modal, e não painel lateral:** a referência prefere o painel para ver um registro, mas aqui a tarefa é longa e tem colunas. Comparar com as outras turmas não faz parte dela, e o painel de 480 px voltaria a apertar a tabela. Por isso o painel lateral ficou com o professor, na Administração, onde cabe.

### Administração (`administracao/`)

A estrutura desta aba veio da #1015, que entrou na `main` durante este trabalho: professores com lista à esquerda e detalhe à direita, aba Alunos, molduras com busca e filtro por origem, e auditoria que mostra só o que mudou. A #1015 ficou como base, porque também trouxe a matrícula pelo dono (`admin_turma_matricular`). Daqui ela recebeu só dois acréscimos:

- **Confirmação antes de bloquear um professor:** explica o efeito e rotula os botões pelo resultado.
- **Moldura de ação:** a linha diz qual ação a libera, e acusa quando nenhuma libera ou quando a ação está desligada, porque aí ninguém consegue ganhá-la.

**Aprovações** continua à parte: é uma fila de decisão, com rota e ícone próprios, e o desenho dela já atende à tarefa.

### Painel técnico (`tecnico/`)

Abre em **Visão geral** (`VisaoGeralSection.tsx`), que responde "está tudo bem?":

1. **Veredito:** problema grave, atenção, sem certeza ou tudo dentro do esperado, com a hora da leitura.
2. **O que pede atenção:** a lista em ordem de gravidade. Cada item leva à aba do detalhe, e as abas mostram quantos alertas têm.
3. **Serviços** e **sinais principais:** cada número também leva ao detalhe.

Três regras, em `visaoGeral.ts`, com teste:

- **A tela não cria limiar.** Quem julga é o banco (estado do alvo, incidente aberto, gatilho, invariante). Uma chamada ao modelo com erro, sem incidente aberto, não vira pendência, porque o limite de 30% é dele. A exceção é o "pedido mais antigo" da fila, que usa o mesmo destaque de 6 horas que já existia na aba de geração.
- **Sem medição não é "ok".** Alvo ou gatilho sem dado, leitura que falhou e dado de 5 minutos ou mais levam a "sem certeza".
- **Uma causa, um item.** O alvo fora do ar não aparece de novo pelo incidente dele.

Na aba Disponibilidade, os parágrafos do cartão de cada serviço viraram números em colunas, para comparar os serviços. A informação é a mesma.

## O que mudou de comportamento

- **Matricular um aluno** agora é marcar e confirmar (dois cliques, antes um). Adicionar vários ficou bem mais curto.
- **Bloquear um professor** agora pede confirmação. Antes era um clique, sem aviso.
- **Remover aluno** continua pedindo confirmação, e o Esc cancela só ela.
- **O Painel técnico** abre na Visão geral, não em Disponibilidade.

Nenhuma migration, RPC ou policy mudou: as telas usam as mesmas leituras e escritas de antes.
