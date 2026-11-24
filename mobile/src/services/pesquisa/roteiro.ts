/**
 * Roteiro da avaliação para o aluno de teste da pesquisa com professores.
 *
 * O avaliador usa duas contas: a de professor, no console (site), e a do aluno de teste, aqui. As
 * marcas e as anotações são as mesmas nas duas (migration `20261123_03`). O app mostra o roteiro
 * inteiro, como o console: as etapas do app abertas e as do console e do site também, para marcar
 * e para anotar. O andamento é um só nas duas contas.
 *
 * Cópia do roteiro do site (`frontend/src/features/pesquisa/roteiroDaPesquisa.ts`, que tira as
 * tarefas de `TAREFAS`). O teste do site compara as duas, então mudar o texto lá sem mudar aqui
 * reprova o CI. Módulo puro: sem React Native, para rodar no teste do Node.
 */

export type EtapaDoAluno = {
  id: string;
  titulo: string;
  passos: readonly string[];
  observar?: string;
  tarefa?: string;
};

export type OndeEAEtapa = "site" | "console" | "app";

export type EtapaDoRoteiro = EtapaDoAluno & { onde: OndeEAEtapa };

export const ONDE_E_A_ETAPA: Record<OndeEAEtapa, string> = {
  site: "No site",
  console: "No console",
  app: "No app",
};

/** Todas as etapas do roteiro, na ordem, só com o título (para rotular anotações feitas no console). */
export const TITULOS_DO_ROTEIRO: readonly (readonly [id: string, titulo: string])[] = [
  ["video", "Ver o passo a passo em vídeo"],
  ["t1", "T1. Conhecer a turma"],
  ["t2", "T2. Explorar a trilha"],
  ["t3", "T3. Ver e pedir uma personalização"],
  ["t4", "T4. Ler as métricas da turma"],
  ["t5", "T5. Entender o jogo da turma"],
  ["t6", "T6. Ver a competição"],
  ["aluno-acesso", "Entrar no app como aluno"],
  ["t7", "T7. Estudar como aluno"],
  ["t8", "T8. Ver o jogo pelo lado do aluno"],
  ["blocos", "Responder aos blocos e enviar"],
];

/** As etapas que acontecem no app. */
export const ETAPAS_DO_ALUNO: readonly EtapaDoAluno[] = [
  {
    id: "aluno-acesso",
    titulo: "Entrar no app como aluno",
    passos: [
      "Instale o app do TrailUp (página Download do site) e entre com o acesso de aluno de teste que chegou por e-mail.",
      "Faça o cadastro do aluno até o fim. A matrícula na sua turma de demonstração acontece sozinha.",
    ],
  },
  {
    id: "t7",
    tarefa: "T7",
    titulo: "Estudar como aluno",
    passos: [
      "Entre com o seu acesso de aluno de teste.",
      "Abra a trilha, um tópico e o material personalizado (texto, áudio ou apresentação).",
    ],
    observar: "Se o aluno sabe o que fazer a seguir e se o material é fácil de abrir.",
  },
  {
    id: "t8",
    tarefa: "T8",
    titulo: "Ver o jogo pelo lado do aluno",
    passos: ["Ainda como aluno, abra as missões, a loja e o ranking."],
    observar: "Como o aluno vê o próprio progresso e os colegas.",
  },
];

