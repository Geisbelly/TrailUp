/**
 * Cria o formulário da pesquisa com professores do TrailUp: o professor usa o
 * sistema numa turma de demonstração, seguindo um roteiro de tarefas, e avalia
 * por escrito usabilidade, carga de trabalho, métricas,
 * material personalizado, tela do aluno, utilidade e esforço. Os instrumentos
 * e a origem de cada item estão no README.md.
 *
 * São três formulários, cada um criado por uma função:
 *   1. criarFormularioDeInscricao: TCLE e identificação. O e-mail cadastrado
 *      vira o login do participante (acesso ao console é restrito). Link de
 *      resposta → VITE_PESQUISA_INSCRICAO_FORM_URL (botão da cartilha).
 *   2. criarFormulario: a avaliação. O link vai só por e-mail, junto com os
 *      acessos e a senha aleatória, para quem se inscreveu.
 *   3. criarFormularioDeAtualizacao: trocar a forma de divulgação.
 *
 * Tarefas, perguntas e escalas espelham
 * frontend/src/features/pesquisa/pesquisaProfessores.ts; o teste
 * pesquisaProfessores.test.ts falha se os dois se separarem.
 *
 * Nada é obrigatório. O participante se identifica (a pesquisa se
 * apoia na qualificação de quem avalia e o e-mail é o login), mas o e-mail não
 * é coletado pelo Google: é um campo do formulário, como o nome.
 */

// Por que o e-mail vira login e a senha é aleatória. Fica antes do CONFIG
// porque o TCLE o repete.
const ACESSO_TCLE = 'O e-mail que você cadastrar é o seu login no TrailUp. O acesso ao console do professor é restrito, por segurança: ele mostra dados de turmas e de alunos, e só entra quem a equipe aprova. Por isso a equipe cria o seu acesso com esse e-mail e uma senha gerada aleatoriamente, e envia só para ele os acessos (professor e aluno de teste) e o link do formulário de avaliação. Você pode trocar a senha em Meus dados. A equipe nunca pede senha sua de outro serviço, e os acessos são apagados ao fim da pesquisa.';

const CONFIG = {
  // true: cria mesmo com [PREENCHER] e põe "RASCUNHO" no título, para conferir
  // a forma. false: recusa enquanto faltar campo. O de verdade vai aos
  // professores com o aceite do orientador.
  rascunho: true,

  titulo: 'Avaliação do TrailUp por professores',
  cartilhaUrl: 'https://trailup.vercel.app/pesquisa/professores',
  sistemaUrl: 'https://trailup.vercel.app',
  // Link de resposta do formulário criado por criarFormularioDeAtualizacao.
  linkAtualizacao: '[PREENCHER: link do formulário de atualização]',

  // Termo de consentimento, por seção (o texto de ajuda de cada bloco do Forms
  // tem limite). Esta fase é a validação com especialistas, sem alunos, e não
  // passa pelo CEP; a fase com alunos passa. A cópia do participante é o
  // próprio link da inscrição, que mostra o termo na primeira página.
  tcle: [
    ['1. Sobre a avaliação',
      'O TrailUp é uma plataforma de aprendizagem criada num Trabalho de Conclusão de Curso de Ciência da Computação da Ulbra Palmas. Esta etapa é a validação com especialistas em ensino (docentes da área de TI, docentes de outras áreas e pedagogos): antes de levar o sistema a uma turma, a pesquisa quer saber se ele é fácil de usar, se as métricas ajudam o professor e quanto trabalho ele exige. Nenhum aluno participa desta etapa; a fase com alunos vem depois, com aprovação do Comitê de Ética em Pesquisa. Resultados negativos valem tanto quanto os positivos: o que não funcionar é o que mais orienta a correção do sistema.'],
    ['2. O que você vai fazer',
      'Primeiro, a inscrição: este termo e a sua identificação. Depois, com o acesso que a equipe envia ao seu e-mail, usar o TrailUp numa turma de demonstração, sem alunos reais, seguindo um roteiro de tarefas curtas no console do professor e na tela do aluno, e responder ao formulário de avaliação. Leva cerca de uma hora (uns 35 minutos usando o sistema e uns 25 respondendo) e pode ser feito em mais de uma vez.\n\nNão há entrevista nem gravação. Nenhuma pergunta é obrigatória, e você pode parar a qualquer momento fechando a página antes de enviar. Você pode usar conteúdo seu no console. O que for usado numa geração por IA é enviado ao modelo de linguagem, por isso não inclua dados pessoais nem material de terceiros que você não possa compartilhar.'],
    ['3. Seus dados e como você aparece',
      'O formulário pede a sua identificação (nome, e-mail, instituição, titulação e formação), porque a validação se apoia na qualificação de quem avalia.\n\n' + ACESSO_TCLE + '\n\nNo fim da avaliação você escolhe como ela aparece na monografia: (a) com o seu nome e titulação, só depois de ver o seu quadro e confirmar; (b) com um código (E1, E2…) e o seu perfil, sem o nome; ou (c) só nos resultados agregados. Pode trocar a escolha até a versão final da monografia, pelo formulário de atualização ou pelo contato abaixo. Com o nome, a sua opinião fica pública; nas outras escolhas, como os participantes são poucos, alguém ainda pode reconhecer você por um comentário, por isso os trechos citados são curtos e revisados. Fora do que você autorizar, a identificação fica só com a equipe.\n\nDo seu uso do sistema, a pesquisa só confere se a tarefa de gerar material foi feita. As respostas são baixadas para um computador da equipe, apagadas do formulário online e guardadas até a entrega da versão final do TCC; depois, são destruídas. A turma, o conteúdo que você puser nela e os acessos de teste são apagados ao fim.'],
    ['4. Participação voluntária',
      'Participar é voluntário, não tem custo e não é pago. Você pode recusar, desistir ou pedir a retirada das suas respostas a qualquer momento, pelo contato abaixo, sem nenhum prejuízo. Você recebe um resumo dos resultados.'],
    ['5. Contato',
      'Orientador: Prof. Esp. Fábio Castro Araújo – fabio.araujo@ulbra.br. Pesquisadora: Geisbelly Victória Feitosa Moraes Domiciano – geisbelly@rede.ulbra.br.'],
  ],

  // Termo dos juízes do piloto de validade de conteúdo (fora da amostra).
  termoPiloto: 'Você vai julgar as perguntas do formulário da validação com especialistas do TrailUp, um Trabalho de Conclusão de Curso de Ciência da Computação da Ulbra Palmas. Não usa o sistema e não participa da coleta principal. O tempo depende de quantas sugestões você escrever, nenhuma pergunta é obrigatória e você pode parar a qualquer momento. O seu nome fica só com a equipe; na monografia, os juízes aparecem só no conjunto (número de juízes e formação). As respostas são guardadas até a entrega da versão final do TCC e depois destruídas. Participar é voluntário e não é pago. Contato: os mesmos do termo da avaliação.',
};

