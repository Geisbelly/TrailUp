import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Fila durável genérica para escrita que não pôde ser gravada agora.
 *
 * Esta é a mesma máquina que o `telemetriaOutbox` já usava: poda por validade
 * e por teto, distinção entre erro temporário e definitivo, e escoamento do
 * mais antigo para o mais novo. O que era específico de telemetria ficou lá; o
 * que vale para qualquer escrita mora aqui.
 *
 * A extração não é estética. O progresso, o tempo e os pontos precisavam
 * exatamente destas regras, e copiá-las criaria uma **segunda implementação da
 * semântica de fila** -- duas cópias da mesma regra divergindo é o defeito que
 * este repo já pagou caro (o merge de materiais, a audiência de conquista).
 * Corrigir a classificação de erro num lugar e não no outro seria questão de
 * tempo.
 *
 * As regras ficam em funções PURAS (`podarItens`, `ehErroPermanente`,
 * `escoarItens`) para poderem ser testadas sem AsyncStorage.
 */

export type ItemEnfileirado<T> = {
  enfileiradoEm: number;
  payload: T;
};

export type OpcoesDaFila = {
  /** Chave no AsyncStorage. Uma por fila, nunca compartilhada. */
  chave: string;
  /**
   * Teto de itens guardados. A fila é seguro contra falha temporária, não
   * arquivo: um aluno offline por dias encheria o armazenamento do aparelho.
   * Ao estourar, descarta do começo -- o mais antigo é também o menos útil.
   */
  maxItens: number;
  /** Depois disso o item é velho demais para valer a pena. */
  validadeMs: number;
  /** Prefixo dos avisos no console, para saber de qual fila veio. */
  rotulo: string;
};

/** Descarta o que venceu e depois o excedente mais antigo. */
export function podarItens<T>(
  itens: ItemEnfileirado<T>[],
  agora: number,
  opcoes: Pick<OpcoesDaFila, "maxItens" | "validadeMs">,
): ItemEnfileirado<T>[] {
  const vigentes = itens.filter(
    (item) => agora - item.enfileiradoEm <= opcoes.validadeMs,
  );
  return vigentes.slice(-opcoes.maxItens);
}

/**
 * Códigos que significam "esta escrita NUNCA vai ser aceita": chave única
 * violada, FK apontando para linha que não existe mais (classe removida, por
 * exemplo), NOT NULL, tipo inválido. Retentar não muda o resultado.
 */
const CODIGOS_PERMANENTES = new Set(["23505", "23503", "23502", "22P02", "22007"]);

function codigoDoErro(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === "string" ? codigo : null;
}

/**
 * Distingue "ainda não dá" de "isto nunca vai passar".
 *
 * Na dúvida, RETENTAR: descartar por um erro que era temporário perde
 * progresso do aluno para sempre. Só o que é reconhecidamente definitivo sai
 * da fila.
 *
 * Vale notar que `23505` (chave única violada) é DEFINITIVO e isso é o que
 * torna a retentativa de ponto segura: com chave de idempotência, a segunda
 * entrega da mesma escrita bate no índice, é classificada como definitiva e
 * sai da fila -- ou seja, "já foi gravado" e "nunca vai passar" levam ao mesmo
 * lugar certo.
 */
export function ehErroPermanente(erro: unknown): boolean {
  const codigo = codigoDoErro(erro);
  if (codigo && CODIGOS_PERMANENTES.has(codigo)) return true;

  const status = (erro as { status?: unknown } | null)?.status;
  // 4xx de validação; 408 e 429 são temporários e ficam de fora de propósito.
  if (typeof status === "number" && status >= 400 && status < 500) {
    return status !== 408 && status !== 429;
  }

  return false;
}

/**
 * Reenvia do mais antigo para o mais novo.
 *
 * Para no primeiro erro **retentável**: se o envio ainda não voltou, insistir
 * nos seguintes só gasta bateria e rede.
 *
 * Mas um erro DEFINITIVO não pode parar a fila. Antes qualquer falha dava
 * `break`, e um item que nunca seria aceito -- o caso comum era 23505, a
 * escrita já gravada voltando porque a resposta se perdeu -- ficava na cabeça
 * da fila trancando **todos os que estavam atrás dele** até vencerem. Uma
 * resposta perdida custava uma semana de dados, não um item.
 */
export async function escoarItens<T>(
  fila: ItemEnfileirado<T>[],
  enviar: (payload: T) => Promise<unknown>,
  rotulo: string,
): Promise<{ enviados: number; descartados: number; restante: ItemEnfileirado<T>[] }> {
  let enviados = 0;
  let descartados = 0;
  let indice = 0;

  for (; indice < fila.length; indice += 1) {
    try {
      await enviar(fila[indice].payload);
      enviados += 1;
    } catch (erro) {
      if (!ehErroPermanente(erro)) break;

      descartados += 1;
      console.warn(
        `[${rotulo}] Item descartado por erro definitivo; a fila segue.`,
        erro,
      );
    }
  }

  return { enviados, descartados, restante: fila.slice(indice) };
}

function parsearFila<T>(bruto: string | null): ItemEnfileirado<T>[] {
  if (!bruto) return [];
  const dados = JSON.parse(bruto);
  if (!Array.isArray(dados)) return [];
  return dados.filter(
    (item): item is ItemEnfileirado<T> =>
      !!item && typeof item.enfileiradoEm === "number" && !!item.payload,
  );
}

export type FilaDuravel<T> = {
  enfileirar: (payload: T) => Promise<void>;
  contarPendentes: () => Promise<number>;
  drenar: (
    enviar: (payload: T) => Promise<unknown>,
  ) => Promise<{ enviados: number; descartados: number; pendentes: number }>;
};

export function criarFilaDuravel<T>(opcoes: OpcoesDaFila): FilaDuravel<T> {
  async function ler(): Promise<ItemEnfileirado<T>[]> {
    try {
      return parsearFila<T>(await AsyncStorage.getItem(opcoes.chave));
    } catch {
      // Fila corrompida não pode derrubar a escrita viva. Perder a fila é
      // ruim; travar o que está acontecendo agora é pior.
      return [];
    }
  }

  async function gravar(itens: ItemEnfileirado<T>[]): Promise<void> {
    try {
      await AsyncStorage.setItem(opcoes.chave, JSON.stringify(itens));
    } catch (erro) {
      console.warn(`[${opcoes.rotulo}] Não foi possível gravar a fila:`, erro);
    }
  }

  return {
    async enfileirar(payload: T) {
      const fila = await ler();
      fila.push({ enfileiradoEm: Date.now(), payload });
      await gravar(podarItens(fila, Date.now(), opcoes));
    },

    async contarPendentes() {
      return podarItens(await ler(), Date.now(), opcoes).length;
    },

    async drenar(enviar) {
      const fila = podarItens(await ler(), Date.now(), opcoes);
      if (fila.length === 0) {
        return { enviados: 0, descartados: 0, pendentes: 0 };
      }

      const { enviados, descartados, restante } = await escoarItens(
        fila,
        enviar,
        opcoes.rotulo,
      );
      await gravar(restante);
      return { enviados, descartados, pendentes: restante.length };
    },
  };
}
