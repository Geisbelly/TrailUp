/**
 * Gabarito das questões objetivas no aparelho (decisão da autora em 24/11, `20261124_07`).
 *
 * Na web, `questao_responder` levou de 5 a 7 s por questão de marcar. Com o gabarito no aparelho, a
 * múltipla escolha e o verdadeiro/falso são corrigidos na hora, inclusive sem rede. O banco continua
 * sendo quem grava a nota: a resposta vai a `questao_responder` quando há rede, e sem rede entra numa
 * fila guardada no aparelho. Se o banco discordar do aparelho, vale o banco.
 *
 * O que vem do banco não é a resposta certa para o app comparar com a regra dele: é a lista das
 * respostas que o app pode mandar e que `fn_questao_confere` aceita (`aceitas`). O app só confere se
 * a resposta está na lista, e por isso nunca discorda do banco sobre o que manda. Para isso, a
 * resposta que o app manda sai de uma função só (`respostaDaAlternativa`), com a mesma regra da
 * migration (texto da alternativa, letra na múltipla rica, "Verdadeiro"/"Falso" no V/F).
 *
 * Aqui só as partes puras: a conferência, a resposta que vai ao banco, a cifra e a fila.
 */

import { gcm } from "@noble/ciphers/aes";

import type { RegraDaPontuacao, RespostaCorrigida } from "./questaoNoBanco.core";

/** `questao_id` → respostas que o banco aceita. Sem entrada: o app não corrige, espera o banco. */
export type GabaritosObjetivos = Record<number, string[]>;

export type LinhaDoGabarito = { questao_id: unknown; aceitas: unknown };

export function lerGabaritos(linhas: unknown): GabaritosObjetivos {
  const saida: GabaritosObjetivos = {};
  if (!Array.isArray(linhas)) return saida;
  for (const linha of linhas as LinhaDoGabarito[]) {
    const id = Number(linha?.questao_id);
    if (!Number.isFinite(id) || !Array.isArray(linha?.aceitas)) continue;
    saida[id] = (linha.aceitas as unknown[]).filter((x): x is string => typeof x === "string");
  }
  return saida;
}

/** `true`/`false` quando o aparelho sabe; `null` quando a questão não está no gabarito. */
export function corrigirNoAparelho(
  gabaritos: GabaritosObjetivos | null | undefined,
  questaoId: number,
  resposta: string,
): boolean | null {
  const aceitas = gabaritos?.[questaoId];
  if (!aceitas) return null;
  if (resposta.trim() === "") return false;
  return aceitas.includes(resposta);
}

/**
 * A resposta que o app manda por uma alternativa. É a mesma lista de candidatas de
 * `questao_gabaritos_offline`: mudar aqui sem mudar lá faz o aparelho deixar de reconhecer a resposta
 * (ele então só espera o banco, não erra).
 */
export function respostaDaAlternativa(params: {
  alternativas: unknown[];
  indice: number | null | undefined;
  rica: boolean;
  verdadeiroOuFalso: boolean;
}): string {
  const { alternativas, indice, rica, verdadeiroOuFalso } = params;
  if (indice == null || indice < 0 || indice >= alternativas.length) return "";
  if (rica && !verdadeiroOuFalso) return String.fromCharCode(65 + indice);
  return String(alternativas[indice] ?? "");
}

/** O texto do gabarito a mostrar: a alternativa aceita (na rica, a letra vira o texto dela). */
export function gabaritoParaMostrar(aceitas: string[] | undefined, alternativas: unknown[]): string | null {
  if (!aceitas?.length) return null;
  const textos = alternativas.map((alt) => String(alt ?? ""));
  const texto = aceitas.find((a) => textos.includes(a));
  if (texto != null) return texto;
  const letra = aceitas.find((a) => /^[A-Z]$/.test(a));
  if (letra != null) {
    const i = letra.charCodeAt(0) - 65;
    if (i >= 0 && i < textos.length) return textos[i];
  }
  return aceitas[0];
}

/**
 * O resultado que a tela mostra antes de o banco responder. A regra da pontuação é a que a tela já
 * sabe (viu o gabarito, respondeu de novo, nova tentativa), a mesma ordem de
 * `fn_questao_registrar_resposta`; o banco confirma ou corrige quando a resposta chega a ele.
 */