// Último campo da inscrição: o código com que a página do site confirma que a resposta chegou
// (doGet, em Planilha.gs). Não começa por "E-mail" nem por "Nome completo", que é como a
// planilha acha as colunas.
const CAMPO_CODIGO_DO_SITE = 'Código do site (preenchido automaticamente)';
const AJUDA_CODIGO_DO_SITE = 'Se você está respondendo por aqui, deixe em branco.';

// [pergunta, opções ou null (texto livre)]
const IDENTIFICACAO = [
  ['Nome completo', null],
  ['E-mail (será o seu login no TrailUp e o contato da pesquisa)', null],
  ['Instituição em que atua', null],
  ['Papel em que você avalia o sistema', [
    'Docente da área de Tecnologia da Informação',
    'Docente de outra área',
    'Pedagogo(a) ou coordenação pedagógica',
    'Outro',
  ]],
  ['Maior titulação', ['Graduação', 'Especialização', 'Mestrado', 'Doutorado', 'Pós-doutorado']],
  ['Área da sua formação (graduação e pós)', null],
  ['Você tem formação pedagógica?', ['Pedagogia', 'Licenciatura', 'Pós-graduação em educação ou docência', 'Não tenho']],
  ['Disciplinas que leciona ou acompanha', null],
  ['Tempo de atuação no ensino superior', ['até 2 anos', 'de 3 a 5 anos', 'de 6 a 10 anos', 'de 11 a 20 anos', 'mais de 20 anos']],
  ['Já usou em aula um ambiente virtual com painel de dados dos alunos?', ['Sim', 'Não']],
  ['Já usou elementos de jogo (pontos, ranking, missões) em aula?', ['Sim', 'Não']],
  ['Com que frequência usa IA generativa para preparar aulas?', ['Nunca', 'Às vezes', 'Com frequência']],
  ['Em que aparelho você vai usar o sistema?', ['Computador', 'Celular', 'Tablet']],
];

// Res. CNS 510/2016, arts. 9º, V, e 17, IV: o participante decide se a
// identidade é divulgada. Separado do aceite; recusar o nome não exclui.
// Vem no fim, depois da avaliação, e pode ser trocado até a versão final
// (formulário de atualização): menos viés de cortesia ao responder.
const DIVULGACAO = [
  'Como a sua avaliação pode aparecer na monografia?',
  'A monografia traz a avaliação de cada especialista. A equipe sabe quem respondeu; esta escolha decide só o que é publicado. Você pode trocá-la a qualquer momento até a versão final da monografia, pelo formulário de atualização ou pelo contato do termo, e vale sempre a escolha mais recente. Com o nome, você vê o seu quadro antes e só aparece depois de confirmar.',
  [
    'Com meu nome: nome e titulação ao lado das minhas notas e comentários, só depois de eu ver o meu quadro e confirmar.',
    'Com código e perfil: apareço como E1, E2…, com titulação, formação e papel, sem o nome.',
    'Só no conjunto: minhas respostas entram apenas nos resultados agregados.',
  ],
];

