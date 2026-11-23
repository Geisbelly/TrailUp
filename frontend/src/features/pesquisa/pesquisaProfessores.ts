// Conteúdo da cartilha da pesquisa com professores: o professor usa o
// sistema (console e interface do aluno) numa turma de demonstração e avalia,
// por escrito, a usabilidade, as métricas, os insights da IA, o esforço e o
// resto do que viu. Ninguém avalia material gerado para a pesquisa.
//
// O formulário do Google sai de scripts/apps-script-formulario-professores/Code.gs
// com estas mesmas tarefas, perguntas e escalas; pesquisaProfessores.test.ts falha se
// os dois se separarem. Mudou um texto aqui, mude lá — e o protocolo do CEP
// precisa dizer o mesmo.
//
// Instrumentos (origem item a item no README do script e em
// docs/pesquisa/proposta-instrumento-avaliacao-professores.md):
// - validada em PT-BR: SUS (Lourenço; Carmona; Lopes, 2022);
// - Raw TLX: dimensões e âncoras da versão brasileira (Ciofi-Silva et al.,
//   2023), perguntas adaptadas pelos autores (o texto final não foi publicado);
// - versão oficial em PT de Portugal, com adaptação lexical: UEQ-S;
// - tradução livre, não validada: SEQ, EFLA, Hoffman, S-TIAS, Jian, Nazaretsky;
// - elaborados pelos autores: o resto, e é assim que se declara no relato.
// Com 12 a 16 respondentes a análise é descritiva: nada de alfa nem fatorial.

export const CAMINHO_DA_CARTILHA = "/pesquisa/professores";

export type Tarefa = {
  id: string;
  onde: "console" | "aluno";
  titulo: string;
  passos: readonly string[];
  observar: string;
};

export type CampoDeIdentificacao = {
  pergunta: string;
  /** Opções fechadas; sem opções, é texto livre. */
  opcoes?: readonly string[];
};

/**
 * Identificação do participante. A pesquisa se apoia na qualificação de quem
 * avalia (docentes da área, pedagogos, especialistas), então a equipe precisa
 * saber quem respondeu. O que vai para a monografia o participante escolhe
 * em OPCOES_DIVULGACAO.
 */
export const CAMPOS_DE_IDENTIFICACAO: readonly CampoDeIdentificacao[] = [
  { pergunta: "Nome completo" },
  { pergunta: "E-mail (será o seu login no TrailUp e o contato da pesquisa)" },
  { pergunta: "Instituição em que atua" },
  {
    pergunta: "Papel em que você avalia o sistema",
    opcoes: [
      "Docente da área de Tecnologia da Informação",
      "Docente de outra área",
      "Pedagogo(a) ou coordenação pedagógica",
      "Outro",
    ],
  },
  { pergunta: "Maior titulação", opcoes: ["Graduação", "Especialização", "Mestrado", "Doutorado", "Pós-doutorado"] },
  { pergunta: "Área da sua formação (graduação e pós)" },
  {
    pergunta: "Você tem formação pedagógica?",
    opcoes: ["Pedagogia", "Licenciatura", "Pós-graduação em educação ou docência", "Não tenho"],
  },
  { pergunta: "Disciplinas que leciona ou acompanha" },
  {
    pergunta: "Tempo de atuação no ensino superior",
    opcoes: ["até 2 anos", "de 3 a 5 anos", "de 6 a 10 anos", "de 11 a 20 anos", "mais de 20 anos"],
  },
  { pergunta: "Já usou em aula um ambiente virtual com painel de dados dos alunos?", opcoes: ["Sim", "Não"] },
  { pergunta: "Já usou elementos de jogo (pontos, ranking, missões) em aula?", opcoes: ["Sim", "Não"] },
  { pergunta: "Com que frequência usa IA generativa para preparar aulas?", opcoes: ["Nunca", "Às vezes", "Com frequência"] },
  { pergunta: "Em que aparelho você vai usar o sistema?", opcoes: ["Computador", "Celular", "Tablet"] },
];

/**
 * Como a avaliação de cada especialista aparece na monografia. Res. CNS
 * 510/2016: o participante decide se a identidade é divulgada e o que pode ser
 * público (art. 9º, V), e o sigilo só cede por manifestação explícita (art. 17,
 * IV). Por isso a escolha é separada do aceite do termo, e recusar o nome não
 * tira ninguém da pesquisa.
 *
 * Contra o viés de cortesia: a escolha vem no FIM do formulário, depois da
 * avaliação, e pode ser trocada a qualquer momento até a versão final (vale a
 * mais recente). Quem escolhe o nome só aparece depois de ver o próprio quadro.
 */
