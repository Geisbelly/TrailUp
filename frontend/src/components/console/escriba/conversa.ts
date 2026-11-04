// Lumi (antes Escriba) — a guia do professor (docs/frontend/redesign-fase-2/01-analise-dashboard.md, 4.10).
// Lógica pura do painel: o que mandar para a API e como traduzir as falhas.

import { CONSOLE_SECTIONS, ROTULO_DA_VIEW, consolePathForView, viewSoDoDono, type ConsoleView } from "@/pages/consoleSections";
import { ABAS_DA_ECONOMIA } from "../economia/economiaRegras";

export type Papel = "professor" | "escriba";
export type Destino = { rotulo: string; caminho: string };
export type Mensagem = { id: number; papel: Papel; texto: string; erro?: boolean; destinos?: Destino[] };
export type TurmaDoProfessor = { id: number; descricao: string | null };

export const MENSAGEM_INICIAL = "Olá! Posso te ajudar a entender o desempenho da turma. O que você quer saber?";

export const SUGESTOES = ["Quem precisa de atenção?", "Onde a turma mais erra?"];

export const TODAS = "todas";

/** Até quantas mensagens anteriores voltam para a API como contexto. */
export const HISTORICO_ENVIADO = 8;

export const nomeDaTurma = (t: TurmaDoProfessor) => t.descricao?.trim() || `Turma ${t.id}`;

/**
 * Turma com que o painel abre: a da URL (detalhe do aluno usa ?turma=) se
 * for do professor; senão a única turma; senão todas.
 */
export function turmaInicial(turmas: TurmaDoProfessor[], turmaNaUrl: string | null): string {
  if (turmaNaUrl && turmas.some((t) => String(t.id) === turmaNaUrl)) return turmaNaUrl;
  if (turmas.length === 1) return String(turmas[0].id);
  return TODAS;
}

/** A mensagem de boas-vindas e as de erro não são conversa: não voltam para a API. */
export function historicoParaEnvio(mensagens: Mensagem[]): { papel: Papel; texto: string }[] {
  return mensagens
    .filter((m) => !m.erro && m.id !== 0)
    .slice(-HISTORICO_ENVIADO)
    .map(({ papel, texto }) => ({ papel, texto: texto.slice(0, 2000) }));
}

/**
 * Traduz a falha da chamada para algo que o professor entenda.
 */
export function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  if (/só lê as turmas|403|permiss/i.test(texto)) return "Só consigo ler as suas turmas. Escolha uma delas e pergunte de novo.";
  if (/escriba_indisponivel|não conseguiu responder|nao conseguiu responder/i.test(texto))
    return "O modelo de IA não respondeu agora. Tente de novo em instantes.";
  if (/abort|timeout|tempo|conectar|network|fetch|failed|502|503|504/i.test(texto))
    return "Não consegui falar com o servidor da Lumi (sem resposta ou fora do ar). Tente de novo em alguns segundos; o resto do console continua funcionando.";
  if (/VITE_APITRAIUP_URL/.test(texto)) return "A Lumi não está configurada neste ambiente.";
  return "Algo deu errado ao falar com a Lumi. Tente de novo em instantes.";
}

const MAX_DESTINOS = 3;

/**
 * Converte o destino que a API devolve ("economia", "economia.valores") no
 * botão que leva até lá. A API já filtra pela lista fechada; aqui confere de
 * novo contra as abas de verdade, porque um botão para tela que não existe
 * cairia no NotFound. A turma escolhida no painel vai junto (`?turma=`), e as
 * telas por turma abrem nela.
 */
export function destinoParaLink(destino: string, turma: string): Destino | null {
  const [view, parte, ...resto] = String(destino ?? "").trim().split(".");
  if (resto.length > 0) return null;
  const secao = CONSOLE_SECTIONS.find((s) => s.view === view);
  if (!secao || viewSoDoDono(secao.view)) return null;
  const params = new URLSearchParams();
  if (turma !== TODAS && /^\d+$/.test(turma)) params.set("turma", turma);
  let rotulo = ROTULO_DA_VIEW[secao.view as ConsoleView];
  if (parte !== undefined) {
    const aba = secao.view === "economia" ? ABAS_DA_ECONOMIA.find((a) => a.id === parte) : undefined;
    if (!aba) return null;
    params.set("aba", aba.id);
    rotulo = `${rotulo} › ${aba.rotulo}`;
  }
  const busca = params.toString();
  return { rotulo, caminho: `${consolePathForView(secao.view)}${busca ? `?${busca}` : ""}` };
}

export function destinosParaLinks(destinos: unknown, turma: string): Destino[] {
  if (!Array.isArray(destinos)) return [];
  const links: Destino[] = [];
  for (const d of destinos) {
    const link = typeof d === "string" ? destinoParaLink(d, turma) : null;
    if (link && !links.some((l) => l.caminho === link.caminho)) links.push(link);
  }
  return links.slice(0, MAX_DESTINOS);
}