// [id, titulo, passos[]]
const TAREFAS = [
  ['T1', 'Conhecer a turma', ['Em Turmas, abra a turma de demonstração.', 'Veja quem está matriculado e o perfil de cada aluno.']],
  ['T2', 'Explorar a trilha', ['Em Trilhas, abra a trilha da turma.', 'Entre num tópico e veja os conteúdos, as atividades e as questões.']],
  ['T3', 'Ver e pedir uma personalização', ['Em Personalizações, veja os perfis da turma e o material de um perfil.', 'Se quiser, peça uma geração por IA, sobre o conteúdo da turma ou sobre um conteúdo seu (ela pode levar alguns minutos ou não sair, por causa do limite gratuito do modelo).']],
  ['T4', 'Ler as métricas da turma', ['Na Visão geral, com a turma de demonstração selecionada, veja os painéis com o selo de exemplo.', 'Em cada métrica, abra a explicação (o ícone ao lado do nome) e diga para você mesmo o que ela mostra.']],
  ['T5', 'Entender o jogo da turma', ['Passe por Economia, Missões, Eventos e Conquistas.', 'Veja como as moedas, a loja, as missões e os eventos estão configurados.']],
  ['T6', 'Ver a competição', ['Abra Rankings, Rank de batalhas e Guildas.']],
  ['T7', 'Estudar como aluno', ['Entre com o seu acesso de aluno de teste.', 'Abra a trilha, um tópico e o material personalizado (texto, áudio ou apresentação).']],
  ['T8', 'Ver o jogo pelo lado do aluno', ['Ainda como aluno, abra as missões, a loja e o ranking.']],
];

// Depois de cada tarefa: conclusão (autodeclarada), SEQ, tempo em faixas e onde travou.
const PERGUNTA_CONCLUSAO = 'Você conseguiu fazer a tarefa?';
const OPCOES_CONCLUSAO = ['Sim', 'Em parte', 'Não', 'Não tentei'];
const PERGUNTA_SEQ = 'No geral, esta tarefa foi:';
const EXTREMOS_SEQ = ['Muito difícil', 'Muito fácil'];
const PERGUNTA_TEMPO = 'Quanto tempo levou, mais ou menos?';
const OPCOES_TEMPO = ['Menos de 2 min', 'De 2 a 5 min', 'De 5 a 10 min', 'Mais de 10 min'];
const PERGUNTA_DA_TAREFA = 'Onde travou, o que confundiu ou o que faltou? (opcional)';

const ACESSO = ACESSO_TCLE;

// O que esta rodada não avalia (dito na abertura da avaliação). Igual a FORA_DESTA_RODADA da cartilha.
const FORA_DESTA_RODADA = 'Esta rodada avalia o TrailUp no formato base: as telas, as métricas e o material. Não avalia as sugestões da IA sobre alunos, a busca por aluno que precisa de atenção nem a correção de entregas, porque isso depende de alunos com histórico, e a turma de demonstração não tem. As métricas aparecem com valores de exemplo, marcados como tais: julgue se entende cada uma e se a visualização é clara, não o número.';

const FRANQUEZA = 'A pesquisa se alimenta tanto de resultados negativos quanto de positivos. Uma tarefa difícil, uma métrica confusa ou um material gerado com erro é exatamente o que precisa aparecer: é isso que mostra o que corrigir antes de o sistema chegar a alunos. Nota dada por gentileza atrapalha a pesquisa; crítica franca ajuda.';

// SUS, versão brasileira (Lourenço; Carmona; Lopes, 2022), Tabela 1.
const EXTREMOS_SUS = ['Discordo fortemente', 'Concordo fortemente'];
const ITENS_SUS = [
  'Eu acho que gostaria de usar esse sistema frequentemente.',
  'Eu achei esse sistema desnecessariamente complexo.',
  'Eu achei esse sistema fácil de usar.',
  'Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema.',
  'Eu achei que as várias funções desse sistema foram bem integradas.',
  'Eu acho que o sistema apresenta muita inconsistência.',
  'Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente.',
  'Eu achei esse sistema muito pesado para usar.',
  'Eu me senti muito seguro usando o sistema.',
  'Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema.',
];

// Raw TLX: dimensões e âncoras de Ciofi-Silva et al. (2023); perguntas
// adaptadas (o texto final não foi publicado). [nome, pergunta, 0, 10]
const AJUDA_TLX = 'Pensando nas tarefas do console como um todo, de 0 (pouquíssimo) a 10 (muitíssimo). Não há resposta certa: é a sua impressão.';
const ITENS_TLX = [
  ['Demanda mental', 'Quanto raciocínio, decisão ou cálculo as tarefas exigiram?', 'Pouquíssimo', 'Muitíssimo'],
  ['Demanda física', 'Quanta atividade física as tarefas exigiram?', 'Pouquíssimo', 'Muitíssimo'],
  ['Demanda temporal', 'Quanta pressão de tempo você sentiu para fazer as tarefas?', 'Pouquíssimo', 'Muitíssimo'],
  ['Desempenho', 'Quanto você conseguiu fazer, de forma satisfatória, o que as tarefas pediam?', 'Pouquíssimo', 'Muitíssimo'],
  ['Esforço', 'Quanto esforço foi necessário para atingir o seu nível de desempenho nas tarefas?', 'Pouquíssimo', 'Muitíssimo'],
  ['Frustração', 'Quanta frustração (irritação, insegurança, desânimo) você sentiu durante as tarefas?', 'Pouquíssimo', 'Muitíssimo'],
];

