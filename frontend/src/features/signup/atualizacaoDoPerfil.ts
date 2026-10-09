/**
 * Atualizacao do perfil por evidencia comportamental.
 *
 * CORRECAO DE DESENHO. A primeira versao do spec tinha "piso de evidencia"
 * (abaixo de N sessoes o posterior nao se move) e "teto de deslocamento"
 * (a afinidade muda no maximo X por ciclo). Os dois eram muletas:
 *
 * - o piso existia porque a atualizacao nao estava formulada direito. Numa
 *   combinacao ponderada por PRECISAO, "pouco dado quase nao move o posterior"
 *   nao e' regra que se escreve: com zero observacao o posterior e' EXATAMENTE
 *   o prior, por construcao. O piso so' escondia a formulacao errada;
 * - o teto misturava custo com inferencia. "Regerar midia e' caro" e' verdade,
 *   mas o lugar de tratar isso e' em QUEM CONSOME o perfil (so' regera quando o
 *   dominante muda E a confianca e' alta), nao distorcendo a estimativa.
 *
 * Consequencia pratica: isto NAO depende de volume de telemetria para existir.
 * Funciona com zero observacoes (devolve o prior intacto), com tres (mal se
 * move) e com trezentas (domina o prior). O que depende de dado e' VALIDAR se
 * os indicadores preveem bem — e isso e' calibrar peso, nao poder implementar.
 *
 * MATEMATICA. Confianca e precisao sao a mesma coisa em unidades diferentes:
 *
 *     tau = c / (1 - c)        c = tau / (1 + tau)
 *
 * Com isso, combinar evidencias e' somar precisoes, e a confianca posterior sai
 * da mesma conta — nao e' um numero inventado ao lado da estimativa.
 */

import type { BrainHexProfileKey } from "./brainhex";
import { PERFIS_EM_ORDEM } from "./brainhexOrdenacao";

/** Uma evidencia sobre um perfil, com o tanto de dado que a sustenta. */
export type Observacao = {
  perfil: BrainHexProfileKey;
  /** Na mesma unidade centrada do prior: positivo = acima do tipico. */
  valor: number;
  /** Quantas unidades de dado sustentam este valor (sessoes, tentativas...). */
  n: number;
  /** De onde veio, para a decisao ser auditavel depois. */
  indicador: string;
  /**
   * Quanto UMA unidade deste indicador vale em precisao. E' o parametro a
   * calibrar quando houver dado; ate la' fica explicito e igual para todos, em
   * vez de escondido num peso arbitrario.
   */
  pesoPorUnidade?: number;
};

export type EstadoDoPerfil = {
  afinidade: Record<BrainHexProfileKey, number>;
  /** 0..1 */
  confianca: number;
};

export type Atualizacao = EstadoDoPerfil & {
  /** Quanto cada perfil se moveu, e por causa de que. */
  movimento: Record<string, { de: number; para: number; evidencias: string[] }>;
};

const PESO_PADRAO_POR_UNIDADE = 0.05;

/** Confianca -> precisao. c=0 => 0; c->1 => infinito. */
export function precisaoDe(confianca: number): number {
  const c = Math.min(0.999, Math.max(0, Number(confianca) || 0));
  return c / (1 - c);
}

/** Precisao -> confianca. Inversa exata de `precisaoDe`. */
export function confiancaDe(precisao: number): number {
  const tau = Math.max(0, Number(precisao) || 0);
  return tau / (1 + tau);
}

/**
 * Posterior = media das fontes ponderada por precisao.
 *
 * Nao ha' piso nem teto. Com `observacoes` vazio, cada perfil recebe
 * `tau_obs = 0` e a conta devolve o prior sem alteracao — nao porque uma regra
 * mandou, mas porque e' o resultado.
 */
export function atualizarPerfil(params: {
  prior: EstadoDoPerfil;
  observacoes: readonly Observacao[];
}): Atualizacao {
  const { prior } = params;
  const tauPrior = precisaoDe(prior.confianca);

  const porPerfil = new Map<string, Observacao[]>();
  for (const obs of params.observacoes) {
    if (!Number.isFinite(obs.valor) || !Number.isFinite(obs.n) || obs.n <= 0) continue;
    const lista = porPerfil.get(obs.perfil) ?? [];
    lista.push(obs);
    porPerfil.set(obs.perfil, lista);
  }

  const afinidade = {} as Record<BrainHexProfileKey, number>;
  const movimento: Atualizacao["movimento"] = {};
  let tauTotalAcumulado = 0;

  for (const perfil of PERFIS_EM_ORDEM) {
    const mu0 = Number(prior.afinidade[perfil] ?? 0);
    const evidencias = porPerfil.get(perfil) ?? [];

    let somaTau = 0;
    let somaTauMu = 0;
    for (const obs of evidencias) {
      const tau = obs.n * (obs.pesoPorUnidade ?? PESO_PADRAO_POR_UNIDADE);
      somaTau += tau;
      somaTauMu += tau * obs.valor;
    }

    const denominador = tauPrior + somaTau;
    const posterior = denominador === 0 ? mu0 : (tauPrior * mu0 + somaTauMu) / denominador;

    afinidade[perfil] = posterior;
    tauTotalAcumulado += somaTau;
    if (evidencias.length > 0) {
      movimento[perfil] = {
        de: mu0,
        para: posterior,
        evidencias: evidencias.map((e) => `${e.indicador} (n=${e.n})`),
      };
    }
  }

  // A confianca posterior sai da MESMA conta: precisao do prior mais a
  // precisao media por perfil que a evidencia acrescentou. Nao e' um numero
  // escolhido ao lado da estimativa.
  const tauMedioAcrescentado = tauTotalAcumulado / PERFIS_EM_ORDEM.length;
  return {
    afinidade,
    confianca: confiancaDe(tauPrior + tauMedioAcrescentado),
    movimento,
  };
}
