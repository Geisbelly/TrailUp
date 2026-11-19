/**
 * Desafio de lógica e cruzadinha como missão, no aparelho: os tipos, a leitura do que o banco
 * entrega e o núcleo da cruzadinha (qual palavra a casa tocada escolhe, para onde o cursor anda,
 * o que vai à RPC). Spec `2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "App".
 *
 * Sem Supabase de propósito, para rodar no `node --test`. A leitura fica em `missoesDoDia.ts`
 * (`carregarDesafiosDoTopico`) e em `desafios.ts`, e o "Conferir" em `desafios.ts`.
 *
 * Quem corrige é o banco (`missao_desafio_responder`, `20261117_04`). O app não tem e não pede a
 * resposta: `missoes.desafio` é remontado sem ela pela RPC de criação, e um CHECK a barra.
 */
import { montarMissoes, type LinhaMissao, type LinhaProgresso, type MissaoDoAluno } from "./missaoModel";

// ------------------------------------------------------------------------------------- tipos
// O que o aluno lê em `missoes.desafio`. Mesmos nomes de `DesafioPublico` do console
// (frontend/supabase/functions/generate-content-ai/desafios.ts) e do que a RPC de criação grava:
// lógica em `20261117_03_missao_desafio_criar.py:376-379`, cruzadinha em `:456-458` e `:467-468`.

export type PalavraNaGrade = {
  numero: number;
  direcao: "h" | "v";
  /** Linha e coluna contadas de 0, como o banco grava. */
  linha: number;
  coluna: number;
  tamanho: number;
  pista: string;
};

export type DesafioLogicaPublico =
  | { tipo: "logica"; enunciado: string; formato: "multipla"; alternativas: string[] }
  | { tipo: "logica"; enunciado: string; formato: "curta" };

export type DesafioCruzadinhaPublico = {
  tipo: "cruzadinha";
  linhas: number;
  colunas: number;
  palavras: PalavraNaGrade[];
};

export type DesafioPublico = DesafioLogicaPublico | DesafioCruzadinhaPublico;

/**
 * O `p_resposta` de `missao_desafio_responder` (`20261117_04_missao_desafio_responder.py:13-15`):
 * na lógica, o texto (na múltipla, o da alternativa); na cruzadinha, uma palavra por chave
 * `<numero><h|v>`, a mesma do gabarito (`20261117_03:425`).
 */
export type RespostaDoAluno = { resposta: string } | { palavras: Record<string, string> };

/**
 * O retorno da RPC (`20261117_04:430-431`), com os nomes dela. `palavras_*` são `null` na lógica.
 * Ou o erro, já traduzido para o que a tela diz: `limite` (mais de 20 tentativas na hora), `rede`
 * (a resposta continua no aparelho) e `outro` (sem acesso, tópico oculto, turma retida...).
 */
export type ResultadoDoDesafio =
  | { acertou: boolean; ja_concluida: boolean; palavras_certas: number | null; palavras_total: number | null }
  | { erro: "limite" | "rede" | "indisponivel" | "outro" };

/** A missão-desafio como o app a mostra: a missão comum, mais o quebra-cabeça e o grupo. */
export type MissaoComDesafio = MissaoDoAluno & {
  desafio: DesafioPublico;
  /** `missoes.desafio_grupo`: o mesmo quebra-cabeça nas linhas de cada perfil. */
  desafioGrupo: string;
  conteudoId: number;
};

// --------------------------------------------------------------------------------- leitura