// EFLA v4, professor (Scheffel et al., 2017), de 1 a 10. Tradução livre.
// [id, dimensão, texto]
const ITENS_EFLA = [
  ['D1', 'Dados', 'Está claro quais dados dos alunos o console usa.'],
  ['D2', 'Dados', 'Está claro por que esses dados são usados.'],
  ['A1', 'Consciência', 'O console me deixaria ciente da situação atual de aprendizagem dos alunos.'],
  ['A2', 'Consciência', 'O console me ajudaria a prever como os alunos vão estar, se continuarem como estão ou se mudarem.'],
  ['R1', 'Reflexão', 'O console me estimularia a refletir sobre a minha prática de ensino.'],
  ['R2', 'Reflexão', 'O console me estimularia a adaptar a minha prática, se necessário.'],
  ['I2', 'Impacto', 'O console me estimularia a ensinar de forma mais eficiente.'],
  ['I3', 'Impacto', 'O console me estimularia a ensinar de forma mais eficaz.'],
];
const EXTREMOS_EFLA = ['Discordo totalmente', 'Concordo totalmente'];

// Acionabilidade (Kasepalu et al., 2022).
const ACIONABILIDADE = {
  agiria: 'Se as métricas da Visão geral fossem da minha turma, eu tomaria alguma ação.',
  qualAcao: 'Que ação você tomaria, e para quem: a turma toda, alguns alunos, o planejamento do curso? Ou esperaria para ver? (opcional)',
  realidade: 'Quanto você acha que essas métricas refletiriam a realidade de uma turma de verdade?',
  extremosRealidade: ['0% (nada)', '100% (totalmente)'],
};

const METRICAS = [
  'Conclusão média',
  'Taxa de acertos',
  'Tempo ativo médio',
  'Retorno semanal',
  'Abandono médio',
  'Abandono por perfil',
  'Inatividade por perfil',
  'Distribuição de notas',
];
const COLUNAS_DAS_METRICAS = [
  'Entendi o que mostra',
  'A visualização é clara',
  'Faria algo diferente na aula por causa dele',
];

const ESCALA_CONCORDANCIA = [
  'Discordo totalmente',
  'Discordo',
  'Nem concordo nem discordo',
  'Concordo',
  'Concordo totalmente',
];
const NAO_OBSERVEI = 'Não observei';

// UEQ-S (Schrepp et al., 2017), adaptação lexical da versão de Portugal.
// Polo negativo à esquerda, de 1 a 7.
const PARES_UEQS = [
  ['Atrapalha', 'Ajuda'],
  ['Complicado', 'Fácil'],
  ['Ineficiente', 'Eficiente'],
  ['Confuso', 'Claro'],
  ['Chato', 'Empolgante'],
  ['Desinteressante', 'Interessante'],
  ['Convencional', 'Original'],
  ['Comum', 'Inovador'],
];
const PERGUNTA_UEQS = 'Para você, a tela do aluno é:';

// [titulo, opcional, itens[], pergunta aberta da página ou null, o que o bloco mede].
// Origem de cada item: README.md.
const BLOCOS = [
  ['Material personalizado', false, [
    'O conteúdo está correto, sem erros.',
    'O material está alinhado ao objetivo do tópico.',
    'O nível e a linguagem servem a um aluno de graduação.',
    'A apresentação (texto, áudio ou slides) é clara.',
    'As versões para perfis diferentes são diferentes de um jeito que faz sentido.',
    'Eu liberaria esse material para os alunos sem precisar editar.',
  ], 'Algum erro ou problema no material? Em que tópico e perfil? (opcional)', 'O que você achou do material que viu em Personalizações e como aluno: correção, alinhamento, nível e apresentação.'],
  ['Interface do aluno', false, [
    'A interface do aluno deixa claro o que fazer a seguir.',
    'O material personalizado é fácil de encontrar e de abrir.',
    'Os textos e botões estão numa linguagem que o aluno entende.',
    'A interface do aluno é adequada a estudantes de graduação.',
  ], 'Encontrou algum problema na tela do aluno? Qual e em que tela? (opcional)', 'O que você viu ao entrar como aluno.'],
  ['Utilidade e intenção de uso', false, [
    'Usar o TrailUp me ajudaria a acompanhar a aprendizagem da turma.',
    'Usar o TrailUp tornaria meu trabalho de professor mais eficaz.',
    'O TrailUp seria útil na minha disciplina.',
    'Eu usaria o TrailUp com uma turma minha, se estivesse disponível.',
    'Eu recomendaria o TrailUp a outro professor.',
  ], null, 'Se o sistema seria útil no seu trabalho e se você o usaria.'],
  ['Esforço e rotina', false, [
    'O tempo que o sistema exigiria por semana cabe na minha rotina.',
    'Montar a trilha de um tópico seria rápido o bastante.',
    'Revisar o material gerado pela IA antes de chegar ao aluno seria viável na minha rotina.',
    'Eu saberia por onde começar no console sem ajuda.',
  ], null, 'Quanto trabalho o sistema exigiria de você numa semana normal.'],
  ['Gamificação', true, [
    'Os elementos de jogo combinam com a minha disciplina.',
    'O jogo apoia o estudo, em vez de competir com ele.',
    'O ranking pode desmotivar alunos que estão atrás.',
    'Tenho controle suficiente sobre moedas, missões e eventos da turma.',
  ], null, 'Se o jogo (moedas, missões, batalhas, ranking) serve à sua disciplina.'],
  ['Dados dos alunos e ética', true, [
    'O sistema não considera fatores sociais e emocionais que só o professor conhece.',
    'O sistema preserva a minha autonomia de decidir.',
    'O uso de dados de emoção e de comportamento traz riscos à privacidade dos alunos.',
    'O perfil e os indicadores podem rotular o aluno de forma injusta.',
    'Eu saberia explicar a um aluno o que eu vejo sobre ele no console.',
  ], null, 'O que você achou do uso dos dados dos alunos e do papel da IA ao lado do professor.'],
];