export function respostaProvisoria(params: {
  correta: boolean;
  viuGabarito: boolean;
  respondeuDeNovo: boolean;
  novaTentativa: boolean;
  fatorDaNovaTentativa: number;
  /** O modo pensante só mostra o gabarito a quem acertou, como o banco (`gabarito_liberado`). */
  pensante: boolean;
  gabarito: string | null;
}): RespostaCorrigida {
  const regra: RegraDaPontuacao = params.viuGabarito
    ? "viu_gabarito"
    : params.respondeuDeNovo
    ? "resposta_repetida"
    : params.novaTentativa
    ? "nova_tentativa"
    : "primeira";
  const fator = regra === "viu_gabarito" ? 0.2 : regra === "resposta_repetida" ? 0.5 : regra === "nova_tentativa" ? params.fatorDaNovaTentativa : 1;
  const liberado = params.correta || !params.pensante;
  return {
    correta: params.correta,
    acertosPercentual: params.correta ? Math.round(100 * fator) : 0,
    regra,
    tentativa: null,
    erros: params.correta ? 0 : 1,
    gabaritoLiberado: liberado,
    respostaCorreta: liberado ? params.gabarito : null,
  };
}

// ---------------------------------------------------------------- cifra

const TAMANHO_DO_NONCE = 12;

function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * AES-256-GCM. `nonce` são 12 bytes aleatórios, um por gravação. O `aad` amarra o texto ao aluno e
 * à turma: o blob de uma conta não decifra na outra, nem copiado de uma chave para outra.
 */
export function cifrar(chave: Uint8Array, nonce: Uint8Array, aad: string, texto: string): string {
  const dados = new TextEncoder().encode(texto);
  const cifrado = gcm(chave, nonce, new TextEncoder().encode(aad)).encrypt(dados);
  const saida = new Uint8Array(nonce.length + cifrado.length);
  saida.set(nonce, 0);
  saida.set(cifrado, nonce.length);
  return paraBase64(saida);
}

/** O texto, ou `null` se o blob não é desta chave, deste aluno e turma, ou foi alterado. */
export function decifrar(chave: Uint8Array, aad: string, blob: string): string | null {
  try {
    const bytes = deBase64(blob);
    if (bytes.length <= TAMANHO_DO_NONCE) return null;
    const nonce = bytes.slice(0, TAMANHO_DO_NONCE);
    const corpo = bytes.slice(TAMANHO_DO_NONCE);
    const claro = gcm(chave, nonce, new TextEncoder().encode(aad)).decrypt(corpo);
    return new TextDecoder().decode(claro);
  } catch {
    return null;
  }
}

export { deBase64, paraBase64, TAMANHO_DO_NONCE };

// ---------------------------------------------------------------- fila sem rede

export type RespostaNaFila = {
  questaoId: number;
  resposta: string;
  tempoGastoSeg: number | null;
  /** Quando o aluno respondeu (ms). A ordem de envio é esta. */
  em: number;
};

export function enfileirar(fila: RespostaNaFila[], item: RespostaNaFila): RespostaNaFila[] {
  // A mesma resposta da mesma questão no mesmo instante é o mesmo toque: não duplica.
  if (fila.some((x) => x.questaoId === item.questaoId && x.em === item.em)) return fila;
  return [...fila, item].sort((a, b) => a.em - b.em);
}

export function lerFila(valor: unknown): RespostaNaFila[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(
      (x): x is RespostaNaFila =>
        x != null &&
        Number.isFinite(Number((x as RespostaNaFila).questaoId)) &&
        typeof (x as RespostaNaFila).resposta === "string" &&
        Number.isFinite(Number((x as RespostaNaFila).em)),
    )
    .map((x) => ({
      questaoId: Number(x.questaoId),
      resposta: x.resposta,
      tempoGastoSeg: x.tempoGastoSeg == null ? null : Number(x.tempoGastoSeg),
      em: Number(x.em),
    }))
    .sort((a, b) => a.em - b.em);
}

/**
 * A falha é de rede (vale guardar e mandar depois) ou é o banco recusando (prazo, tentativa,
 * permissão), quando repetir não adianta? Na dúvida, rede: perder a resposta é pior que reenviar
 * uma que o banco vai recusar.
 */
export function falhaDeRede(erro: unknown): boolean {
  if (erro == null) return false;
  const e = erro as { code?: unknown; message?: unknown; name?: unknown; status?: unknown };
  if (e.code === "tempo_esgotado") return true;
  const codigo = typeof e.code === "string" ? e.code : "";
  // Código do Postgres (5 caracteres, como P0001, 42501, 22023) é recusa do banco.
  if (/^[0-9A-Z]{5}$/.test(codigo) || codigo.startsWith("PGRST")) return false;
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) return false;
  const mensagem = String(e.message ?? "").toLowerCase();
  return (
    e.name === "TypeError" ||
    mensagem.includes("failed to fetch") ||
    mensagem.includes("network request failed") ||
    mensagem.includes("networkerror") ||
    mensagem.includes("load failed") ||
    mensagem.includes("fetch") ||
    codigo === ""
  );
}
