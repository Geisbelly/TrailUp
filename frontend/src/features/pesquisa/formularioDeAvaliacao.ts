// Formulário de avaliação desenhado no console, no lugar do Google Forms num iframe.
//
// As perguntas vêm de formularioDeAvaliacao.gerado.ts, extraído do formulário publicado
// (scripts/pesquisa-avaliacao/extrair-formulario.mjs), e as respostas vão para o mesmo
// `formResponse`. A planilha, a análise e o texto do termo continuam iguais: o Google segue sendo o
// lugar das respostas, como o termo promete. Nada disto grava no banco do TrailUp.
//
// Se o formulário for recriado, os `entry.*` mudam. Sem o hash do id dele no espelho, a aba volta
// sozinha para o iframe do Google em vez de mandar respostas para o vazio.
//
// O id do formulário não entra no bundle, que é público: o link sai do banco
// (`pesquisa_meu_acesso()`) só para o avaliador aprovado. O espelho guarda o SHA-256 do id.

import { ESPELHO_DA_AVALIACAO } from "./formularioDeAvaliacao.gerado";

type Base = { titulo: string; ajuda: string };

export type ItemDaAvaliacao =
  | (Base & { tipo: "aviso" })
  | (Base & { tipo: "texto"; entry: string; email: boolean })
  | (Base & { tipo: "paragrafo"; entry: string })
  | (Base & { tipo: "escolha" | "caixas"; entry: string; opcoes: string[] })
  | (Base & { tipo: "escala"; entry: string; valores: string[]; rotulos: [string, string] })
  | (Base & { tipo: "grade"; multipla: boolean; colunas: string[]; linhas: { rotulo: string; entry: string }[] });

export type PaginaDaAvaliacao = Base & { itens: ItemDaAvaliacao[] };

/** O que o extrator grava: o formulário sem o id, com o hash dele no lugar. */
export type EspelhoDaAvaliacao = {
  /** SHA-256 (hex) do trecho `1FAIpQL…` do link de resposta. */
  idSha256: string;
  titulo: string;
  descricao: string;
  /** entry do campo "Código do site", quando o formulário tem um. */
  codigo: string | null;
  paginas: PaginaDaAvaliacao[];
};

/** O espelho com o id que veio do banco, depois de conferido. */
export type FormularioDeAvaliacao = Omit<EspelhoDaAvaliacao, "idSha256"> & {
  /** O trecho `1FAIpQL…` do link de resposta (`/forms/d/e/<id>/viewform`). */
  id: string;
};

/** entry → valor. Caixas e grade de caixas guardam a lista do que foi marcado. */
export type RespostasDaAvaliacao = Readonly<Record<string, string | readonly string[]>>;

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * O formulário desenhável para o link configurado no banco, ou null (a aba usa o iframe do
 * Google): outro formulário, link curto, vazio ou inválido.
 */
export async function formularioDeAvaliacao(
  link: string | null,
  espelho: EspelhoDaAvaliacao = ESPELHO_DA_AVALIACAO,
): Promise<FormularioDeAvaliacao | null> {
  if (!link) return null;
  let caminho: string;
  try {
    caminho = new URL(link).pathname;
  } catch {
    return null;
  }
  const id = /\/forms\/d\/e\/([A-Za-z0-9_-]+)\//.exec(caminho)?.[1];
  if (!id || (await sha256(id)) !== espelho.idSha256) return null;
  const { idSha256: _hash, ...resto } = espelho;
  return { ...resto, id };
}

export const urlDoEnvioDaAvaliacao = (formulario: FormularioDeAvaliacao) =>
  `https://docs.google.com/forms/d/e/${formulario.id}/formResponse`;

/** Os entries de um item, na ordem da tela. Aviso não tem. */
export function entriesDoItem(item: ItemDaAvaliacao): string[] {
  if (item.tipo === "aviso") return [];
  if (item.tipo === "grade") return item.linhas.map(l => l.entry);
  return [item.entry];
}

function valoresDe(resposta: string | readonly string[] | undefined): string[] {
  if (resposta === undefined) return [];
  const lista = typeof resposta === "string" ? [resposta] : [...resposta];
  return lista.map(v => v.trim()).filter(Boolean);
}

/**
 * Corpo do envio. Só vai o que foi respondido (nenhuma pergunta é obrigatória). Caixas e grade de
 * caixas repetem o entry, um por opção marcada, que é como o Forms recebe.
 *
 * `pageHistory` diz ao Forms que todas as páginas foram vistas; sem ele o Google guarda só a
 * primeira e descarta o resto em silêncio.
 */