const PERGUNTAS_ABERTAS = [
  'O que você usaria toda semana?',
  'O que confundiu ou atrapalhou?',
  'O que preocupa você nos dados ou na IA?',
  'O que falta para você usar o TrailUp com uma turma sua?',
];

function pendencias_() {
  const achados = [];
  const varrer = (valor, caminho) => {
    if (typeof valor === 'string') {
      if (valor.indexOf('[PREENCHER') !== -1) achados.push(caminho);
    } else if (Array.isArray(valor)) {
      valor.forEach((v, i) => varrer(v, caminho + '[' + i + ']'));
    } else if (valor && typeof valor === 'object') {
      Object.keys(valor).forEach(k => varrer(valor[k], caminho + '.' + k));
    }
  };
  varrer(CONFIG, 'CONFIG');
  return achados;
}

function verificar_() {
  const faltando = pendencias_();
  if (faltando.length && !CONFIG.rascunho) {
    throw new Error('Campos ainda sem preencher:\n' + faltando.join('\n'));
  }
  return faltando;
}

function titulo_(texto) {
  return (CONFIG.rascunho ? 'RASCUNHO – ' : '') + texto;
}

function criarFormularioDeInscricao() {
  const faltando = verificar_();
  const form = FormApp.create(titulo_('Avaliação do TrailUp por professores: inscrição'))
    .setDescription(
      'Pesquisa de Trabalho de Conclusão de Curso (Ciência da Computação, Ulbra Palmas).\n' +
      'Antes de começar, veja a cartilha do professor: ' + CONFIG.cartilhaUrl + '\n\n' +
      'Esta é a inscrição: o termo e a sua identificação. A avaliação vem depois, com o acesso que a equipe envia ao seu e-mail.\n\n' +
      'Leia o termo abaixo. As perguntas só aparecem depois que você concordar.')
    .setCollectEmail(false)
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage(
      'Inscrição recebida. A equipe vai enviar ao e-mail informado o seu acesso ao TrailUp (com senha gerada aleatoriamente), ' +
      'o seu acesso de aluno de teste e o link do formulário de avaliação.\n' +
      'O termo que você leu continua neste mesmo link, na primeira página.');

  // 1. Termo e aceite. A cópia do participante é este link: o termo fica na
  // primeira página, e ele pode reabri-lo quando quiser.
  form.addSectionHeaderItem().setTitle('Termo de consentimento');
  CONFIG.tcle.forEach(([t, texto]) => form.addSectionHeaderItem().setTitle(t).setHelpText(texto));
  form.addSectionHeaderItem().setTitle('Sua cópia').setHelpText('Guarde o link desta página: o termo fica sempre aqui, na primeira página.');
  const aceite = form.addMultipleChoiceItem()
    .setTitle('Consentimento')
    .setHelpText('Ao marcar "Li e concordo em participar", declaro que sou docente de ensino superior ou profissional da área pedagógica, tenho 18 anos ou mais, li este termo e aceito participar.');
  aceite.setChoices([
    aceite.createChoice('Li e concordo em participar', FormApp.PageNavigationType.CONTINUE),
    aceite.createChoice('Não quero participar', FormApp.PageNavigationType.SUBMIT),
  ]);

  // 2. Identificação. A pesquisa se apoia na qualificação de quem avalia, e o
  // e-mail é o login; o que é publicado o participante escolhe no fim da
  // avaliação (ver TCLE, seção 3).
  form.addPageBreakItem()
    .setTitle('Identificação')
    .setHelpText(ACESSO + '\n\nO que é publicado na monografia você só escolhe no fim da avaliação, depois de avaliar.');
  IDENTIFICACAO.forEach(([pergunta, opcoes]) => {
    if (opcoes) {
      form.addMultipleChoiceItem().setTitle(pergunta).setChoiceValues(opcoes);
    } else if (pergunta.indexOf('E-mail') === 0) {
      form.addTextItem().setTitle(pergunta)
        .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
    } else {
      form.addTextItem().setTitle(pergunta);
    }
  });
  // A página de inscrição do site preenche este campo com um código aleatório e pergunta ao
  // doGet (Planilha.gs) se a resposta chegou. Quem responde pelo Forms deixa em branco.
  form.addTextItem().setTitle(CAMPO_CODIGO_DO_SITE).setHelpText(AJUDA_CODIGO_DO_SITE);

  Logger.log('Editar: ' + form.getEditUrl());
  Logger.log('Responder (vai para VITE_PESQUISA_INSCRICAO_FORM_URL): ' + form.getPublishedUrl());
  if (faltando.length) Logger.log('RASCUNHO. Ainda falta preencher:\n' + faltando.join('\n'));
}

