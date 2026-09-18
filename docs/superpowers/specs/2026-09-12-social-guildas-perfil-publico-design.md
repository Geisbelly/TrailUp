# Design: Social, perfil público e guildas

## Objetivo

Fazer a aba Social funcionar no mobile com perfil público, conquistas visíveis e guildas por turma, mantendo a estética atual do sistema e as regras de privacidade no banco.

## Escopo aprovado

### Perfil público

Ao tocar em uma pessoa no Social, o app abrirá um modal com:

- banner/arte de perfil;
- avatar sobreposto;
- nome, apelido e perfil ativo;
- guilda atual na turma selecionada;
- dados públicos definidos pelo perfil, como série, instituição, classe/veterania, preferências de estudo e texto “Sobre”;
- conquistas concluídas e badges;
- ações de conversar e curtir, quando disponíveis no domínio atual.

O modal não exibirá e-mail, telemetria, métricas privadas, progresso detalhado ou dados de outras turmas. O banco validará que o solicitante e o perfil consultado pertencem à mesma turma e respeitará a visibilidade configurada pelo perfil.

### Guildas

Guildas são grupos persistentes dentro de uma turma. O sistema terá:

- criação de guilda por aluno;
- nome, descrição opcional, emblema e limite de membros;
- uma guilda ativa por aluno em cada turma;
- convite, aceite, recusa e cancelamento;
- entrada em guilda aberta, quando permitida;
- saída voluntária;
- consulta de guildas e membros da própria turma;
- bloqueio social impedindo convite entre pessoas bloqueadas;
- validação atômica do limite de membros;
- configuração de janela de formação e limite pelo professor;
- dissolução pelo professor e conclusão/encerramento de guilda conforme a regra da turma;
- nenhuma associação automática de alunos.

O histórico de participação será preservado para que uma guilda dissolvida ou um aluno removido da turma não apague resultados já registrados.

### Eventos e composição

O banco atual possui registros de pontuação e eventos de aluno, mas ainda não possui um ciclo completo de evento aberto/fechado. A migração criará o contrato de snapshot de composição para ser usado transacionalmente pelo futuro motor de eventos:

- a abertura de um evento deverá congelar os membros naquele instante;
- alterações posteriores não modificarão o snapshot;
- aluno que entrar na turma depois da abertura ficará fora do snapshot;
- aluno removido da turma permanecerá no snapshot;
- o resultado fechado deverá ser persistido independentemente de exclusão posterior da conta.

A migração não criará um segundo motor de batalhas nem inventará uma tabela concorrente de eventos.

## Arquitetura de dados

Serão adicionadas tabelas para guildas, membros, convites, configuração por turma e snapshots de composição. As chaves e relacionamentos seguirão as entidades existentes de turma, aluno e professor. Constraints e transações garantirão unicidade por turma, limite de membros e estados válidos dos convites.

As operações serão expostas por RPCs PostgreSQL transacionais. Operações de leitura pública usarão funções `SECURITY DEFINER` com validação explícita de turma e visibilidade. RLS continuará restringindo acesso direto às linhas pela turma e pelo papel do usuário.

## API mobile

O serviço Social será estendido para:

- carregar o perfil público de um aluno;
- carregar guildas, membros e convites;
- criar, editar e dissolver guilda;
- convidar, aceitar, recusar e cancelar convite;
- entrar e sair de guilda;
- alterar configurações permitidas pelo professor.

As respostas serão normalizadas em modelos próprios, sem expor dados privados ao componente visual.

## Interface mobile

Dentro do Social haverá uma área/aba “Guildas”, mantendo as abas existentes de amigos, convites e encontrar. O perfil público será um modal responsivo no mesmo tema visual do Social:

- fundo escuro e bordas arredondadas;
- banner no topo;
- avatar circular sobreposto;
- badges de conquistas abaixo do cabeçalho;
- card de dados com hierarquia semelhante ao exemplo aprovado;
- guilda visível como informação pública;
- estados de carregamento, vazio, erro e ação em andamento;
- fechamento por botão e gesto/back do sistema.

Ícones de guilda e conquistas serão SVGs locais, únicos e coerentes com a identidade do app.

## Segurança e regras de erro

- Toda operação de escrita verificará identidade, matrícula na turma e papel.
- Convites respeitarão bloqueios existentes do Social.
- Aceitar convite verificará novamente limite, janela de formação e associação prévia.
- Corridas de entrada/aceite serão resolvidas com lock transacional no banco.
- O app exibirá mensagens específicas para guilda cheia, janela encerrada, convite expirado, bloqueio e ausência de permissão.
- Falhas de carregamento do Social não impedirão a navegação da aba nem deixarão dados privados em cache visual.

## Testes

Serão cobertos:

- RPCs de criação e associação;
- unicidade de guilda por aluno/turma;
- limite de membros sob concorrência;
- bloqueio impedindo convite;
- convite e aceite/recusa/cancelamento;
- saída e dissolução preservando histórico;
- permissões de professor e aluno;
- isolamento entre turmas;
- perfil público exibindo somente dados permitidos;
- conquistas concluídas e badges no modal;
- estados de erro e carregamento no mobile.

## Critério de conclusão

A migração estará aplicada até `head`, os RPCs estarão acessíveis pelo cliente mobile, a aba Social exibirá guildas e abrirá o perfil público ao tocar em uma pessoa, e os testes de banco e mobile passarão sem alterar o fluxo de loja existente.
