/**
 * Quanto do material o aluno percorreu: texto (rolagem), áudio (posição) e deck nativo (slides).
 *
 * Quem sabe a posição do áudio é o `AudioPlayer`, e quem sabe o slide aberto é o
 * `PresentationSlidesBlock`. Nenhum dos dois conhece o lote de telemetria, e não deveriam: eles
 * aparecem fora da trilha também. Então eles só INFORMAM aqui, e o `MetricasContext` (o único
 * ouvinte) grava no material que está aberto. Sem ouvinte, informar não faz nada.
 *
 * Cada informe é o ACUMULADO do componente desde que ele abriu (maior posição tocando, slides
 * distintos vistos), não um delta: o lote guarda o máximo, e a view no banco
 * (`vw_metricas_cobertura_material`, 20261116_01) usa o máximo entre os lotes.
 *
 * Sem import nativo: roda no teste em Node.
 */

export type CoberturaDoMaterial = {
  conteudoAlturaPx: number | null;
  janelaAlturaPx: number | null;
  midiaDuracaoSeg: number | null;
  midiaPosicaoMaxSeg: number | null;
  slidesVistos: number | null;
  slidesTotal: number | null;
};

export type CoberturaInformada = Partial<CoberturaDoMaterial>;

export const COBERTURA_VAZIA: CoberturaDoMaterial = Object.freeze({
  conteudoAlturaPx: null,
  janelaAlturaPx: null,
  midiaDuracaoSeg: null,
  midiaPosicaoMaxSeg: null,
  slidesVistos: null,
  slidesTotal: null,
});

const CAMPOS = Object.keys(COBERTURA_VAZIA) as (keyof CoberturaDoMaterial)[];

/** Número finito e não negativo, ou nulo. Nulo é "não mediu", e nunca vira zero. */
function medida(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/** O maior de cada campo; o que um lado não mediu não apaga o que o outro mediu. */
export function fundirCobertura(
  atual: CoberturaDoMaterial,
  nova: CoberturaInformada
): CoberturaDoMaterial {
  const resultado = { ...atual };
  for (const campo of CAMPOS) {
    const valor = medida(nova[campo]);
    if (valor == null) continue;
    const anterior = resultado[campo];
    resultado[campo] = anterior == null ? valor : Math.max(anterior, valor);
  }
  return resultado;
}

const umaCasa = (valor: number) => Math.round(valor * 10) / 10;

/** Só os campos medidos, já no nome da coluna. Entrada sem medida sai igual ao contrato antigo. */
export function serializarCobertura(cobertura: CoberturaDoMaterial) {
  const saida: {
    conteudo_altura_px?: number;
    janela_altura_px?: number;
    midia_duracao_seg?: number;
    midia_posicao_max_seg?: number;
    slides_vistos?: number;
    slides_total?: number;
  } = {};
  if (cobertura.conteudoAlturaPx != null) saida.conteudo_altura_px = Math.round(cobertura.conteudoAlturaPx);
  if (cobertura.janelaAlturaPx != null) saida.janela_altura_px = Math.round(cobertura.janelaAlturaPx);
  if (cobertura.midiaDuracaoSeg != null) saida.midia_duracao_seg = umaCasa(cobertura.midiaDuracaoSeg);
  if (cobertura.midiaPosicaoMaxSeg != null) saida.midia_posicao_max_seg = umaCasa(cobertura.midiaPosicaoMaxSeg);
  if (cobertura.slidesVistos != null) saida.slides_vistos = Math.round(cobertura.slidesVistos);
  if (cobertura.slidesTotal != null) saida.slides_total = Math.round(cobertura.slidesTotal);
  return saida;
}

/**
 * Do estado do player (em ms) para o informe (em s). A duração sai sempre que o player a conhece; a
 * posição só com a faixa TOCANDO, ou ao chegar ao fim: arrastar a barra até o final com o áudio
 * parado não é ter ouvido. Arrastar com o áudio tocando ainda conta, e isso fica como limite.
 */
export function coberturaDoAudio(estado: {
  isPlaying: boolean;
  durationMillis: number;
  positionMillis: number;
  terminou?: boolean;
}): CoberturaInformada {
  const duracao = estado.durationMillis > 0 ? estado.durationMillis / 1000 : null;
  if (estado.terminou && duracao != null) {
    return { midiaDuracaoSeg: duracao, midiaPosicaoMaxSeg: duracao };
  }
  const informe: CoberturaInformada = {};
  if (duracao != null) informe.midiaDuracaoSeg = duracao;
  if (estado.isPlaying && estado.positionMillis >= 0) {
    const posicao = estado.positionMillis / 1000;
    informe.midiaPosicaoMaxSeg = duracao != null ? Math.min(posicao, duracao) : posicao;
  }
  return informe;
}

/** Slides distintos vistos desde que o deck abriu, e o total. */
export function coberturaDosSlides(vistos: ReadonlySet<number>, total: number): CoberturaInformada {
  if (!(total > 0)) return {};
  let dentro = 0;
  vistos.forEach((indice) => {
    if (indice >= 0 && indice < total) dentro += 1;
  });
  return { slidesVistos: dentro, slidesTotal: total };
}

/**
 * As seis colunas, na ordem da API (`COLUNAS_DE_COBERTURA` em `api/app/repositories/telemetria.py`).
 * O caminho direto grava as mesmas.
 */
export const COLUNAS_DE_COBERTURA = [
  "conteudo_altura_px",
  "janela_altura_px",
  "midia_duracao_seg",
  "midia_posicao_max_seg",
  "slides_vistos",
  "slides_total",
] as const;

type ColunaDeCobertura = (typeof COLUNAS_DE_COBERTURA)[number];

/** Só as medidas válidas da entrada. Ausente fica fora da linha e sai nula no banco. */
export function colunasDeCobertura(entry: Partial<Record<ColunaDeCobertura, unknown>>) {
  const linha: Partial<Record<ColunaDeCobertura, number>> = {};
  for (const coluna of COLUNAS_DE_COBERTURA) {
    const valor = medida(entry[coluna]);
    if (valor != null) linha[coluna] = valor;
  }
  return linha;
}

/** A linha sem as colunas de cobertura: para o banco anterior à 20261116_01. */
export function semColunasDeCobertura<T extends Record<string, unknown>>(linha: T): T {
  const copia: Record<string, unknown> = { ...linha };
  for (const coluna of COLUNAS_DE_COBERTURA) delete copia[coluna];
  return copia as T;
}

type Ouvinte = (informe: CoberturaInformada) => void;

let ouvinte: Ouvinte | null = null;

/** Um ouvinte só (o `MetricasContext`). Devolve o cancelamento. */
export function ouvirCobertura(novo: Ouvinte): () => void {
  ouvinte = novo;
  return () => {
    if (ouvinte === novo) ouvinte = null;
  };
}

/** Nunca lança: medir cobertura não pode quebrar o player nem o deck. */
export function informarCobertura(informe: CoberturaInformada) {
  try {
    ouvinte?.(informe);
  } catch {}
}