function criarFormulario() {
  const faltando = verificar_();
  const form = FormApp.create(titulo_(CONFIG.titulo))
    .setDescription(
      'Pesquisa de Trabalho de Conclusão de Curso (Ciência da Computação, Ulbra Palmas).\n' +
      'Este é o formulário de avaliação, para quem já se inscreveu e recebeu o acesso por e-mail. ' +
      'Cartilha do professor: ' + CONFIG.cartilhaUrl + '\n\n' + FRANQUEZA)
    .setCollectEmail(false)
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage(
      'Obrigado pela sua avaliação. O resumo dos resultados será enviado ao e-mail cadastrado.\n' +
      'Para trocar a forma como a sua avaliação aparece, a qualquer momento: ' + CONFIG.linkAtualizacao);

  // 1. Liga a avaliação à inscrição.
  form.addTextItem()
    .setTitle('E-mail cadastrado na inscrição (o mesmo do seu login)')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  // 2. Antes do roteiro.
  form.addPageBreakItem()
    .setTitle('Antes de começar o roteiro')
    .setHelpText(
      'Abra o TrailUp em outra aba (' + CONFIG.sistemaUrl + ') e entre com o seu e-mail e a senha que a equipe enviou. ' +
      'A turma é de demonstração. Pode usar conteúdo seu, mas sem dados de alunos reais. O aluno é só o seu aluno de teste.\n\n' +
      FORA_DESTA_RODADA + '\n\n' +
      'Faça cada tarefa no sistema e volte aqui para responder.\n\n' + FRANQUEZA);

  // 3. Uma página por tarefa: conclusão, SEQ, tempo e onde travou.
  TAREFAS.forEach(([id, titulo, passos]) => {
    form.addPageBreakItem()
      .setTitle(id + '. ' + titulo)
      .setHelpText(passos.map(p => '• ' + p).join('\n'));
    form.addMultipleChoiceItem()
      .setTitle(id + ' · ' + PERGUNTA_CONCLUSAO)
      .setChoiceValues(OPCOES_CONCLUSAO);
    form.addScaleItem()
      .setTitle(id + ' · ' + PERGUNTA_SEQ)
      .setBounds(1, 7)
      .setLabels(EXTREMOS_SEQ[0], EXTREMOS_SEQ[1]);
    form.addMultipleChoiceItem()
      .setTitle(id + ' · ' + PERGUNTA_TEMPO)
      .setChoiceValues(OPCOES_TEMPO);
    form.addParagraphTextItem().setTitle(id + ' · ' + PERGUNTA_DA_TAREFA);
  });

  // 4. SUS.
  form.addPageBreakItem()
    .setTitle('Usabilidade')
    .setHelpText('Pensando no sistema como um todo, de 1 (' + EXTREMOS_SUS[0].toLowerCase() + ') a 5 (' + EXTREMOS_SUS[1].toLowerCase() + ').');
  ITENS_SUS.forEach((texto, i) => {
    form.addScaleItem()
      .setTitle('SUS ' + (i + 1) + '. ' + texto)
      .setBounds(1, 5)
      .setLabels(EXTREMOS_SUS[0], EXTREMOS_SUS[1]);
  });

  // 5. Raw TLX: a carga das tarefas do console.
  form.addPageBreakItem()
    .setTitle('Carga de trabalho')
    .setHelpText(AJUDA_TLX);
  ITENS_TLX.forEach(([nome, pergunta, baixo, alto]) => {
    form.addScaleItem()
      .setTitle('TLX · ' + nome)
      .setHelpText(pergunta)
      .setBounds(0, 10)
      .setLabels(baixo, alto);
  });

  // 6. Métricas: EFLA, acionabilidade e a matriz por métrica.
  form.addPageBreakItem()
    .setTitle('As métricas do console')
    .setHelpText('Pensando na Visão geral e no detalhe dos alunos, de 1 (discordo totalmente) a 10 (concordo totalmente). ' +
      'A turma é de demonstração: responda como seria com uma turma sua.');
  ITENS_EFLA.forEach(([id, , texto]) => {
    form.addScaleItem()
      .setTitle('EFLA ' + id + '. ' + texto)
      .setBounds(1, 10)
      .setLabels(EXTREMOS_EFLA[0], EXTREMOS_EFLA[1]);
  });
  form.addScaleItem()
    .setTitle(ACIONABILIDADE.agiria)
    .setBounds(1, 10)
    .setLabels(EXTREMOS_EFLA[0], EXTREMOS_EFLA[1]);
  form.addParagraphTextItem().setTitle(ACIONABILIDADE.qualAcao);
  form.addScaleItem()
    .setTitle(ACIONABILIDADE.realidade)
    .setBounds(0, 10)
    .setLabels(ACIONABILIDADE.extremosRealidade[0], ACIONABILIDADE.extremosRealidade[1]);
  form.addCheckboxGridItem()
    .setTitle('Métricas, uma a uma')
    .setHelpText('Os valores da turma de demonstração são de exemplo: julgue o painel, não o número. Para cada métrica, marque o que vale para ela. Pode marcar mais de uma, ou nenhuma.')
    .setRows(METRICAS)
    .setColumns(COLUNAS_DAS_METRICAS);
  form.addParagraphTextItem().setTitle('Alguma métrica faltou, sobrou ou confundiu? Qual e por quê? (opcional)');

  // 7. Blocos de concordância, um por página. A tela do aluno começa pelo UEQ-S.
  BLOCOS.forEach(([titulo, opcional, itens, aberta]) => {
    form.addPageBreakItem()
      .setTitle(titulo + (opcional ? ' (opcional)' : ''))
      .setHelpText('Algumas frases são negativas de propósito: leia cada uma antes de marcar. ' +
        'Se não viu o recurso, marque "' + NAO_OBSERVEI + '".' +
        (opcional ? ' Se preferir, pule esta página.' : ''));
    if (titulo === 'Interface do aluno') {
      PARES_UEQS.forEach(([negativo, positivo], i) => {
        form.addScaleItem()
          .setTitle('UEQ-S ' + (i + 1) + '. ' + PERGUNTA_UEQS)
          .setBounds(1, 7)
          .setLabels(negativo, positivo);
      });
    }
    form.addGridItem()
      .setTitle(titulo)
      .setRows(itens)
      .setColumns(ESCALA_CONCORDANCIA.concat([NAO_OBSERVEI]));
    if (aberta) form.addParagraphTextItem().setTitle(aberta);
  });

  // 8. Abertas.
  form.addPageBreakItem().setTitle('Com as suas palavras');
  PERGUNTAS_ABERTAS.forEach(p => form.addParagraphTextItem().setTitle(p));

  // 9. Só agora, depois de avaliar, a forma de divulgação.
  form.addPageBreakItem()
    .setTitle('Por último: como a sua avaliação aparece')
    .setHelpText('Você pode trocar esta escolha quando quiser: ' + CONFIG.linkAtualizacao);
  form.addMultipleChoiceItem()
    .setTitle(DIVULGACAO[0])
    .setHelpText(DIVULGACAO[1])
    .setChoiceValues(DIVULGACAO[2]);

  Logger.log('Editar: ' + form.getEditUrl());
  Logger.log('Responder (vai só no e-mail com os acessos, nunca público): ' + form.getPublishedUrl());
  if (faltando.length) Logger.log('RASCUNHO. Ainda falta preencher:\n' + faltando.join('\n'));
}

