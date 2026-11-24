// Roteiro da avaliação, etapa por etapa, para o painel lateral do avaliador (console e app).
//
// É a ordem do vídeo "Passo a passo da pesquisa": ver o vídeo, as seis tarefas no console, entrar no
// app como aluno de teste, as duas tarefas do aluno e, por fim, os blocos de perguntas. As tarefas
// vêm de `TAREFAS` (a mesma fonte da cartilha e do formulário), então o texto não se repete aqui.
//
// Quem marca a etapa como feita é o avaliador. Nada detecta sozinho que ele fez a tarefa: a cartilha
// promete que a pesquisa só confere, na turma de demonstração, o que a tarefa pedia (migration
// `20261123_03`). A única marca automática é "blocos", quando o formulário nativo da aba Avaliar o
// TrailUp é enviado: é o avaliador agindo na própria tela da avaliação (`marcarAvaliacaoEnviada`).
//
// O app do aluno tem a sua cópia das etapas do aluno (`mobile/src/services/pesquisa/roteiro.ts`); o
// teste compara as duas.

import type { ConsoleView } from "@/pages/consoleSections";
import { TAREFAS, type Tarefa } from "./pesquisaProfessores";

export type OndeEAEtapa = "site" | "console" | "app";

export type EtapaDoRoteiro = {
  /** Gravado no banco: minúsculo, sem espaço (`^[a-z0-9-]{1,40}$`). */
  id: string;
  titulo: string;
  onde: OndeEAEtapa;
  passos: readonly string[];
  /** O que reparar, quando a etapa é uma tarefa. */
  observar?: string;
  /** Rótulo da tarefa (T1…T8), quando é uma. */
  tarefa?: Tarefa["id"];
  /** Abas do console em que a etapa acontece. A primeira é para onde o botão "Ir" leva. */
  views?: readonly ConsoleView[];
};

export const SLUG_DO_VIDEO_DO_ROTEIRO = "passo-a-passo";

/** Abas de cada tarefa do console, na ordem do menu que a tarefa cita. */
const VIEWS_DA_TAREFA: Partial<Record<Tarefa["id"], readonly ConsoleView[]>> = {
  T1: ["classes"],
  T2: ["trilha"],
  T3: ["personalizacoes"],
  T4: ["dashboard"],
  T5: ["economia", "missoes", "eventos", "conquistas"],
  T6: ["ranks", "batalhas", "guildas"],
};

const daTarefa = (tarefa: Tarefa): EtapaDoRoteiro => ({
  id: tarefa.id.toLowerCase(),
  titulo: tarefa.titulo,
  onde: tarefa.onde === "aluno" ? "app" : "console",
  passos: tarefa.passos,
  observar: tarefa.observar,
  tarefa: tarefa.id,
  views: VIEWS_DA_TAREFA[tarefa.id],
});

const doConsole = TAREFAS.filter(t => t.onde === "console").map(daTarefa);
const doAluno = TAREFAS.filter(t => t.onde === "aluno").map(daTarefa);

export const ETAPAS_DO_ROTEIRO: readonly EtapaDoRoteiro[] = [
  {
    id: "video",
    titulo: "Ver o passo a passo em vídeo",
    onde: "site",
    passos: ["São uns quatro minutos e meio: as três fases da pesquisa, as oito tarefas e o que vem depois delas."],
  },
  ...doConsole,
  {
    id: "aluno-acesso",
    titulo: "Entrar no app como aluno",
    onde: "app",
    passos: [
      "Instale o app do TrailUp (página Download do site) e entre com o acesso de aluno de teste que chegou por e-mail.",
      "Faça o cadastro do aluno até o fim. A matrícula na sua turma de demonstração acontece sozinha.",
    ],
  },
  ...doAluno,
  {
    id: "blocos",
    titulo: "Responder aos blocos e enviar",
    onde: "console",
    passos: [
      "Depois das tarefas vêm os blocos de perguntas e as quatro perguntas abertas, na aba Avaliar o TrailUp.",
      "Releia as suas anotações antes. A forma de divulgação é a última pergunta.",
    ],
    views: ["avaliacao"],
  },
];

/** Lembrete que acompanha cada tarefa: as quatro perguntas vêm logo depois dela. */
export const depoisDaTarefa = (tarefa: Tarefa["id"]) =>
  `Terminou? Responda às quatro perguntas da ${tarefa} na aba Avaliar o TrailUp.`;