export const PERGUNTA_DIVULGACAO = "Como a sua avaliação pode aparecer na monografia?";
export const AJUDA_DIVULGACAO =
  "A monografia traz a avaliação de cada especialista. A equipe sabe quem respondeu; esta escolha decide só o que é publicado. Você pode trocá-la a qualquer momento até a versão final da monografia, pelo formulário de atualização ou pelo contato do termo, e vale sempre a escolha mais recente. Com o nome, você vê o seu quadro antes e só aparece depois de confirmar.";
export const OPCOES_DIVULGACAO = [
  "Com meu nome: nome e titulação ao lado das minhas notas e comentários, só depois de eu ver o meu quadro e confirmar.",
  "Com código e perfil: apareço como E1, E2…, com titulação, formação e papel, sem o nome.",
  "Só no conjunto: minhas respostas entram apenas nos resultados agregados.",
] as const;

/**
 * Por que o e-mail cadastrado vira o login: o console mostra dados de turmas e
 * alunos, e o cadastro de professor passa pela aprovação da dona do projeto.
 * A equipe cria o acesso com senha aleatória e manda só para esse e-mail.
 */
export const ACESSO = "O e-mail que você cadastrar é o seu login no TrailUp. O acesso ao console do professor é restrito, por segurança: ele mostra dados de turmas e de alunos, e só entra quem a equipe aprova. Por isso a equipe cria o seu acesso com esse e-mail e uma senha gerada aleatoriamente, e envia só para ele os acessos (professor e aluno de teste) e o link do formulário de avaliação. Você pode trocar a senha em Meus dados. A equipe nunca pede senha sua de outro serviço, e os acessos são apagados ao fim da pesquisa.";

/**
 * Dito ao participante na cartilha, na descrição do formulário e no termo:
 * resultado negativo é resultado. Também contra o viés de cortesia.
 */
export const FRANQUEZA = "A pesquisa se alimenta tanto de resultados negativos quanto de positivos. Uma tarefa difícil, uma métrica confusa ou uma sugestão errada da IA é exatamente o que precisa aparecer: é isso que mostra o que corrigir antes de o sistema chegar a alunos. Nota dada por gentileza atrapalha a pesquisa; crítica franca ajuda.";

/** Roteiro de uso. No formulário, cada tarefa é seguida da SEQ. */
export const TAREFAS: readonly Tarefa[] = [
  {
    id: "T1",
    onde: "console",
    titulo: "Conhecer a turma",
    passos: ["Em Turmas, abra a turma de demonstração.", "Veja quem está matriculado e o perfil de cada aluno."],
    observar: "Se fica claro quem são os alunos e em que pé cada um está.",
  },
  {
    id: "T2",
    onde: "console",
    titulo: "Explorar a trilha",
    passos: [
      "Em Trilhas, abra a trilha da turma.",
      "Entre num tópico e veja os conteúdos, as atividades e as questões.",
    ],
    observar: "Se a organização em tópicos faz sentido e se você conseguiria montar uma trilha sua.",
  },
  {
    id: "T3",
    onde: "console",
    titulo: "Ver e pedir uma personalização",
    passos: [
      "Em Personalizações, veja os perfis da turma e o material de um perfil.",
      "Se quiser, peça uma geração por IA, sobre o conteúdo da turma ou sobre um conteúdo seu (ela pode levar alguns minutos ou não sair, por causa do limite gratuito do modelo).",
    ],
    observar: "Se você entende o que foi gerado, para quem, e o que precisaria revisar antes de liberar.",
  },
  {
    id: "T4",
    onde: "console",
    titulo: "Achar um aluno que precisa de atenção",
    passos: [
      "Na Visão geral, olhe os indicadores da turma.",
      "Encontre um aluno com sinal de alerta e abra o detalhe dele.",
    ],
    observar: "Quanto tempo levou para achar e se o número explica por que aquele aluno precisa de atenção.",
  },
  {
    id: "T5",
    onde: "console",
    titulo: "Ler uma sugestão da IA",
    passos: [
      "Em Recomendações, leia um insight ou uma intervenção sugerida.",
      "Decida se aceitaria, ignoraria ou deixaria para depois.",
    ],
    observar: "Se a sugestão diz por que foi feita e se ela bate com o que você viu nos dados.",
  },
  {
    id: "T6",
    onde: "console",
    titulo: "Corrigir uma entrega",
    passos: ["Em Notas, abra a fila e veja uma entrega de aluno."],
    observar: "Se a fila mostra o que precisa da sua decisão primeiro.",
  },
  {
    id: "T7",
    onde: "console",
    titulo: "Entender o jogo da turma",
    passos: [
      "Passe por Economia, Missões, Eventos e Conquistas.",
      "Veja como as moedas, a loja, as missões e os eventos estão configurados.",
    ],
    observar: "Se você saberia ajustar o jogo à sua turma e se ele apoia o estudo.",
  },
  {
    id: "T8",
    onde: "console",
    titulo: "Ver a competição",
    passos: ["Abra Rankings, Rank de batalhas e Guildas."],
    observar: "O que a competição mostra e o efeito que ela teria em quem está atrás.",
  },
  {
    id: "T9",
    onde: "aluno",
    titulo: "Estudar como aluno",
    passos: [
      "Entre com o seu acesso de aluno de teste.",
      "Abra a trilha, um tópico e o material personalizado (texto, áudio ou apresentação).",
    ],
    observar: "Se o aluno sabe o que fazer a seguir e se o material é fácil de abrir.",
  },
  {
    id: "T10",
    onde: "aluno",
    titulo: "Ver o jogo pelo lado do aluno",
    passos: ["Ainda como aluno, abra as missões, a loja e o ranking."],
    observar: "Como o aluno vê o próprio progresso e os colegas.",
  },
];