/**
 * Formulário curto para o participante trocar, a qualquer momento até a versão
 * final da monografia, a forma como a avaliação dele aparece. Vale a resposta
 * mais recente; a equipe casa pelo e-mail informado na avaliação. O link de
 * resposta vai em CONFIG.linkAtualizacao (rodar este antes de criarFormulario).
 */
function criarFormularioDeAtualizacao() {
  const form = FormApp.create((CONFIG.rascunho ? 'RASCUNHO – ' : '') + 'Avaliação do TrailUp: atualizar como a minha avaliação aparece')
    .setDescription(
      'Use quando quiser mudar a forma como a sua avaliação aparece na monografia, até a versão final. ' +
      'Vale sempre a resposta mais recente. Sua avaliação não muda; muda só o que é publicado.')
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setConfirmationMessage('Recebido. A equipe confirma a mudança pelo e-mail informado.');
  form.addTextItem().setTitle('Nome completo');
  form.addTextItem().setTitle('E-mail informado na avaliação')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem()
    .setTitle(DIVULGACAO[0])
    .setHelpText(DIVULGACAO[1])
    .setChoiceValues(DIVULGACAO[2]);
  form.addParagraphTextItem().setTitle('Algum comentário? (opcional)');
  Logger.log('Responder (vai para CONFIG.linkAtualizacao e VITE_PESQUISA_ATUALIZACAO_FORM_URL): ' + form.getPublishedUrl());
}

// Piloto de validade de conteúdo (Alexandre; Coluci, 2011; Lynn, 1986;
// Polit; Beck, 2006). Os juízes não entram na amostra. Julgam só o que é
// tradução ou item próprio: a SUS fica de fora, porque já é validada.
// I-CVI = proporção de juízes que marcam 3 ou 4 (calcularIcvi, na cartilha).
const ESCALA_CLAREZA = [
  '1 · Não está claro',
  '2 · Precisa de grande revisão',
  '3 · Precisa de pequena revisão',
  '4 · Está claro',
];
const ESCALA_PERTINENCIA = [
  '1 · Não é pertinente',
  '2 · Precisa de grande revisão',
  '3 · Precisa de pequena revisão',
  '4 · É pertinente',
];