export function etapaPorId(id: string | null | undefined): EtapaDoRoteiro | null {
  return ETAPAS_DO_ROTEIRO.find(e => e.id === id) ?? null;
}

/** A etapa que acontece na aba aberta do console, se houver uma. */
export function etapaDaView(view: ConsoleView): EtapaDoRoteiro | null {
  return ETAPAS_DO_ROTEIRO.find(e => e.views?.includes(view)) ?? null;
}

/** Primeira etapa ainda não marcada, na ordem do roteiro. null quando tudo foi marcado. */
export function proximaEtapa(marcadas: ReadonlySet<string>, etapas = ETAPAS_DO_ROTEIRO): EtapaDoRoteiro | null {
  return etapas.find(e => !marcadas.has(e.id)) ?? null;
}

export function andamentoDoRoteiro(marcadas: ReadonlySet<string>, etapas = ETAPAS_DO_ROTEIRO) {
  const feitas = etapas.filter(e => marcadas.has(e.id)).length;
  return { feitas, total: etapas.length, porcento: etapas.length ? Math.round((feitas / etapas.length) * 100) : 0 };
}

export const ONDE_E_A_ETAPA: Record<OndeEAEtapa, string> = {
  site: "No site",
  console: "No console",
  app: "No app",
};

// ---------------------------------------------------------------------------------------------
// O que vem do banco

export type PapelNoRoteiro = "professor" | "aluno";

export type MeuRoteiro = {
  papel: PapelNoRoteiro;
  classeId: number | null;
  marcadas: ReadonlySet<string>;
};

/** O que `pesquisa_meu_roteiro()` devolve. null = não é avaliador (a tela fica como sempre). */
export function lerMeuRoteiro(bruto: unknown): MeuRoteiro | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  if (r.papel !== "professor" && r.papel !== "aluno") return null;
  const marcas = Array.isArray(r.marcas) ? r.marcas : [];
  const marcadas = new Set<string>();
  for (const m of marcas) {
    const etapa = m && typeof m === "object" ? (m as Record<string, unknown>).etapa : null;
    if (typeof etapa === "string") marcadas.add(etapa);
  }
  return { papel: r.papel, classeId: typeof r.classe_id === "number" ? r.classe_id : null, marcadas };
}

export type PlataformaDaAnotacao = "console" | "app";

export type Anotacao = {
  id: number;
  etapa: string | null;
  plataforma: PlataformaDaAnotacao;
  texto: string;
  criadaEm: string;
  atualizadaEm: string;
};

export const LIMITE_DA_ANOTACAO = 2000;

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
      atualizadaEm: typeof r.atualizada_em === "string" ? r.atualizada_em : "",
    });
  }
  return saida;
}

/**
 * Anotações agrupadas pela ordem do roteiro; as sem etapa ficam por último. Dentro de cada grupo, a
 * mais antiga primeiro (é a ordem em que aconteceram).
 */
export function anotacoesPorEtapa(anotacoes: readonly Anotacao[], etapas = ETAPAS_DO_ROTEIRO) {
  const grupos: { etapa: EtapaDoRoteiro | null; anotacoes: Anotacao[] }[] = [];
  const ordem = (a: Anotacao, b: Anotacao) => a.criadaEm.localeCompare(b.criadaEm) || a.id - b.id;
  for (const etapa of etapas) {
    const delas = anotacoes.filter(a => a.etapa === etapa.id).sort(ordem);
    if (delas.length) grupos.push({ etapa, anotacoes: delas });
  }
  const conhecidas = new Set(etapas.map(e => e.id));
  const soltas = anotacoes.filter(a => !a.etapa || !conhecidas.has(a.etapa)).sort(ordem);
  if (soltas.length) grupos.push({ etapa: null, anotacoes: soltas });
  return grupos;
}

/** Texto limpo para gravar, ou null se não há o que gravar. */
export function textoDaAnotacao(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto) return null;
  return texto.slice(0, LIMITE_DA_ANOTACAO);
}

/** As anotações em texto corrido, para colar numa pergunta aberta do formulário. */
export function anotacoesEmTexto(anotacoes: readonly Anotacao[], etapas = ETAPAS_DO_ROTEIRO): string {
  return anotacoesPorEtapa(anotacoes, etapas)
    .map(({ etapa, anotacoes: delas }) => {
      const titulo = etapa ? `${etapa.tarefa ? `${etapa.tarefa}. ` : ""}${etapa.titulo}` : "Outras";
      return [titulo, ...delas.map(a => `- ${a.texto}`)].join("\n");
    })
    .join("\n\n");
}