// Depois de cada tarefa: conclusão, SEQ, tempo e onde travou. Sem gravação, a
// conclusão é autodeclarada; onde a tarefa deixa rastro na turma de
// demonstração, a equipe confere contra ele (ver README do script).
export const PERGUNTA_CONCLUSAO = "Você conseguiu fazer a tarefa?";
export const OPCOES_CONCLUSAO = ["Sim", "Em parte", "Não", "Não tentei"] as const;

/** SEQ (Sauro; Dumas, 2009), de 1 a 7. Tradução sem validação. */
export const PERGUNTA_SEQ = "No geral, esta tarefa foi:";
export const EXTREMOS_SEQ = ["Muito difícil", "Muito fácil"] as const;

/** Faixas: mais confiáveis do que minutos digitados de memória. */
export const PERGUNTA_TEMPO = "Quanto tempo levou, mais ou menos?";
export const OPCOES_TEMPO = ["Menos de 2 min", "De 2 a 5 min", "De 5 a 10 min", "Mais de 10 min"] as const;

export const PERGUNTA_DA_TAREFA = "Onde travou, o que confundiu ou o que faltou? (opcional)";

/** Escala de Usabilidade de Sistema, versão brasileira (Lourenço; Carmona; Lopes, 2022, Tabela 1, a versão aplicada no estudo). */
export const EXTREMOS_SUS = ["Discordo fortemente", "Concordo fortemente"] as const;
export const ITENS_SUS: readonly string[] = [
  "Eu acho que gostaria de usar esse sistema frequentemente.",
  "Eu achei esse sistema desnecessariamente complexo.",
  "Eu achei esse sistema fácil de usar.",
  "Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema.",
  "Eu achei que as várias funções desse sistema foram bem integradas.",
  "Eu acho que o sistema apresenta muita inconsistência.",
  "Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente.",
  "Eu achei esse sistema muito pesado para usar.",
  "Eu me senti muito seguro usando o sistema.",
  "Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema.",
];

/**
 * Raw TLX (Hart, 2006): seis dimensões, sem a etapa de pesos. Nomes das
 * dimensões, pergunta de Esforço e âncoras (pouquíssimo/muitíssimo) da versão
 * brasileira de Ciofi-Silva et al. (2023). O texto final das outras cinco
 * perguntas não está publicado (o artigo remete a um suplemento que não está
 * online), então elas são adaptação dos autores a partir das definições do
 * próprio artigo. A linha de 20 intervalos vira uma escala de 0 a 10 no Forms.
 * Desempenho é invertido na conta (ver pontuarTlx).
 */
export const AJUDA_TLX =
  "Pensando nas tarefas do console como um todo, de 0 (pouquíssimo) a 10 (muitíssimo). Não há resposta certa: é a sua impressão.";
export const ITENS_TLX: readonly (readonly [string, string, string, string])[] = [
  ["Demanda mental", "Quanto raciocínio, decisão ou cálculo as tarefas exigiram?", "Pouquíssimo", "Muitíssimo"],
  ["Demanda física", "Quanta atividade física as tarefas exigiram?", "Pouquíssimo", "Muitíssimo"],
  ["Demanda temporal", "Quanta pressão de tempo você sentiu para fazer as tarefas?", "Pouquíssimo", "Muitíssimo"],
  ["Desempenho", "Quanto você conseguiu fazer, de forma satisfatória, o que as tarefas pediam?", "Pouquíssimo", "Muitíssimo"],
  ["Esforço", "Quanto esforço foi necessário para atingir o seu nível de desempenho nas tarefas?", "Pouquíssimo", "Muitíssimo"],
  ["Frustração", "Quanta frustração (irritação, insegurança, desânimo) você sentiu durante as tarefas?", "Pouquíssimo", "Muitíssimo"],
];

