import AsyncStorage from "@react-native-async-storage/async-storage";

import { conferirDesafio } from "./desafios";
import type { Preenchimento, RespostaDoAluno, ResultadoDoDesafio } from "./desafio.core";

/**
 * O parcial do desafio guardado no aparelho, para o aluno sair e voltar sem perder o que escreveu.
 *
 * Chave `desafio:<aluno>:<desafio_grupo>` (molde de `trailResumeKey`). O grupo é o mesmo
 * quebra-cabeça nas linhas de cada perfil, então trocar o perfil ativo não perde o parcial. O aluno
 * entra na chave porque nada limpa o AsyncStorage no logout: no tablet da escola, sem ele, o aluno
 * B abriria a resposta do aluno A e receberia o prêmio por ela. Sem aluno, não há rascunho: nem
 * leitura nem gravação.
 *
 * **Sobrevive a qualquer erro** do "Conferir" (rede, limite, resposta errada) e só é apagado quando
 * o banco diz que o desafio está resolvido (`acertou`, ou `ja_concluida`).
 *
 * O AsyncStorage é conveniência: falha de leitura vira "sem rascunho" e falha de escrita é
 * engolida. Nunca derruba a tela nem o "Conferir". O que fica aqui é só o que o aluno digitou: o
 * app não tem a resposta.
 */
export type RascunhoDoDesafio =
  | { tipo: "logica"; resposta: string }
  | { tipo: "cruzadinha"; celulas: Preenchimento };

export const chaveDoRascunho = (alunoId: string, grupo: string) => `desafio:${alunoId}:${grupo}`;

type Aluno = string | null | undefined;

const CASA = /^\d+,\d+$/;

/** Relê o que estava gravado, casa a casa: o que não for rascunho é ignorado. */
function lerGravado(bruto: unknown): RascunhoDoDesafio | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const r = bruto as Record<string, unknown>;
  if (r.tipo === "logica") return typeof r.resposta === "string" ? { tipo: "logica", resposta: r.resposta } : null;
  if (r.tipo !== "cruzadinha" || !r.celulas || typeof r.celulas !== "object" || Array.isArray(r.celulas)) return null;
  const celulas: Record<string, string> = {};
  for (const [casa, letra] of Object.entries(r.celulas as Record<string, unknown>)) {
    if (CASA.test(casa) && typeof letra === "string" && Array.from(letra).length === 1) celulas[casa] = letra;
  }
  return { tipo: "cruzadinha", celulas };
}

export async function lerRascunho(alunoId: Aluno, grupo: string): Promise<RascunhoDoDesafio | null> {
  if (!alunoId) return null;
  try {
    const texto = await AsyncStorage.getItem(chaveDoRascunho(alunoId, grupo));
    return texto ? lerGravado(JSON.parse(texto)) : null;
  } catch {
    return null;
  }
}

export async function salvarRascunho(alunoId: Aluno, grupo: string, rascunho: RascunhoDoDesafio): Promise<void> {
  if (!alunoId) return;
  try {
    await AsyncStorage.setItem(chaveDoRascunho(alunoId, grupo), JSON.stringify(rascunho));
  } catch (e) {
    console.warn("[Desafio] rascunho não foi guardado:", e instanceof Error ? e.message : e);
  }
}

export async function apagarRascunho(alunoId: Aluno, grupo: string): Promise<void> {
  if (!alunoId) return;
  try {
    await AsyncStorage.removeItem(chaveDoRascunho(alunoId, grupo));
  } catch (e) {
    console.warn("[Desafio] rascunho não foi apagado:", e instanceof Error ? e.message : e);
  }
}

/**
 * O "Conferir" da tela: guarda o que está na tela ANTES de ir à rede, confere no banco e apaga o
 * rascunho só quando o desafio está resolvido (acertou agora, ou já tinha acertado:
 * `ja_concluida`). Sem conexão, a resposta continua no aparelho.
 */
export async function conferirComRascunho({
  alunoId,
  missaoId,
  grupo,
  rascunho,
  resposta,
}: {
  alunoId: Aluno;
  missaoId: number;
  grupo: string;
  rascunho: RascunhoDoDesafio;
  resposta: RespostaDoAluno;
}): Promise<ResultadoDoDesafio> {
  await salvarRascunho(alunoId, grupo, rascunho);
  const resultado = await conferirDesafio(missaoId, resposta);
  if ("acertou" in resultado && (resultado.acertou || resultado.ja_concluida)) await apagarRascunho(alunoId, grupo);
  return resultado;
}