function objeto(bruto: unknown): Record<string, unknown> | null {
  return bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function inteiro(v: unknown, minimo: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= minimo ? v : null;
}

function lerPalavra(bruto: unknown, linhas: number, colunas: number): PalavraNaGrade | null {
  const p = objeto(bruto);
  if (!p) return null;
  const numero = inteiro(p.numero, 1);
  const direcao = p.direcao === "h" || p.direcao === "v" ? p.direcao : null;
  const linha = inteiro(p.linha, 0);
  const coluna = inteiro(p.coluna, 0);
  const tamanho = inteiro(p.tamanho, 2);
  const pista = texto(p.pista);
  if (numero === null || direcao === null || linha === null || coluna === null || tamanho === null || pista === null) {
    return null;
  }
  // A RPC já recusa palavra fora da grade (`20261117_03:429-432`); aqui é para a tela nunca
  // desenhar casa fora dela.
  const cabe = direcao === "h" ? linha < linhas && coluna + tamanho <= colunas : coluna < colunas && linha + tamanho <= linhas;
  return cabe ? { numero, direcao, linha, coluna, tamanho, pista } : null;
}

/**
 * `missoes.desafio` como o app sabe desenhar, remontado campo a campo, ou `null`.
 *
 * Campo a mais não passa, como na RPC de criação. Forma que o app não conhece (tipo novo, banco à
 * frente do app) é `null`, e a missão fica fora da lista em vez de abrir uma tela quebrada.
 */
export function lerDesafioPublico(bruto: unknown): DesafioPublico | null {
  const d = objeto(bruto);
  if (!d) return null;
  if (d.tipo === "logica") {
    const enunciado = texto(d.enunciado);
    if (!enunciado) return null;
    if (d.formato === "curta") return { tipo: "logica", enunciado, formato: "curta" };
    if (d.formato !== "multipla" || !Array.isArray(d.alternativas)) return null;
    const alternativas = d.alternativas.map(texto);
    if (alternativas.length < 2 || alternativas.some((a) => a === null)) return null;
    return { tipo: "logica", enunciado, formato: "multipla", alternativas: alternativas as string[] };
  }
  if (d.tipo === "cruzadinha") {
    const linhas = inteiro(d.linhas, 2);
    const colunas = inteiro(d.colunas, 2);
    if (linhas === null || colunas === null || !Array.isArray(d.palavras) || d.palavras.length === 0) return null;
    const palavras = d.palavras.map((p) => lerPalavra(p, linhas, colunas));
    if (palavras.some((p) => p === null)) return null;
    return { tipo: "cruzadinha", linhas, colunas, palavras: palavras as PalavraNaGrade[] };
  }
  return null;
}

function inteiroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** O retorno da RPC, só com os quatro campos dela. O que não tiver `acertou` é `outro`. */
export function lerResultadoDoDesafio(bruto: unknown): ResultadoDoDesafio {
  const r = objeto(bruto);
  if (!r || typeof r.acertou !== "boolean") return { erro: "outro" };
  return {
    acertou: r.acertou,
    ja_concluida: r.ja_concluida === true,
    palavras_certas: inteiroOuNulo(r.palavras_certas),
    palavras_total: inteiroOuNulo(r.palavras_total),
  };
}

// ------------------------------------------------------------------------- lista de missões

/** Uma linha de `missoes` com as colunas do desafio (`20261117_02:166-170`). */
export type LinhaDeDesafio = LinhaMissao & {
  desafio: unknown;
  conteudo_id: number | null;
  desafio_grupo: string | null;
};

/**
 * Uma missão por quebra-cabeça (`desafio_grupo`).
 *
 * O grupo tem uma linha por perfil-alvo, e o aluno com dois perfis representativos vê as duas
 * (a policy não filtra perfil). Vale a linha já resolvida, se houver: o "já resolvido" da RPC é
 * pelo grupo. Senão a do perfil que vem primeiro em `perfis` (os representativos, o dominante
 * primeiro), e no empate o menor id, para a escolha não mudar entre duas leituras.
 *
 * O perfil não é filtrado aqui: a consulta já veio com `.in('perfil_alvo', perfis)`. A janela sim,
 * pela mesma regra das outras missões (`montarMissoes`).
 */
export function montarDesafios(
  linhas: readonly LinhaDeDesafio[],
  progresso: readonly LinhaProgresso[],
  perfis: readonly string[],
  agora: Date = new Date(),
): MissaoComDesafio[] {
  const extras = new Map<number, { desafio: DesafioPublico; grupo: string; conteudoId: number; perfil: string }>();
  for (const l of linhas) {
    const desafio = lerDesafioPublico(l.desafio);
    // `Number(null)` é 0: confere o nulo antes de converter.
    const conteudoId = l.conteudo_id == null ? NaN : Number(l.conteudo_id);
    if (!desafio || !l.desafio_grupo || !Number.isInteger(conteudoId) || conteudoId <= 0) continue;
    extras.set(Number(l.id), { desafio, grupo: l.desafio_grupo, conteudoId, perfil: (l.perfil_alvo ?? "").toLowerCase() });
  }

  const validas = linhas.filter((l) => extras.has(Number(l.id)));
  const posicao = (perfil: string) => {
    const i = perfis.indexOf(perfil);
    return i < 0 ? perfis.length : i;
  };
  const porGrupo = new Map<string, MissaoComDesafio>();
  for (const m of montarMissoes([...validas], [...progresso], { agora })) {
    const e = extras.get(m.id)!;
    const candidata: MissaoComDesafio = { ...m, desafio: e.desafio, desafioGrupo: e.grupo, conteudoId: e.conteudoId };
    const atual = porGrupo.get(e.grupo);
    if (!atual) {
      porGrupo.set(e.grupo, candidata);
      continue;
    }
    const resolvida = (x: MissaoComDesafio) => (x.status === "concluida" ? 0 : 1);
    const chave = (x: MissaoComDesafio) => [resolvida(x), posicao(extras.get(x.id)!.perfil), x.id];
    const [a, b] = [chave(candidata), chave(atual)];
    const melhor = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    if (melhor < 0) porGrupo.set(e.grupo, candidata);
  }
  return [...porGrupo.values()];
}

/**
 * As missões comuns e, depois delas, os desafios.
 *
 * Os dois vêm de consultas separadas: as comuns com o limite delas (`LIMITE_DE_MISSOES`) e
 * `desafio IS NULL`, e os desafios com o limite próprio. Assim o desafio nunca tira missão comum da
 * lista. Um id que já veio entre as comuns (banco anterior ao filtro) não entra de novo.
 */
export function juntarComDesafios<T extends MissaoDoAluno>(comuns: readonly T[], desafios: readonly T[]): T[] {
  const ids = new Set(comuns.map((m) => m.id));
  return [...comuns, ...desafios.filter((d) => !ids.has(d.id))];
}

// ------------------------------------------------------------------------------- cruzadinha

export type Celula = { linha: number; coluna: number };

/** O que o aluno escreveu, por casa (`"linha,coluna"` → uma letra). É o que o rascunho guarda. */
export type Preenchimento = Readonly<Record<string, string>>;

/** A chave da casa, a mesma de `montarCruzadinha` no console. */
export const chaveDaCelula = (linha: number, coluna: number) => `${linha},${coluna}`;

/** A chave da palavra na resposta e no gabarito: `<numero><h|v>` (`20261117_03:425`). */
export const chaveDaPalavra = (p: Pick<PalavraNaGrade, "numero" | "direcao">) => `${p.numero}${p.direcao}`;

/** As casas da palavra, do começo ao fim. */
export function celulasDaPalavra(p: PalavraNaGrade): Celula[] {
  return Array.from({ length: p.tamanho }, (_, i) =>
    p.direcao === "h" ? { linha: p.linha, coluna: p.coluna + i } : { linha: p.linha + i, coluna: p.coluna },
  );
}

function contem(p: PalavraNaGrade, linha: number, coluna: number): boolean {
  return p.direcao === "h"
    ? linha === p.linha && coluna >= p.coluna && coluna < p.coluna + p.tamanho
    : coluna === p.coluna && linha >= p.linha && linha < p.linha + p.tamanho;
}

const mesma = (a: PalavraNaGrade, b: PalavraNaGrade) => a.numero === b.numero && a.direcao === b.direcao;

function letra(preenchimento: Preenchimento, c: Celula): string {
  return (preenchimento[chaveDaCelula(c.linha, c.coluna)] ?? "").trim();
}

/**
 * A palavra que o toque numa casa seleciona.
 *
 * - Toque na casa onde já está o cursor: troca para a palavra da outra direção, se a casa for um
 *   cruzamento ("o segundo toque troca para a vertical").
 * - Toque noutra casa da palavra selecionada: continua nela, só o cursor anda. Corrigir uma letra
 *   num cruzamento não pode trocar de palavra.
 * - Toque fora dela: a horizontal, se a casa tiver uma; senão a vertical.
 *
 * Casa vazia da grade (sem palavra) é `null`.
 */
export function palavraDaCelula(
  desafio: DesafioCruzadinhaPublico,
  linha: number,
  coluna: number,
  selecao: { palavra: PalavraNaGrade; linha: number; coluna: number } | null,
): PalavraNaGrade | null {
  const aqui = desafio.palavras.filter((p) => contem(p, linha, coluna));
  if (!aqui.length) return null;
  const horizontalPrimeiro = [...aqui].sort((a, b) => (a.direcao === b.direcao ? 0 : a.direcao === "h" ? -1 : 1));
  if (!selecao || !contem(selecao.palavra, linha, coluna)) return horizontalPrimeiro[0];
  if (selecao.linha !== linha || selecao.coluna !== coluna) return selecao.palavra;
  return aqui.find((p) => !mesma(p, selecao.palavra)) ?? selecao.palavra;
}

/**
 * Para onde o cursor vai depois de escrever em `atual`: a próxima casa vazia da palavra. Pula as
 * preenchidas e, sem vazia adiante, para na última casa — nunca pula para outra palavra.
 */
export function proximaCelula(palavra: PalavraNaGrade, preenchimento: Preenchimento, atual: Celula): Celula {
  const casas = celulasDaPalavra(palavra);
  const i = casas.findIndex((c) => c.linha === atual.linha && c.coluna === atual.coluna);
  const vazia = casas.slice(i + 1).find((c) => letra(preenchimento, c) === "");
  return vazia ?? casas[casas.length - 1];
}

/**
 * O `p_resposta` da cruzadinha: cada palavra lida das casas, na ordem. Casa vazia não vira letra,
 * e a palavra incompleta vai assim mesmo: a RPC a conta como errada, e só diz quantas estão certas.
 */
export function respostaDaGrade(desafio: DesafioCruzadinhaPublico, preenchimento: Preenchimento): { palavras: Record<string, string> } {
  const palavras: Record<string, string> = {};
  for (const p of desafio.palavras) {
    palavras[chaveDaPalavra(p)] = celulasDaPalavra(p)
      .map((c) => letra(preenchimento, c))
      .join("");
  }
  return { palavras };
}

/** Toda casa de toda palavra tem letra. Grade sem palavra nenhuma não está completa. */
export function estaCompleta(desafio: DesafioCruzadinhaPublico, preenchimento: Preenchimento): boolean {
  return (
    desafio.palavras.length > 0 &&
    desafio.palavras.every((p) => celulasDaPalavra(p).every((c) => letra(preenchimento, c) !== ""))
  );
}

/** A casa antes de `atual` na palavra (o apagar volta uma), parando na primeira. */
export function celulaAnterior(palavra: PalavraNaGrade, atual: Celula): Celula {
  const casas = celulasDaPalavra(palavra);
  const i = casas.findIndex((c) => c.linha === atual.linha && c.coluna === atual.coluna);
  return casas[Math.max(0, i - 1)];
}

/**
 * O que fica na casa depois de digitar: a última letra ou algarismo do campo, em maiúscula.
 *
 * O campo da casa recebe o que já estava e a tecla nova ("Bc"), e vale a nova. O acento fica como
 * veio: a grade é sem acento, mas a RPC normaliza a resposta antes de comparar.
 */
export function letraDigitada(texto: string): string {
  const letras = Array.from(texto).filter((ch) => /[\p{L}\p{N}]/u.test(ch));
  return letras.length ? letras[letras.length - 1].toLocaleUpperCase("pt-BR") : "";
}

export type CasaDaGrade = {
  /** O número desenhado no canto da casa: o da palavra que começa nela, ou `null`. */
  numero: number | null;
  /** As palavras que passam pela casa, horizontal primeiro. */
  palavras: PalavraNaGrade[];
};

/** As casas que fazem parte de alguma palavra, por `chaveDaCelula`. A grade desenha só estas. */
export function casasDaGrade(desafio: DesafioCruzadinhaPublico): Map<string, CasaDaGrade> {
  const casas = new Map<string, CasaDaGrade>();
  const ordenadas = [...desafio.palavras].sort((a, b) => (a.direcao === b.direcao ? 0 : a.direcao === "h" ? -1 : 1));
  for (const p of ordenadas) {
    celulasDaPalavra(p).forEach((c, i) => {
      const chave = chaveDaCelula(c.linha, c.coluna);
      const casa = casas.get(chave) ?? { numero: null, palavras: [] };
      casa.palavras.push(p);
      if (i === 0) casa.numero = casa.numero === null ? p.numero : Math.min(casa.numero, p.numero);
      casas.set(chave, casa);
    });
  }
  return casas;
}

const NOME_DA_DIRECAO = { h: "horizontal", v: "vertical" } as const;

/**
 * O que o leitor de tela diz da casa: "linha 2, coluna 3, palavra 4 horizontal". Linha e coluna
 * contadas de 1, como o aluno conta; num cruzamento, as duas palavras.
 */
export function rotuloDaCelula(desafio: DesafioCruzadinhaPublico, linha: number, coluna: number): string {
  const palavras = casasDaGrade(desafio).get(chaveDaCelula(linha, coluna))?.palavras ?? [];
  const deQuem = palavras.map((p) => `palavra ${p.numero} ${NOME_DA_DIRECAO[p.direcao]}`).join(" e ");
  return [`linha ${linha + 1}`, `coluna ${coluna + 1}`, deQuem].filter(Boolean).join(", ");
}

// ------------------------------------------------------------------------------- "Conferir"

export type RetornoDoConferir = {
  /** A tela passa a só leitura. */
  resolvido: boolean;
  /** Mostra o prêmio: só no primeiro acerto, que é o que o banco paga. */
  premio: boolean;
  texto: string;
  /** Na cruzadinha errada, quantas palavras estão certas (nunca quais). */
  detalhe: string | null;
  /**
   * O banco recusou o acesso ao desafio (`42501`): tópico oculto, turma retida, perfil de fora.
   * Tentar de novo não muda nada, então o "Conferir" fica desligado.
   */
  indisponivel: boolean;
};

const TEXTO_DO_ERRO = {
  limite: "Muitas tentativas seguidas. Tente de novo daqui a pouco.",
  rede: "Sem conexão. Sua resposta continua aqui.",
  indisponivel: "Este desafio não está mais disponível para você.",
  outro: "Não deu para conferir agora. Tente de novo.",
} as const;

/**
 * O que a tela diz depois do "Conferir". `ja_concluida` é o banco dizendo que o grupo já foi
 * resolvido antes (por esta linha ou pela de outro perfil): só leitura, e sem prêmio, que não é
 * pago de novo.
 */
export function retornoDoConferir(r: ResultadoDoDesafio): RetornoDoConferir {
  if ("erro" in r) {
    return { resolvido: false, premio: false, texto: TEXTO_DO_ERRO[r.erro], detalhe: null, indisponivel: r.erro === "indisponivel" };
  }
  if (r.ja_concluida || r.acertou) {
    return { resolvido: true, premio: r.acertou && !r.ja_concluida, texto: "Desafio resolvido", detalhe: null, indisponivel: false };
  }
  const detalhe =
    r.palavras_total != null && r.palavras_certas != null ? `${r.palavras_certas} de ${r.palavras_total} palavras certas` : null;
  return { resolvido: false, premio: false, texto: "Ainda não. Tente de novo.", detalhe, indisponivel: false };
}