export type DimensaoEfla = "Dados" | "Consciência" | "Reflexão" | "Impacto";
export type ItemEfla = { id: string; dimensao: DimensaoEfla; texto: string };

/**
 * EFLA v4, versão do professor (Scheffel et al., 2017): 8 itens de 1 a 10.
 * Tradução livre, não validada; no condicional porque a turma é de
 * demonstração (percepção hipotética, declarada como limitação). Já usado no
 * Brasil por Roque da Silva et al. (2024), o que permite comparar o escore.
 */
export const ITENS_EFLA: readonly ItemEfla[] = [
  { id: "D1", dimensao: "Dados", texto: "Está claro quais dados dos alunos o console usa." },
  { id: "D2", dimensao: "Dados", texto: "Está claro por que esses dados são usados." },
  { id: "A1", dimensao: "Consciência", texto: "O console me deixaria ciente da situação atual de aprendizagem dos alunos." },
  { id: "A2", dimensao: "Consciência", texto: "O console me ajudaria a prever como os alunos vão estar, se continuarem como estão ou se mudarem." },
  { id: "R1", dimensao: "Reflexão", texto: "O console me estimularia a refletir sobre a minha prática de ensino." },
  { id: "R2", dimensao: "Reflexão", texto: "O console me estimularia a adaptar a minha prática, se necessário." },
  { id: "I2", dimensao: "Impacto", texto: "O console me estimularia a ensinar de forma mais eficiente." },
  { id: "I3", dimensao: "Impacto", texto: "O console me estimularia a ensinar de forma mais eficaz." },
];
export const EXTREMOS_EFLA = ["Discordo totalmente", "Concordo totalmente"] as const;

/** Acionabilidade (Kasepalu et al., 2022); a ação é codificada por Wise e Jung (2019). */
export const ACIONABILIDADE = {
  agiria: "Com base nas métricas da Visão geral, eu tomaria alguma ação na turma.",
  qualAcao:
    "Que ação você tomaria, e para quem: a turma toda, alguns alunos, o planejamento do curso? Ou esperaria para ver? (opcional)",
  realidade: "Quanto você acha que essas métricas refletiriam a realidade de uma turma de verdade?",
  extremosRealidade: ["0% (nada)", "100% (totalmente)"],
} as const;

/** Métricas da Visão geral avaliadas uma a uma (nomes como aparecem no console). */
export const METRICAS: readonly string[] = [
  "Conclusão média",
  "Taxa de acertos",
  "Tempo ativo médio",
  "Retorno semanal",
  "Abandono médio",
  "Sinais de alerta",
  "Perfil BrainHex da turma",
];

/**
 * Para cada métrica, o professor marca o que vale. Item próprio: é o único
 * lugar que diz QUAL métrica falha, coisa que o EFLA não separa.
 */
export const COLUNAS_DAS_METRICAS: readonly string[] = [
  "Entendi o que mostra",
  "Confio no número",
  "Faria algo diferente na aula por causa dele",
];

export const ESCALA_CONCORDANCIA = [
  "Discordo totalmente",
  "Discordo",
  "Nem concordo nem discordo",
  "Concordo",
  "Concordo totalmente",
] as const;

/** Coluna extra nos blocos: quem não viu o recurso não chuta. Fica fora da conta. */
export const NAO_OBSERVEI = "Não observei";

/**
 * UEQ-S (Schrepp; Hinderks; Thomaschewski, 2017), para a tela do aluno. 8
 * pares de 7 pontos, o polo negativo à esquerda. Partindo da versão oficial em
 * português de Portugal (Pérez Cota et al., 2014), com adaptação lexical para o
 * Brasil, não validada — os pares mudados estão no README do script. 1–4:
 * qualidade pragmática; 5–8: hedônica.
 */
export const PARES_UEQS: readonly (readonly [string, string])[] = [
  ["Atrapalha", "Ajuda"],
  ["Complicado", "Fácil"],
  ["Ineficiente", "Eficiente"],
  ["Confuso", "Claro"],
  ["Chato", "Empolgante"],
  ["Desinteressante", "Interessante"],
  ["Convencional", "Original"],
  ["Comum", "Inovador"],
];
export const PERGUNTA_UEQS = "Para você, a tela do aluno é:";

