// CSV da turma (#146): exportar notas/XP e importar a lista de alunos. Funções puras; o download e a
// leitura do arquivo ficam na tela. Quem calcula as notas é o banco (`professor_notas_da_turma`).

import { normalizar, type AlunoCandidato } from "./matriculas";

const SEPARADOR = ";"; // o Excel em português abre `;` em colunas; `,` é a vírgula decimal
const BOM = "\uFEFF"; // sem ele o Excel lê o UTF-8 como Latin-1 e estraga os acentos

function campo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "number" ? String(valor).replace(".", ",") : valor;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV pronto para baixar: BOM, `;`, decimal com vírgula, CRLF. */
export function gerarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  return BOM + [cabecalho, ...linhas].map((l) => l.map(campo).join(SEPARADOR)).join("\r\n") + "\r\n";
}

export type NotaDoAluno = {
  nome: string;
  email: string | null;
  xp: number;
  nota_media: number | null;
  /** Com o peso do XP da turma (#143). Igual à nota média quando o peso é 0. */
  nota_final: number | null;
  progresso_pct: number | null;
  atividades_avaliadas: number;
  pontos_obtidos: number | null;
  pontos_maximos: number | null;
};

const arredondar = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** Uma linha por aluno, com as colunas do arquivo de notas. */
export function csvDasNotas(linhas: NotaDoAluno[]): string {
  return gerarCsv(
    ["Aluno", "E-mail", "XP", "Nota média", "Nota final", "Progresso (%)", "Atividades avaliadas", "Pontos obtidos", "Pontos possíveis"],
    linhas.map((l) => [
      l.nome,
      l.email,
      arredondar(l.xp),
      arredondar(l.nota_media),
      arredondar(l.nota_final),
      arredondar(l.progresso_pct),
      l.atividades_avaliadas,
      arredondar(l.pontos_obtidos),
      arredondar(l.pontos_maximos),
    ]),
  );
}

export function lerNotas(dados: unknown): NotaDoAluno[] | null {
  if (!Array.isArray(dados)) return null;
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return dados
    .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object")
    .map((d) => ({
      nome: String(d.nome ?? "Aluno"),
      email: typeof d.email === "string" ? d.email : null,
      xp: num(d.xp) ?? 0,
      nota_media: num(d.nota_media),
      // Antes da migration 20261102_13 a função não devolve a coluna: a nota final é a nota média.
      nota_final: "nota_final" in d ? num(d.nota_final) : num(d.nota_media),
      progresso_pct: num(d.progresso_pct),
      atividades_avaliadas: num(d.atividades_avaliadas) ?? 0,
      pontos_obtidos: num(d.pontos_obtidos),
      pontos_maximos: num(d.pontos_maximos),
    }));
}

export function nomeDoArquivo(turma: string, hoje: Date): string {
  const base = normalizar(turma).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "turma";
  return `notas-${base}-${hoje.toISOString().slice(0, 10)}.csv`;
}

// ---------------------------------------------------------------- importar

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export type ListaLida = { emails: string[]; invalidas: number[] };

/**
 * E-mails de um CSV (`,`, `;` ou tab). Com cabeçalho que tenha "email"/"e-mail", usa essa coluna;
 * sem cabeçalho, a primeira célula com "@" de cada linha. Repetidos contam uma vez; linha que não
 * tem e-mail válido vai para `invalidas` (número da linha, a partir de 1).
 */
export function lerEmailsDoCsv(texto: string): ListaLida {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/);
  const celulas = (l: string) => l.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, "").trim());
  const primeira = celulas(linhas[0] ?? "").map((c) => normalizar(c).replace(/[^a-z]/g, ""));
  const coluna = primeira.findIndex((c) => c === "email");
  const inicio = coluna >= 0 ? 1 : 0;

  const vistos = new Set<string>();
  const emails: string[] = [];
  const invalidas: number[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    if (!linhas[i].trim()) continue;
    const cs = celulas(linhas[i]);
    const bruto = coluna >= 0 ? cs[coluna] : cs.find((c) => c.includes("@"));
    const email = (bruto ?? "").toLowerCase();
    if (!EMAIL.test(email)) {
      invalidas.push(i + 1);
      continue;
    }
    if (!vistos.has(email)) {
      vistos.add(email);
      emails.push(email);
    }
  }
  return { emails, invalidas };
}

const EMAIL_NO_TEXTO = /[^\s@;,<>"'()]+@[^\s@;,<>"'()]+\.[^\s@;,<>"'()]+/g;

export type ListaColada = { emails: string[]; ignorados: string[] };

/**
 * E-mails de um texto colado: da planilha, de uma lista separada por vírgula ou do campo "Para" de um
 * e-mail ("Ana Lima <ana@x.com>"). Trecho sem e-mail vai para `ignorados`, para a tela mostrar o que não
 * foi aproveitado em vez de sumir com ele. Repetidos contam uma vez.
 */
export function lerEmailsColados(texto: string): ListaColada {
  const vistos = new Set<string>();
  const emails: string[] = [];
  const ignorados: string[] = [];
  for (const trecho of texto.replace(/^\uFEFF/, "").split(/[\r\n,;\t]+/)) {
    const limpo = trecho.trim();
    if (!limpo) continue;
    const achados = limpo.match(EMAIL_NO_TEXTO);
    if (!achados) {
      ignorados.push(limpo);
      continue;
    }
    for (const bruto of achados) {
      const email = bruto.toLowerCase();
      if (!vistos.has(email)) {
        vistos.add(email);
        emails.push(email);
      }
    }
  }
  return { emails, ignorados };
}

/** Arquivo de exemplo para quem prefere preencher uma planilha. */
export const modeloDaLista = (): string => gerarCsv(["email"], [["aluno.um@exemplo.com"], ["aluno.dois@exemplo.com"]]);

export type PlanoDeImportacao = {
  matricular: AlunoCandidato[];
  jaMatriculados: string[];
  naoEncontrados: string[];
};

/**
 * Quem da lista entra na turma. Só alunos já ligados ao professor (os mesmos que a busca da tela de
 * matrícula mostra): quem não tem conta ou não tem vínculo vai para `naoEncontrados`, sem criar nada.
 */
export function planejarImportacao(
  emails: string[],
  candidatos: AlunoCandidato[],
  matriculados: Set<string>,
): PlanoDeImportacao {
  const porEmail = new Map(candidatos.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
  const plano: PlanoDeImportacao = { matricular: [], jaMatriculados: [], naoEncontrados: [] };
  for (const email of emails) {
    const aluno = porEmail.get(email);
    if (!aluno) plano.naoEncontrados.push(email);
    else if (matriculados.has(aluno.id)) plano.jaMatriculados.push(email);
    else plano.matricular.push(aluno);
  }
  return plano;
}
