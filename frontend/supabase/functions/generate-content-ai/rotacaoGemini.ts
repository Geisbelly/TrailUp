/**
 * Rotação de chaves e modelos do Gemini, separada do `index.ts` para ser
 * testada sem rede (vitest com `fetch` falso). Sem `Deno.*` aqui dentro.
 *
 * Ordem: o modelo principal com cada chave, depois cada modelo de reserva
 * com cada chave. A falha diz o que pular:
 *
 * - **402/403/429 são da chave** (cota, crédito, permissão): o par
 *   (chave, modelo) sai por um tempo e a próxima chave ainda vale.
 * - **500/503 são do modelo** (sobrecarga): trocar de chave não adianta. O
 *   modelo sai do resto deste pedido e, por um tempo curto, dos próximos.
 *   Medido em 10/11: o `gemini-3.6-flash` deu 503 nas chaves #0, #1 e #2 em
 *   sequência, um deles depois de 58 s, enquanto o `flash-lite` respondia em
 *   13 s. Girar as chaves no mesmo modelo comeu metade dos 120 s do pedido.
 * - **Demora**: com prazo, cada chamada tem um limite próprio. Estourar esse
 *   limite conta como sobrecarga do modelo; estourar o prazo do pedido
 *   encerra a rotação.
 */

export type RespostaGemini = { res: Response; apiData: Record<string, unknown> };

export type EstadoDaRotacao = {
  /** (chave|modelo) → instante até quando o par fica de fora. */
  esgotadoAte: Map<string, number>;
  /** modelo → instante até quando ele fica de fora. */
  sobrecarregadoAte: Map<string, number>;
};

export const novoEstadoDaRotacao = (): EstadoDaRotacao => ({
  esgotadoAte: new Map(),
  sobrecarregadoAte: new Map(),
});

/** O prazo do pedido acabou: não cabe mais nenhuma chamada. */
export class PrazoDoGeminiEsgotado extends Error {
  constructor() {
    super("Prazo do pedido esgotado antes de o Gemini responder.");
    this.name = "PrazoDoGeminiEsgotado";
  }
}

/** Nenhuma chamada chegou a ter resposta HTTP (rede ou limite por chamada em todas). */
export class GeminiInalcancavel extends Error {
  readonly causa: unknown;
  constructor(causa: unknown) {
    super("Nao foi possivel conectar ao Gemini.");
    this.name = "GeminiInalcancavel";
    this.causa = causa;
  }
}

const STATUS_DA_CHAVE = new Set([402, 403, 429]);
const STATUS_DO_MODELO = new Set([500, 503]);

export const ESGOTADO_COOLDOWN_MS = 10 * 60 * 1000;
export const SOBRECARGA_COOLDOWN_MS = 2 * 60 * 1000;
/**
 * Limite de uma chamada quando o pedido tem prazo. As respostas boas medidas
 * em 10/11 levaram 13 a 14 s; o 503 lento, 58 s. Sem prazo (modos
 * description/content) não há limite, como antes.
 */
export const LIMITE_POR_CHAMADA_MS = 45 * 1000;

const ehAbortoPorTempo = (erro: unknown) =>
  erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");

type Opcoes = {
  chaves: string[];
  modelos: string[];
  modeloPrincipal: string;
  corpo: string;
  estado: EstadoDaRotacao;
  /** Instante (ms) em que o pedido tem de parar; sem ele, nenhuma chamada tem limite. */
  prazo?: number;
  limitePorChamadaMs?: number;
  fetch: typeof fetch;
  agora?: () => number;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
};

export async function chamarGeminiComRotacao({
  chaves,
  modelos,
  modeloPrincipal,
  corpo,
  estado,
  prazo,
  limitePorChamadaMs = LIMITE_POR_CHAMADA_MS,
  fetch: fazerFetch,
  agora = Date.now,
  log = { info: () => {}, warn: () => {} },
}: Opcoes): Promise<RespostaGemini> {
  const inicio = agora();
  const pares = modelos.flatMap((modelo) =>
    chaves.map((chave, indice) => ({ chave, indice, modelo, id: `${chave}|${modelo}` })),
  );
  const disponiveis = pares.filter(
    (par) =>
      (estado.esgotadoAte.get(par.id) ?? 0) <= inicio && (estado.sobrecarregadoAte.get(par.modelo) ?? 0) <= inicio,
  );
  // Tudo de fora: tenta mesmo assim, a cota ou a sobrecarga podem ter passado.
  const ordem = disponiveis.length ? disponiveis : pares;

  const sobrecarregadosAgora = new Set<string>();
  const marcarSobrecarga = (modelo: string) => {
    sobrecarregadosAgora.add(modelo);
    estado.sobrecarregadoAte.set(modelo, agora() + SOBRECARGA_COOLDOWN_MS);
  };

  let ultima: RespostaGemini | null = null;
  let ultimoErro: unknown = null;
  for (const par of ordem) {
    if (sobrecarregadosAgora.has(par.modelo)) continue;
    const resta = prazo === undefined ? undefined : prazo - agora();
    if (resta !== undefined && resta <= 0) throw new PrazoDoGeminiEsgotado();
    const limite = resta === undefined ? undefined : Math.min(resta, limitePorChamadaMs);
    // Quem corta é o prazo do pedido (e não o limite da chamada)?
    const cortaPeloPrazo = resta !== undefined && resta <= limitePorChamadaMs;
    const sinal = limite === undefined ? undefined : AbortSignal.timeout(limite);

    const tratarDemora = (erro: unknown) => {
      if (cortaPeloPrazo) throw new PrazoDoGeminiEsgotado();
      log.warn(`gemini: chave #${par.indice} modelo ${par.modelo} -> sem resposta em ${limite} ms`);
      ultimoErro = erro;
      marcarSobrecarga(par.modelo);
    };

    let res: Response;
    try {
      // Chave no header, nao na URL (#195): URL vai parar em log.
      res = await fazerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${par.modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": par.chave },
        body: corpo,
        ...(sinal ? { signal: sinal } : {}),
      });
    } catch (erro) {
      if (ehAbortoPorTempo(erro)) {
        tratarDemora(erro);
        continue;
      }
      ultimoErro = erro;
      continue;
    }

    let apiData: Record<string, unknown>;
    try {
      apiData = (await res.json()) as Record<string, unknown>;
    } catch (erro) {
      // O sinal também corta a leitura do corpo: resposta pela metade não serve.
      if (ehAbortoPorTempo(erro)) {
        tratarDemora(erro);
        continue;
      }
      apiData = { error: { message: "Resposta nao JSON do Gemini." } };
    }

    if (res.ok) {
      if (par.modelo !== modeloPrincipal || par.indice !== 0) {
        log.info(`gemini: respondeu com chave #${par.indice} e modelo ${par.modelo}`);
      }
      return { res, apiData };
    }
    ultima = { res, apiData };
    const motivo = (apiData?.error as Record<string, unknown> | undefined)?.status;
    if (!STATUS_DA_CHAVE.has(res.status) && !STATUS_DO_MODELO.has(res.status)) return ultima;
    log.warn(`gemini: chave #${par.indice} modelo ${par.modelo} -> ${res.status} ${motivo ?? ""}`);
    if (STATUS_DA_CHAVE.has(res.status)) estado.esgotadoAte.set(par.id, agora() + ESGOTADO_COOLDOWN_MS);
    else marcarSobrecarga(par.modelo);
  }

  if (ultima) return ultima;
  throw new GeminiInalcancavel(ultimoErro);
}