/** As etapas fora do app (site e console), com o mesmo texto do roteiro do site. */
const ETAPAS_FORA_DO_APP: readonly EtapaDoRoteiro[] = [
  {
    id: "video",
    titulo: "Ver o passo a passo em vídeo",
    onde: "site",
    passos: [
      "São uns quatro minutos e meio: as três fases da pesquisa, as oito tarefas e o que vem depois delas.",
    ],
  },
  {
    id: "t1",
    tarefa: "T1",
    titulo: "Conhecer a turma",
    onde: "console",
    passos: [
      "Em Turmas, abra a turma de demonstração.",
      "Veja quem está matriculado e o perfil de cada aluno.",
    ],
    observar: "Se fica claro quem são os alunos e em que pé cada um está.",
  },
  {
    id: "t2",
    tarefa: "T2",
    titulo: "Explorar a trilha",
    onde: "console",
    passos: [
      "Em Trilhas, abra a trilha da turma.",
      "Entre num tópico e veja os conteúdos, as atividades e as questões.",
    ],
    observar: "Se a organização em tópicos faz sentido e se você conseguiria montar uma trilha sua.",
  },
  {
    id: "t3",
    tarefa: "T3",
    titulo: "Ver e pedir uma personalização",
    onde: "console",
    passos: [
      "Em Personalizações, veja os perfis da turma e o material de um perfil.",
      "Se quiser, peça uma geração por IA, sobre o conteúdo da turma ou sobre um conteúdo seu (ela pode levar alguns minutos ou não sair, por causa do limite gratuito do modelo).",
    ],
    observar: "Se você entende o que foi gerado, para quem, e o que precisaria revisar antes de liberar.",
  },
  {
    id: "t4",
    tarefa: "T4",
    titulo: "Ler as métricas da turma",
    onde: "console",
    passos: [
      "Na Visão geral, com a turma de demonstração selecionada, veja os painéis com o selo de exemplo.",
      "Em cada métrica, abra a explicação (o ícone ao lado do nome) e diga para você mesmo o que ela mostra.",
    ],
    observar: "Se cada painel se entende sozinho e se a explicação diz o que o número mede. Os valores são de exemplo, então avalie o formato de cada painel.",
  },
  {
    id: "t5",
    tarefa: "T5",
    titulo: "Entender o jogo da turma",
    onde: "console",
    passos: [
      "Passe por Economia, Missões, Eventos e Conquistas.",
      "Veja como as moedas, a loja, as missões e os eventos estão configurados.",
    ],
    observar: "Se você saberia ajustar o jogo à sua turma e se ele apoia o estudo.",
  },
  {
    id: "t6",
    tarefa: "T6",
    titulo: "Ver a competição",
    onde: "console",
    passos: [
      "Abra Rankings, Rank de batalhas e Guildas.",
    ],
    observar: "O que a competição mostra e o efeito que ela teria em quem está atrás.",
  },
  {
    id: "blocos",
    titulo: "Responder aos blocos e enviar",
    onde: "console",
    passos: [
      "Depois das tarefas vêm os blocos de perguntas e as quatro perguntas abertas, na aba Avaliar o TrailUp.",
      "Releia as suas anotações antes. A forma de divulgação é a última pergunta.",
    ],
  },
];

/** O roteiro inteiro, na ordem de `TITULOS_DO_ROTEIRO`: o mesmo que o console mostra. */
export const ETAPAS_DO_ROTEIRO: readonly EtapaDoRoteiro[] = TITULOS_DO_ROTEIRO.map(([id]) => {
  const doApp = ETAPAS_DO_ALUNO.find((e) => e.id === id);
  const etapa: EtapaDoRoteiro | undefined = doApp ? { ...doApp, onde: "app" } : ETAPAS_FORA_DO_APP.find((e) => e.id === id);
  if (!etapa) throw new Error(`Etapa do roteiro sem texto: ${id}`);
  return etapa;
});

export const DEPOIS_DO_APP =
  "Terminou as tarefas do aluno? Volte ao console, na aba Avaliar o TrailUp, para responder às perguntas da T7 e da T8 e aos blocos finais.";

export const PRIVACIDADE_DAS_ANOTACOES =
  "Só você vê, no app e no console. A equipe não lê: o que contar para a pesquisa, escreva no formulário.";

export const LIMITE_DA_ANOTACAO = 2000;

export const tituloDaEtapaDoAluno = (etapa: EtapaDoAluno) =>
  etapa.tarefa ? `${etapa.tarefa}. ${etapa.titulo}` : etapa.titulo;

const ROTULO_CURTO: Record<string, string> = { video: "Vídeo", "aluno-acesso": "Entrar", blocos: "Blocos" };

