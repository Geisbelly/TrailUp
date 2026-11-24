/**
 * O gabarito das objetivas guardado no aparelho e a fila das respostas dadas sem rede. As regras
 * estão em `gabaritoNoAparelho.core.ts`.
 *
 * ## O que a cifra protege, e o que não protege
 *
 * O gabarito fica no armazenamento local (`AsyncStorage`: no aparelho, o armazenamento do app; na
 * web, o `localStorage` do site) cifrado com AES-256-GCM, com uma chave aleatória por aluno e o
 * aluno e a turma amarrados ao texto.
 *
 * - Protege contra ler as respostas abrindo o armazenamento à toa (ferramentas do navegador, cópia
 *   do arquivo, busca por texto), e contra usar o blob de uma conta em outra.
 * - **Não** protege contra quem tem o aparelho ou o navegador do aluno: a chave fica no mesmo
 *   armazenamento, e quem lê um lê o outro. Também não protege a resposta da RPC na aba Rede do
 *   navegador, nem o gabarito na memória do app enquanto a tela está aberta.
 *
 * A autora aceitou esse risco (24/11): o gabarito no aparelho é para corrigir na hora e sem rede,
 * não um segredo contra o próprio aluno.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomBytes } from "expo-crypto";

import { supabase } from "@/database/supabase";
import { avisarFalha } from "@/services/saude/medicao";

import {
  TAMANHO_DO_NONCE,
  cifrar,
  decifrar,
  deBase64,
  enfileirar,
  falhaDeRede,
  lerFila,
  lerGabaritos,
  paraBase64,
  type GabaritosObjetivos,
  type RespostaNaFila,
} from "./gabaritoNoAparelho.core";
import { responderQuestao, type RespostaCorrigida } from "./questaoNoBanco";

export { corrigirNoAparelho, gabaritoParaMostrar, respostaDaAlternativa } from "./gabaritoNoAparelho.core";
export type { GabaritosObjetivos, RespostaNaFila } from "./gabaritoNoAparelho.core";

const chaveDaCifra = (aluno: string) => `trailup:gabarito:chave:v1:${aluno}`;
const chaveDoBlob = (aluno: string, classe: number) => `trailup:gabarito:v1:${aluno}:${classe}`;
const chaveDaFila = (aluno: string) => `trailup:respostas-sem-rede:v1:${aluno}`;
const aadDe = (aluno: string, classe: number) => `trailup-gabarito|${aluno}|${classe}`;

const memoria = new Map<string, GabaritosObjetivos>();
const baixando = new Map<string, Promise<GabaritosObjetivos | null>>();

async function chaveDoAluno(aluno: string): Promise<Uint8Array> {
  const guardada = await AsyncStorage.getItem(chaveDaCifra(aluno));
  if (guardada) {
    const bytes = deBase64(guardada);
    if (bytes.length === 32) return bytes;
  }
  const nova = getRandomBytes(32);
  await AsyncStorage.setItem(chaveDaCifra(aluno), paraBase64(nova));
  return nova;
}

async function lerDoAparelho(aluno: string, classe: number): Promise<GabaritosObjetivos | null> {
  const blob = await AsyncStorage.getItem(chaveDoBlob(aluno, classe));
  if (!blob) return null;
  const texto = decifrar(await chaveDoAluno(aluno), aadDe(aluno, classe), blob);
  if (texto == null) return null;
  try {
    return lerGabaritos(JSON.parse(texto));
  } catch {
    return null;
  }
}

async function baixar(aluno: string, classe: number): Promise<GabaritosObjetivos | null> {
  const { data, error } = await supabase.rpc("questao_gabaritos_offline", { p_classe_id: classe });
  if (error) throw error;
  const linhas = Array.isArray(data) ? data : [];
  const gabaritos = lerGabaritos(linhas);
  memoria.set(`${aluno}|${classe}`, gabaritos);
  const blob = cifrar(await chaveDoAluno(aluno), getRandomBytes(TAMANHO_DO_NONCE), aadDe(aluno, classe), JSON.stringify(linhas));
  await AsyncStorage.setItem(chaveDoBlob(aluno, classe), blob);
  return gabaritos;
}

/** O que já está na memória, sem esperar nada. */
export function gabaritosEmMemoria(aluno: string | null, classe: number | null): GabaritosObjetivos | null {
  if (!aluno || classe == null) return null;
  return memoria.get(`${aluno}|${classe}`) ?? null;
}

/**
 * O gabarito da turma: o guardado no aparelho na hora, e o do banco por cima assim que chegar (o
 * professor pode ter mudado uma questão). Sem rede, fica o guardado. Nunca levanta.
 */
export async function carregarGabaritos(aluno: string, classe: number): Promise<GabaritosObjetivos | null> {
  const chave = `${aluno}|${classe}`;
  if (!memoria.has(chave)) {
    try {
      const guardado = await lerDoAparelho(aluno, classe);
      if (guardado) memoria.set(chave, guardado);
    } catch (erro) {
      avisarFalha("gabarito/ler", "[gabarito] Falha ao ler o gabarito guardado:", erro);
    }
  }
  if (!baixando.has(chave)) {
    const pedido = baixar(aluno, classe)
      .catch((erro) => {
        if (!falhaDeRede(erro)) avisarFalha("gabarito/baixar", "[gabarito] Falha ao baixar o gabarito:", erro);
        return memoria.get(chave) ?? null;
      });
    baixando.set(chave, pedido);
  }
  const doBanco = await baixando.get(chave)!;
  return doBanco ?? memoria.get(chave) ?? null;
}

// ---------------------------------------------------------------- fila sem rede

export async function respostasNaFila(aluno: string): Promise<RespostaNaFila[]> {
  try {
    return lerFila(JSON.parse((await AsyncStorage.getItem(chaveDaFila(aluno))) ?? "[]"));
  } catch {
    return [];
  }
}

export async function guardarNaFila(aluno: string, item: RespostaNaFila): Promise<void> {
  const fila = enfileirar(await respostasNaFila(aluno), item);
  await AsyncStorage.setItem(chaveDaFila(aluno), JSON.stringify(fila));
}

let enviandoFila: Promise<RespostaCorrigida[]> | null = null;

/**
 * Manda ao banco, em ordem, o que foi respondido sem rede. Para na primeira falha de rede (o resto
 * fica para a próxima vez). O que o banco recusa (prazo, tentativa) sai da fila: repetir não adianta.
 * Devolve o que o banco corrigiu, para a tela acompanhar.
 */
export function enviarFila(aluno: string): Promise<RespostaCorrigida[]> {
  if (enviandoFila) return enviandoFila;
  enviandoFila = (async () => {
    const corrigidas: RespostaCorrigida[] = [];
    let fila = await respostasNaFila(aluno);
    while (fila.length) {
      const [item] = fila;
      try {
        corrigidas.push(await responderQuestao(item));
      } catch (erro) {
        if (falhaDeRede(erro)) break;
        avisarFalha("gabarito/fila-recusada", "[gabarito] O banco recusou uma resposta dada sem rede:", erro);
      }
      fila = fila.slice(1);
      await AsyncStorage.setItem(chaveDaFila(aluno), JSON.stringify(fila));
    }
    return corrigidas;
  })().finally(() => {
    enviandoFila = null;
  });
  return enviandoFila;
}