export type Bloco = {
  id: string;
  titulo: string;
  opcional: boolean;
  /** O que o bloco mede, dito ao professor. */
  sobre: string;
  /** De onde vêm os itens. A origem item a item fica no README do script. */
  fontes: string;
  itens: readonly string[];
};

export const BLOCOS: readonly Bloco[] = [
  {
    id: "insights",
    titulo: "Sugestões da IA",
    opcional: false,
    sobre: "Se você entende por que a IA fez cada sugestão, se confia nela e se ela ajuda a decidir.",
    fontes: "Hoffman et al. (2023); S-TIAS (McGrath et al., 2025); Jian et al. (2000); Nazaretsky et al. (2022); Pu, Chen e Hu (2011)",
    itens: [
      "Entendi por que o sistema fez a sugestão para aquele aluno ou para a turma.",
      "A explicação da sugestão tem detalhe suficiente.",
      "A explicação é útil para eu decidir o que fazer.",
      "A explicação deixa claro o quanto posso confiar na sugestão.",
      "Confio nas sugestões do sistema.",
      "As sugestões do sistema são confiáveis.",
      "Desconfio das sugestões do sistema.",
      "Eu levaria uma sugestão do sistema tão a sério quanto a de um colega professor.",
      "Alguma sugestão me pareceu errada ou injusta com o aluno.",
      "Eu conferiria os dados antes de agir a partir de uma sugestão.",
    ],
  },
  {
    id: "material",
    titulo: "Material personalizado",
    opcional: false,
    sobre: "O que você achou do material que viu em Personalizações e como aluno: correção, alinhamento, nível e apresentação.",
    fontes: "dimensões do LORI (Leacock; Nesbit, 2007; adaptação brasileira de Marcos; Puricelli; Grosseman, 2024); Sarsa et al. (2022); Doughty et al. (2024)",
    itens: [
      "O conteúdo está correto, sem erros.",
      "O material está alinhado ao objetivo do tópico.",
      "O nível e a linguagem servem a um aluno de graduação.",
      "A apresentação (texto, áudio ou slides) é clara.",
      "As versões para perfis diferentes são diferentes de um jeito que faz sentido.",
      "Eu liberaria esse material para os alunos sem precisar editar.",
    ],
  },
  {
    id: "interface-aluno",
    titulo: "Interface do aluno",
    opcional: false,
    sobre: "O que você viu ao entrar como aluno.",
    fontes: "itens elaborados pelos autores, nas heurísticas de Nielsen (1994)",
    itens: [
      "A interface do aluno deixa claro o que fazer a seguir.",
      "O material personalizado é fácil de encontrar e de abrir.",
      "Os textos e botões estão numa linguagem que o aluno entende.",
      "A interface do aluno é adequada a estudantes de graduação.",
    ],
  },
  {
    id: "aceitacao",
    titulo: "Utilidade e intenção de uso",
    opcional: false,
    sobre: "Se o sistema seria útil no seu trabalho e se você o usaria.",
    fontes: "itens adaptados da utilidade percebida do TAM (Davis, 1989)",
    itens: [
      "Usar o TrailUp me ajudaria a acompanhar a aprendizagem da turma.",
      "Usar o TrailUp tornaria meu trabalho de professor mais eficaz.",
      "O TrailUp seria útil na minha disciplina.",
      "Eu usaria o TrailUp com uma turma minha, se estivesse disponível.",
      "Eu recomendaria o TrailUp a outro professor.",
    ],
  },
  {
    id: "esforco",
    titulo: "Esforço e rotina",
    opcional: false,
    sobre: "Quanto trabalho o sistema exigiria de você numa semana normal.",
    fontes: "itens elaborados pelos autores",
    itens: [
      "O tempo que o sistema exigiria por semana cabe na minha rotina.",
      "Montar a trilha de um tópico seria rápido o bastante.",
      "Revisar o material gerado pela IA antes de chegar ao aluno seria viável na minha rotina.",
      "Eu saberia por onde começar no console sem ajuda.",
    ],
  },
  {
    id: "gamificacao",
    titulo: "Gamificação",
    opcional: true,
    sobre: "Se o jogo (moedas, missões, batalhas, ranking) serve à sua disciplina.",
    fontes: "itens elaborados pelos autores; Hanus e Fox (2015), sobre ranking e comparação social",
    itens: [
      "Os elementos de jogo combinam com a minha disciplina.",
      "O jogo apoia o estudo, em vez de competir com ele.",
      "O ranking pode desmotivar alunos que estão atrás.",
      "Tenho controle suficiente sobre moedas, missões e eventos da turma.",
    ],
  },
  {
    id: "privacidade",
    titulo: "Dados dos alunos e ética",
    opcional: true,
    sobre: "O que você achou do uso dos dados dos alunos e do papel da IA ao lado do professor.",
    fontes: "Nazaretsky et al. (2022); Drachsler e Greller (2016); itens elaborados pelos autores",
    itens: [
      "O sistema não considera fatores sociais e emocionais que só o professor conhece.",
      "O sistema preserva a minha autonomia de decidir.",
      "O uso de dados de emoção e de comportamento traz riscos à privacidade dos alunos.",
      "O perfil e os indicadores podem rotular o aluno de forma injusta.",
      "Eu saberia explicar a um aluno o que eu vejo sobre ele no console.",
    ],
  },
];

