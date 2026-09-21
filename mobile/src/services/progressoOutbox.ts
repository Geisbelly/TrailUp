import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Fila durável de atualizações de `personalizacao_item_progresso` que não
 * conseguiram ser gravadas (offline, ou rede instável ao fechar o app).
 *
 * Mesmo desenho de `telemetriaOutbox.ts` (poda + escoamento em funções puras,
 * mutex de escrita), com uma diferença: aqui o mesmo item pode ser enfileirado
 * várias vezes com valores CRESCENTES (20%, depois 60%, depois 100%) antes de
 * a fila ser escoada. Enfileirar funde com o que já estava na fila, em vez de
 * ignorar a duplicata — usando a MESMA regra de nunca regredir que o banco já
 * aplica em `personalizacao_item_progresso` (percentual/acertos = máx, tempo =
 * soma), para o item não perder a maior marca alcançada localmente.
 */

export type ProgressoItemPayload = {
  aluno_id: string;
  personalizacao_id: number;
  classe_id: number;
  topico_id: number;
  item_key: string;
  item_kind: string;
  item_title: string;
  status: string;
  percentual_concluido: number;
  acertos_percentual: number | null;
  tempo_gasto_min: number | null;
  pontuacao_obtida: number | null;
  pontuacao_maxima: number | null;
  metadata: Record<string, unknown>;
};

const CHAVE = "trailup:progresso-personalizado-outbox";

export const MAX_ITENS_OUTBOX = 200;

export const VALIDADE_OUTBOX_MS = 7 * 24 * 60 * 60 * 1000;

export type ItemEnfileirado = {
  enfileiradoEm: number;
  payload: ProgressoItemPayload;
};

function identidade(payload: ProgressoItemPayload) {
  return `${payload.aluno_id}:${payload.personalizacao_id}:${payload.item_key}`;
}

/** Nunca regride: status 'concluido' vence, percentual/acertos = máx, tempo = soma. */
export function mesclarItemOutbox(
  atual: ItemEnfileirado,
  novo: ItemEnfileirado
): ItemEnfileirado {
  const a = atual.payload;
  const n = novo.payload;
  return {
    enfileiradoEm: atual.enfileiradoEm,
    payload: {
      ...n,
      status: a.status === "concluido" || n.status === "concluido" ? "concluido" : n.status,
      percentual_concluido: Math.max(a.percentual_concluido ?? 0, n.percentual_concluido ?? 0),
      acertos_percentual:
        n.acertos_percentual == null
          ? a.acertos_percentual ?? null
          : Math.max(a.acertos_percentual ?? 0, n.acertos_percentual),
      tempo_gasto_min:
        Math.round(((a.tempo_gasto_min ?? 0) + (n.tempo_gasto_min ?? 0)) * 100) / 100,
    },
  };
}

/** Descarta o que venceu e depois o excedente mais antigo. */
export function podarItens(itens: ItemEnfileirado[], agora: number): ItemEnfileirado[] {
  const vigentes = itens.filter(
    (item) => agora - item.enfileiradoEm <= VALIDADE_OUTBOX_MS
  );
  return vigentes.slice(-MAX_ITENS_OUTBOX);
}

/**
 * Reenvia do mais antigo para o mais novo e **para no primeiro que falhar**:
 * se o envio ainda não voltou, insistir nos seguintes só gasta bateria e rede.
 */
export async function escoarItens(
  fila: ItemEnfileirado[],
  enviar: (payload: ProgressoItemPayload) => Promise<unknown>
): Promise<{ enviados: number; restante: ItemEnfileirado[] }> {
  let enviados = 0;
  for (const item of fila) {
    try {
      await enviar(item.payload);
      enviados += 1;
    } catch {
      break;
    }
  }
  return { enviados, restante: fila.slice(enviados) };
}

function parsearFila(bruto: string | null): ItemEnfileirado[] {
  if (!bruto) return [];
  const dados = JSON.parse(bruto);
  if (!Array.isArray(dados)) return [];
  return dados.filter(
    (item): item is ItemEnfileirado =>
      !!item && typeof item.enfileiradoEm === "number" && !!item.payload
  );
}

async function ler(): Promise<ItemEnfileirado[]> {
  // Falhar não significa fila vazia: sobrescrevê-la perderia itens pendentes.
  return parsearFila(await AsyncStorage.getItem(CHAVE));
}

async function gravar(itens: ItemEnfileirado[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch (erro) {
    console.warn("[progressoOutbox] Não foi possível gravar a fila:", erro);
    throw erro;
  }
}

let queueWrite: Promise<unknown> = Promise.resolve();
function mutateQueue<T>(action: () => Promise<T>): Promise<T> {
  const result = queueWrite.catch(() => undefined).then(action);
  queueWrite = result.catch(() => undefined);
  return result;
}

/** Guarda (ou funde com) um item que não pôde ser gravado, para tentar de novo depois. */
export async function enfileirarProgressoItem(payload: ProgressoItemPayload): Promise<void> {
  await mutateQueue(async () => {
    const fila = await ler();
    const novoItem: ItemEnfileirado = { enfileiradoEm: Date.now(), payload };
    const index = fila.findIndex((item) => identidade(item.payload) === identidade(payload));
    const proxima =
      index < 0
        ? [...fila, novoItem]
        : fila.map((item, i) => (i === index ? mesclarItemOutbox(item, novoItem) : item));
    await gravar(podarItens(proxima, Date.now()));
  });
}

export async function contarProgressoItensPendentes(): Promise<number> {
  return podarItens(await ler(), Date.now()).length;
}

let drainInFlight: Promise<{ enviados: number; pendentes: number }> | null = null;
export function drenarProgressoOutbox(
  enviar: (payload: ProgressoItemPayload) => Promise<unknown>
): Promise<{ enviados: number; pendentes: number }> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = (async () => {
    const fila = await mutateQueue(async () => podarItens(await ler(), Date.now()));
    const { enviados } = await escoarItens(fila, enviar);
    const enviadosIds = new Set(fila.slice(0, enviados).map((item) => identidade(item.payload)));
    const pendentes = await mutateQueue(async () => {
      // Mantém itens enfileirados enquanto o envio estava em voo.
      const remaining = podarItens(await ler(), Date.now()).filter(
        (item) => !enviadosIds.has(identidade(item.payload))
      );
      await gravar(remaining);
      return remaining.length;
    });
    return { enviados, pendentes };
  })().finally(() => {
    drainInFlight = null;
  });
  return drainInFlight;
}