// [seção, o que mede, itens[]], montado das mesmas constantes da avaliação.
function secoesDoPiloto_() {
  const secoes = [
    ['Roteiro de tarefas', 'As instruções que o professor segue no sistema: se dá para entender o que fazer.',
      TAREFAS.map(([id, titulo, passos]) => id + '. ' + titulo + ': ' + passos.join(' '))],
    ['Perguntas de cada tarefa', 'Se a tarefa foi concluída, o esforço percebido (SEQ, traduzida) e o tempo, depois de cada tarefa.', [
      PERGUNTA_CONCLUSAO + ' (' + OPCOES_CONCLUSAO.join(', ') + ')',
      PERGUNTA_SEQ + ' (de 1, ' + EXTREMOS_SEQ[0].toLowerCase() + ', a 7, ' + EXTREMOS_SEQ[1].toLowerCase() + ')',
      PERGUNTA_TEMPO + ' (' + OPCOES_TEMPO.join(', ') + ')',
      PERGUNTA_DA_TAREFA,
    ]],
    ['Carga de trabalho', 'A carga de trabalho das tarefas do console (Raw TLX, perguntas adaptadas da versão brasileira).',
      ITENS_TLX.map(([nome, pergunta, baixo, alto]) => nome + ': ' + pergunta + ' (0, ' + baixo.toLowerCase() + ', a 10, ' + alto.toLowerCase() + ')')],
    ['As métricas do console', 'Se o painel deixaria o professor ciente da situação dos alunos, se estimularia reflexão e mudança de prática, e se as métricas levam a uma ação (EFLA, tradução livre, e acionabilidade).',
      ITENS_EFLA.map(([id, , texto]) => 'EFLA ' + id + '. ' + texto)
        .concat([ACIONABILIDADE.agiria, ACIONABILIDADE.qualAcao, ACIONABILIDADE.realidade])
        .concat(COLUNAS_DAS_METRICAS.map(col => 'Para cada métrica: ' + col))],
    ['Tela do aluno: pares de palavras', 'A primeira impressão da tela do aluno (UEQ-S, adaptação lexical para o Brasil): se cada par é claro e se os dois polos são opostos.',
      PARES_UEQS.map(([a, b]) => a + ' – ' + b)],
  ];
  BLOCOS.forEach(([titulo, opcional, itens, aberta, sobre]) => {
    secoes.push([titulo, sobre, aberta ? itens.concat([aberta]) : itens]);
  });
  secoes.push(['Perguntas abertas', 'O que o professor diz com as próprias palavras, no fim da avaliação.', PERGUNTAS_ABERTAS]);
  return secoes;
}

function criarFormularioDoPilotoIvc() {
  const faltando = verificar_();
  const form = FormApp.create(titulo_('Avaliação do TrailUp por professores: piloto de validade de conteúdo'))
    .setDescription(
      'Pesquisa de Trabalho de Conclusão de Curso (Ciência da Computação, Ulbra Palmas).\n\n' +
      'Você não vai usar o sistema: vai julgar as perguntas do formulário que os professores vão responder. ' +
      'Para cada item, diga se ele é claro e se é pertinente ao que a seção quer medir, de 1 a 4. ' +
      'Item que não estiver claro ou pertinente é reescrito ou sai antes da coleta.\n\n' +
      'Termo do piloto: ' + CONFIG.termoPiloto)
    .setCollectEmail(false)
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage('Obrigado. As suas notas e sugestões entram na revisão dos itens antes da coleta.');

  const aceite = form.addMultipleChoiceItem()
    .setTitle('Consentimento')
    .setHelpText('Li o termo do piloto, na descrição deste formulário, e aceito participar como juiz.');
  aceite.setChoices([
    aceite.createChoice('Li e concordo em participar', FormApp.PageNavigationType.CONTINUE),
    aceite.createChoice('Não quero participar', FormApp.PageNavigationType.SUBMIT),
  ]);

  form.addPageBreakItem().setTitle('Sobre você');
  form.addTextItem().setTitle('Nome completo');
  form.addTextItem().setTitle('E-mail')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem().setTitle('Papel').setChoiceValues(IDENTIFICACAO[3][1]);
  form.addMultipleChoiceItem().setTitle('Maior titulação').setChoiceValues(IDENTIFICACAO[4][1]);
  form.addTextItem().setTitle('Área da sua formação (graduação e pós)');

  form.addPageBreakItem()
    .setTitle('Como julgar')
    .setHelpText(
      'Clareza: o item é fácil de entender, sem ambiguidade, para um professor de qualquer área?\n' +
      'Pertinência: o item mede o que a seção diz que quer medir?\n\n' +
      '1 = não, 2 = precisa de grande revisão, 3 = precisa de pequena revisão, 4 = sim.\n' +
      'Se marcar 1, 2 ou 3, diga no campo de sugestão o que mudaria (cite o começo do item).');

  secoesDoPiloto_().forEach(([secao, mede, itens]) => {
    form.addPageBreakItem().setTitle(secao).setHelpText('O que esta seção mede: ' + mede);
    form.addGridItem().setTitle(secao + ' · Clareza').setRows(itens).setColumns(ESCALA_CLAREZA);
    form.addGridItem().setTitle(secao + ' · Pertinência').setRows(itens).setColumns(ESCALA_PERTINENCIA);
    form.addParagraphTextItem().setTitle(secao + ' · Sugestão de redação, ou o que falta medir (opcional)');
  });

  form.addPageBreakItem().setTitle('Para fechar');
  form.addScaleItem()
    .setTitle('O formulário, no conjunto, cobre o que a pesquisa quer saber sobre o sistema?')
    .setBounds(1, 4)
    .setLabels('Não cobre', 'Cobre bem');
  form.addParagraphTextItem().setTitle('O que faltou ou sobrou no formulário? (opcional)');

  Logger.log('Editar: ' + form.getEditUrl());
  Logger.log('Responder (vai só por e-mail para os juízes do piloto): ' + form.getPublishedUrl());
  if (faltando.length) Logger.log('RASCUNHO. Ainda falta preencher:\n' + faltando.join('\n'));
}