export const PERGUNTAS_ABERTAS: readonly string[] = [
  "O que você usaria toda semana?",
  "O que confundiu ou atrapalhou?",
  "O que preocupa você nos dados ou na IA?",
  "O que falta para você usar o TrailUp com uma turma sua?",
];

/** Pontuação da SUS (Brooke, 1996): ímpares resposta − 1, pares 5 − resposta, soma × 2,5. */
export function pontuarSus(respostas: readonly (number | null | undefined)[]): number | null {
  if (respostas.length !== 10) return null;
  let soma = 0;
  for (let i = 0; i < 10; i++) {
    const r = respostas[i];
    if (r !== 1 && r !== 2 && r !== 3 && r !== 4 && r !== 5) return null;
    soma += i % 2 === 0 ? r - 1 : 5 - r;
  }
  return soma * 2.5;
}

/**
 * Raw TLX de 0 a 100: média das seis dimensões (0 a 10) × 10, com Desempenho
 * invertido, porque ali "muitíssimo" é bom e nas outras é carga.
 */
export function pontuarTlx(respostas: readonly (number | null | undefined)[]): number | null {
  if (respostas.length !== ITENS_TLX.length) return null;
  if (!respostas.every(r => typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 10)) return null;
  const carga = (respostas as number[]).map((r, i) => (ITENS_TLX[i][0] === "Desempenho" ? 10 - r : r));
  return (carga.reduce((a, b) => a + b, 0) / carga.length) * 10;
}

/**
 * EFLA (Scheffel et al., 2017): média por dimensão, levada a 0–100 por
 * (x − 1) / 9 × 100, e o geral é a média das dimensões. Dimensão com item em
 * branco fica null, e o geral também.
 */
export function pontuarEfla(
  respostas: Readonly<Record<string, number | null | undefined>>,
): { dimensoes: Record<DimensaoEfla, number | null>; geral: number | null } {
  const dimensoes = {} as Record<DimensaoEfla, number | null>;
  for (const dim of ["Dados", "Consciência", "Reflexão", "Impacto"] as const) {
    const notas = ITENS_EFLA.filter(i => i.dimensao === dim).map(i => respostas[i.id]);
    const validas = notas.every(n => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10);
    dimensoes[dim] = validas
      ? ((notas as number[]).reduce((a, b) => a + b, 0) / notas.length - 1) / 9 * 100
      : null;
  }
  const valores = Object.values(dimensoes);
  const geral = valores.every(v => v !== null)
    ? (valores as number[]).reduce((a, b) => a + b, 0) / valores.length
    : null;
  return { dimensoes, geral };
}

/** UEQ-S: cada resposta de 1 a 7 vira −3 a +3; pragmática = pares 1–4, hedônica = 5–8. */
export function pontuarUeqs(
  respostas: readonly (number | null | undefined)[],
): { pragmatica: number; hedonica: number; geral: number } | null {
  if (respostas.length !== PARES_UEQS.length) return null;
  if (!respostas.every(r => typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 7)) return null;
  const v = (respostas as number[]).map(r => r - 4);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { pragmatica: media(v.slice(0, 4)), hedonica: media(v.slice(4)), geral: media(v) };
}

/**
 * Piloto de validade de conteúdo (criarFormularioDoPilotoIvc no Code.gs).
 * I-CVI: proporção de juízes que deram 3 ou 4 ao item, numa escala de 1 a 4
 * (Lynn, 1986). Juiz em branco não entra no denominador.
 */
export function calcularIcvi(notas: readonly (number | null | undefined)[]): number | null {
  const validas = notas.filter((n): n is number => n === 1 || n === 2 || n === 3 || n === 4);
  if (validas.length === 0) return null;
  return validas.filter(n => n >= 3).length / validas.length;
}