export function corpoDaAvaliacao(
  formulario: FormularioDeAvaliacao,
  respostas: RespostasDaAvaliacao,
  codigo: string | null,
): URLSearchParams {
  const corpo = new URLSearchParams();
  const validos = new Set(formulario.paginas.flatMap(p => p.itens.flatMap(entriesDoItem)));
  for (const [entry, resposta] of Object.entries(respostas)) {
    if (!validos.has(entry)) continue;
    for (const valor of valoresDe(resposta)) corpo.append(entry, valor);
  }
  if (formulario.codigo && codigo) corpo.set(formulario.codigo, codigo);
  corpo.set("pageHistory", formulario.paginas.map((_, i) => i).join(","));
  return corpo;
}

/** Quantas perguntas da página têm resposta, e quantas existem. Linha de grade conta como pergunta. */
export function andamentoDaPagina(pagina: PaginaDaAvaliacao, respostas: RespostasDaAvaliacao) {
  const entries = pagina.itens.flatMap(entriesDoItem);
  return { respondidas: entries.filter(e => valoresDe(respostas[e]).length > 0).length, total: entries.length };
}

/**
 * O Forms recusa em silêncio a resposta inteira quando um e-mail não passa na validação dele, e o
 * envio `no-cors` não vê a recusa: a página confere antes. Vazio passa.
 */
export function emailsInvalidos(formulario: FormularioDeAvaliacao, respostas: RespostasDaAvaliacao): string[] {
  return formulario.paginas
    .flatMap(p => p.itens)
    .filter((i): i is Extract<ItemDaAvaliacao, { tipo: "texto" }> => i.tipo === "texto" && i.email)
    .filter(i => {
      const valor = valoresDe(respostas[i.entry])[0];
      return valor !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
    })
    .map(i => i.entry);
}

// --- Rascunho -----------------------------------------------------------------------------------
// A avaliação leva quase uma hora e pode ser feita em mais de uma vez. O rascunho fica só neste
// navegador, por pessoa e por formulário, e é apagado quando ela pede ou depois de enviar.

export type RascunhoDaAvaliacao = { pagina: number; respostas: RespostasDaAvaliacao; enviadoEm: string | null };

export const chaveDoRascunho = (formulario: FormularioDeAvaliacao, usuario: string) =>
  `trailup:avaliacao:${formulario.id}:${usuario}`;

/** Lê o que veio do localStorage. Qualquer coisa fora do formato vira null, sem levantar. */
export function lerRascunho(bruto: string | null, formulario: FormularioDeAvaliacao): RascunhoDaAvaliacao | null {
  if (!bruto) return null;
  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!dado || typeof dado !== "object") return null;
  const r = dado as Record<string, unknown>;
  const validos = new Set(formulario.paginas.flatMap(p => p.itens.flatMap(entriesDoItem)));
  const respostas: Record<string, string | string[]> = {};
  if (r.respostas && typeof r.respostas === "object") {
    for (const [entry, valor] of Object.entries(r.respostas as Record<string, unknown>)) {
      if (!validos.has(entry)) continue;
      if (typeof valor === "string") respostas[entry] = valor;
      else if (Array.isArray(valor) && valor.every(v => typeof v === "string")) respostas[entry] = valor;
    }
  }
  const ultima = formulario.paginas.length - 1;
  const pagina = typeof r.pagina === "number" && Number.isInteger(r.pagina) ? Math.min(Math.max(r.pagina, 0), ultima) : 0;
  const enviadoEm = typeof r.enviadoEm === "string" ? r.enviadoEm : null;
  return { pagina, respostas, enviadoEm };
}

/** Texto do Forms com links soltos: separa em pedaços de texto e de URL, para a tela virar link. */
export function pedacosComLinks(texto: string): { texto: string; link: boolean }[] {
  const pedacos: { texto: string; link: boolean }[] = [];
  let resto = 0;
  for (const achado of texto.matchAll(/https:\/\/[^\s)]+[^\s).,;:]/g)) {
    const inicio = achado.index ?? 0;
    if (inicio > resto) pedacos.push({ texto: texto.slice(resto, inicio), link: false });
    pedacos.push({ texto: achado[0], link: true });
    resto = inicio + achado[0].length;
  }
  if (resto < texto.length) pedacos.push({ texto: texto.slice(resto), link: false });
  return pedacos;
}