/** Rótulo curto da etapa, para os botões de escolher a etapa da anotação. */
export const rotuloCurtoDaEtapa = (etapa: EtapaDoAluno) => etapa.tarefa ?? ROTULO_CURTO[etapa.id] ?? etapa.titulo;

export function tituloDaEtapa(id: string | null | undefined): string | null {
  return TITULOS_DO_ROTEIRO.find(([etapa]) => etapa === id)?.[1] ?? null;
}

export type MeuRoteiro = {
  papel: "professor" | "aluno";
  classeId: number | null;
  marcadas: ReadonlySet<string>;
};

/** O que `pesquisa_meu_roteiro()` devolve. null = não é avaliador: o app fica como sempre. */
export function lerMeuRoteiro(bruto: unknown): MeuRoteiro | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  if (r.papel !== "professor" && r.papel !== "aluno") return null;
  const marcadas = new Set<string>();
  for (const m of Array.isArray(r.marcas) ? r.marcas : []) {
    const etapa = m && typeof m === "object" ? (m as Record<string, unknown>).etapa : null;
    if (typeof etapa === "string") marcadas.add(etapa);
  }
  return { papel: r.papel, classeId: typeof r.classe_id === "number" ? r.classe_id : null, marcadas };
}

/** O painel só aparece para a conta de aluno de teste de um avaliador. */
export const mostraPainelDoRoteiro = (roteiro: MeuRoteiro | null) => roteiro?.papel === "aluno";

export function andamentoDoRoteiro(marcadas: ReadonlySet<string>) {
  const feitas = TITULOS_DO_ROTEIRO.filter(([id]) => marcadas.has(id)).length;
  const doApp = ETAPAS_DO_ALUNO.filter((e) => marcadas.has(e.id)).length;
  return { feitas, total: TITULOS_DO_ROTEIRO.length, doApp, totalDoApp: ETAPAS_DO_ALUNO.length };
}

/** Primeira etapa do app ainda não marcada; null quando as três foram feitas. */
export function proximaEtapaDoAluno(marcadas: ReadonlySet<string>): EtapaDoAluno | null {
  return ETAPAS_DO_ALUNO.find((e) => !marcadas.has(e.id)) ?? null;
}

export type Anotacao = {
  id: number;
  etapa: string | null;
  plataforma: "console" | "app";
  texto: string;
  criadaEm: string;
};

export function lerAnotacoes(bruto: unknown): Anotacao[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Anotacao[] = [];
  for (const linha of bruto) {
    if (!linha || typeof linha !== "object") continue;
    const r = linha as Record<string, unknown>;
    if (typeof r.id !== "number" || typeof r.texto !== "string") continue;
    if (r.plataforma !== "console" && r.plataforma !== "app") continue;
    saida.push({
      id: r.id,
      etapa: typeof r.etapa === "string" ? r.etapa : null,
      plataforma: r.plataforma,
      texto: r.texto,
      criadaEm: typeof r.criada_em === "string" ? r.criada_em : "",
    });
  }
  return saida;
}

/** Anotações na ordem do roteiro; as sem etapa (ou de etapa desconhecida) por último. */
export function anotacoesPorEtapa(anotacoes: readonly Anotacao[]) {
  const ordem = (a: Anotacao, b: Anotacao) => a.criadaEm.localeCompare(b.criadaEm) || a.id - b.id;
  const grupos: { etapa: string | null; titulo: string; anotacoes: Anotacao[] }[] = [];
  for (const [id, titulo] of TITULOS_DO_ROTEIRO) {
    const delas = anotacoes.filter((a) => a.etapa === id).sort(ordem);
    if (delas.length) grupos.push({ etapa: id, titulo, anotacoes: delas });
  }
  const soltas = anotacoes.filter((a) => !tituloDaEtapa(a.etapa)).sort(ordem);
  if (soltas.length) grupos.push({ etapa: null, titulo: "Sem etapa", anotacoes: soltas });
  return grupos;
}

export function textoDaAnotacao(bruto: string): string | null {
  const texto = bruto.trim();
  return texto ? texto.slice(0, LIMITE_DA_ANOTACAO) : null;
}