/** S-CVI/Ave: média dos I-CVI (Polit; Beck, 2006). Meta: 0,90 ou mais. */
export function calcularScviMedio(icvis: readonly (number | null)[]): number | null {
  const validos = icvis.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/** Limiar do I-CVI por número de juízes (Lynn, 1986): até 5, todos; de 6 a 10, 0,78. */
export function limiarDoIcvi(juizes: number): number {
  return juizes <= 5 ? 1 : 0.78;
}
export const META_DO_SCVI_MEDIO = 0.9;

// Textos da cartilha (página, PDF, imagem e roteiro do vídeo leem daqui).

export const TEMPO_ESTIMADO =
  "De uma hora a uma hora e quinze no total: uns 40 minutos usando o sistema e uns 30 respondendo. O tempo exato será medido num teste antes da coleta, e você não precisa terminar no mesmo dia.";

export const RESUMO: readonly { titulo: string; texto: string }[] = [
  {
    titulo: "Quem participa",
    texto: "Especialistas: docentes de ensino superior da área de Tecnologia da Informação e de fora dela, e pedagogos.",
  },
  {
    titulo: "O que você faz",
    texto: "Usa o TrailUp numa turma de demonstração: o console do professor, com o conteúdo da turma ou com um seu, e, depois, a tela do aluno, com o seu aluno de teste.",
  },
  {
    titulo: "Como você avalia",
    texto: "Em dois formulários do Google: a inscrição e, depois de receber o acesso, a avaliação, com quatro perguntas rápidas por tarefa e blocos de perguntas tirados de escalas publicadas.",
  },
  {
    titulo: "Identificado, e você decide como aparece",
    texto: "A equipe sabe quem respondeu, porque a sua formação conta. Como você aparece na monografia, você escolhe só no fim, e pode trocar quando quiser. Sem entrevista e sem gravação.",
  },
];

export const PASSOS: readonly { titulo: string; texto: string }[] = [
  {
    titulo: "Inscreva-se",
    texto: "O formulário de inscrição começa pelo Termo de Consentimento. Depois de concordar, você se identifica: nome, e-mail, instituição, titulação, formação e o papel em que avalia. O e-mail informado será o seu login no TrailUp.",
  },
  {
    titulo: "Receba o seu acesso",
    texto: "A equipe cria o seu acesso com esse e-mail e uma senha gerada aleatoriamente, e envia só para ele: o acesso de professor, o de aluno de teste e o link do formulário de avaliação.",
  },
  {
    titulo: "Abra o TrailUp e o formulário de avaliação",
    texto: "Entre no TrailUp numa aba e abra o formulário de avaliação na outra. Ele começa pedindo o e-mail que você cadastrou.",
  },
  {
    titulo: "Siga o roteiro, uma tarefa por vez",
    texto: "Faça a tarefa no sistema e volte ao formulário: diga se conseguiu, de 1 a 7 se foi difícil ou fácil, quanto tempo levou mais ou menos e, se quiser, onde travou.",
  },
  {
    titulo: "Entre como aluno",
    texto: "As duas últimas tarefas usam o seu acesso de aluno de teste, para você ver o que o estudante vê.",
  },
  {
    titulo: "Responda aos blocos de avaliação",
    texto: "Usabilidade, esforço, métricas, sugestões da IA, material personalizado, tela do aluno, utilidade e rotina. Gamificação e dados dos alunos são opcionais.",
  },
  {
    titulo: "Escreva o que pensa",
    texto: "Quatro perguntas abertas, com as suas palavras.",
  },
  {
    titulo: "Só então escolha como aparece, e envie",
    texto: "A forma de divulgação é a última pergunta, depois de toda a avaliação. Você pode trocá-la depois, a qualquer momento até a versão final da monografia.",
  },
];

export const ITENS_DO_ACESSO: readonly string[] = [
            "Por segurança, todo acesso de professor passa pela aprovação da equipe: o console mostra dados de turmas e de alunos.",
            "Use o mesmo e-mail na inscrição e no formulário de avaliação: é ele que liga as duas partes.",
            "A senha chega só ao seu e-mail. Não a repasse a ninguém, e troque-a em Meus dados, se quiser.",
            "Se a mensagem com o acesso não chegar, confira a caixa de spam e escreva para o contato do termo.",
];

export const FACA: readonly string[] = [
  "Seja franco. Problemas e críticas valem tanto quanto elogios; nota dada por gentileza atrapalha a pesquisa.",
  "Explore à vontade e, se quiser, use conteúdo seu: a turma é de demonstração e os alunos são fictícios. Errar ou clicar no lugar errado também é resultado.",
  "Avalie sozinho. Não combine respostas com outros professores antes de enviar.",
  "Responda pensando no que você viu, e não no que o sistema poderia ser.",
  "Deixe em branco o que você não souber avaliar, em vez de chutar.",
];

export const EVITE: readonly string[] = [
  "Conteúdo seu pode, mas sem dados de alunos reais e sem material de terceiros que você não possa compartilhar: o que vai numa geração é enviado ao modelo de IA.",
  "Não cadastre alunos reais nem dados pessoais de ninguém: por enquanto, o único aluno é o seu aluno de teste.",
  "Não cite alunos ou colegas pelo nome nos comentários.",
];

export const PERGUNTAS_FREQUENTES: readonly { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Por que o formulário pede meu nome e minha formação?",
    resposta: "Porque a pesquisa se apoia na avaliação de especialistas: docentes da área, pedagogos e professores de outras áreas. A monografia apresenta a avaliação de cada um junto com a qualificação de quem avaliou, e compara os grupos. Se a avaliação sai com o seu nome, com um código e o seu perfil, ou só no conjunto, quem decide é você.",
  },
  {
    pergunta: "Tenho receio de criticar o trabalho de uma aluna. E agora?",
    resposta: "Critique. A pesquisa precisa saber o que não funciona, e um resultado negativo bem descrito vale tanto quanto um positivo: é ele que mostra o que corrigir antes de o sistema chegar a alunos. Uma avaliação feita por gentileza esconde justamente o que a pesquisa quer encontrar. E você só decide se aparece com o nome depois de avaliar, podendo trocar quando quiser.",
  },
  {
    pergunta: "Posso mudar a forma como apareço na monografia?",
    resposta: "Sim, a qualquer momento até a versão final da monografia, pelo formulário de atualização (o link aparece na mensagem de confirmação e nesta página) ou pelo contato do termo. Vale sempre a escolha mais recente. Se você escolheu o nome, só aparece com ele depois de ver o seu quadro e confirmar. Depois que a versão final é entregue, ela não muda mais.",
  },
  {
    pergunta: "Por que não posso criar a minha própria conta?",
    resposta: "Porque o acesso ao console do professor é restrito, por segurança: ele mostra dados de turmas e de alunos. Por isso a equipe cria o acesso com o e-mail que você cadastrou e uma senha gerada aleatoriamente, enviada só para esse e-mail. A equipe nunca pede senha sua de outro serviço.",
  },
  {
    pergunta: "Quem está sendo avaliado: eu ou o sistema?",
    resposta: "O sistema. Não há resposta certa nem nota para você. Se uma tarefa foi difícil, isso aponta um problema do TrailUp.",
  },
  {
    pergunta: "Preciso saber programar ou entender de IA?",
    resposta: "Não. A pesquisa quer justamente a visão de especialistas diferentes: docentes de TI, de outras áreas e pedagogos.",
  },
  {
    pergunta: "Posso usar o celular?",
    resposta: "O console funciona no celular, mas o roteiro foi pensado para o computador, com o formulário numa aba e o sistema na outra.",
  },
  {
    pergunta: "A geração por IA não funcionou. E agora?",
    resposta: "Anote no campo da tarefa e siga em frente. O modelo usado tem limite diário gratuito, e uma falha também é informação para a pesquisa.",
  },
  {
    pergunta: "Posso parar no meio e voltar depois?",
    resposta: "Pode parar quando quiser. Se você estiver conectado a uma conta Google no navegador, o próprio Forms costuma guardar o rascunho; sem conta conectada, fechar a página antes de enviar perde o que foi marcado.",
  },
  {
    pergunta: "O que eu fizer no sistema entra na pesquisa?",
    resposta: "Só uma parte, e só para conferir o roteiro: a equipe olha, na turma de demonstração, se o que a tarefa pede ficou registrado (por exemplo, se a sugestão foi decidida ou a entrega corrigida). Nenhum outro dado do seu uso entra na pesquisa. Ao fim, a turma, o conteúdo que você puser nela e os acessos de teste são apagados.",
  },
  {
    pergunta: "Vou saber o resultado?",
    resposta: "Sim. Todos os participantes recebem um resumo pelo e-mail informado, e os resultados só são publicados de forma agregada.",
  },
];

const HOSTS_DO_FORMULARIO = new Set(["docs.google.com", "forms.gle"]);

/**
 * Link do formulário vindo do ambiente. Só aceita formulário do Google em
 * https; qualquer outra coisa vira null e a página mostra "ainda não aberto".
 * Sem link é o estado certo antes da aprovação do CEP.
 */
export function linkDoFormulario(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto.trim()) return null;
  let url: URL;
  try {
    url = new URL(bruto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS_DO_FORMULARIO.has(url.hostname)) return null;
  if (url.hostname === "docs.google.com" && !url.pathname.startsWith("/forms/")) return null;
  return url.toString();
}
