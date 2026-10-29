// Lumi (antes Escriba) — a guia do professor (docs/frontend/redesign-fase-2/01-analise-dashboard.md, 4.10).
// Lógica pura do painel: o que mandar para a API e como traduzir as falhas.

export type Papel = "professor" | "escriba";
export type Mensagem = { id: number; papel: Papel; texto: string; erro?: boolean };
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
 * Traduz a falha da chamada para algo que o professor entenda. A API roda num
 * plano que hiberna: a primeira pergunta depois de um tempo parado costuma
 * cair por tempo esgotado ou conexão recusada.
 */
export function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  if (/só lê as turmas|403|permiss/i.test(texto)) return "Só consigo ler as suas turmas. Escolha uma delas e pergunte de novo.";
  if (/escriba_indisponivel|não conseguiu responder|nao conseguiu responder/i.test(texto))
    return "Não consegui formular uma resposta agora. Tente de novo em instantes.";
  if (/abort|timeout|tempo|conectar|network|fetch|failed|502|503|504/i.test(texto))
    return "A Lumi está acordando — o servidor da IA dorme quando fica parado. Tente de novo em alguns segundos; o resto do console continua funcionando.";
  if (/VITE_APITRAIUP_URL/.test(texto)) return "A Lumi não está configurada neste ambiente.";
  return "Algo deu errado ao falar com a Lumi. Tente de novo em instantes.";
}
