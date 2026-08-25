// Camada 2 da adaptacao da imagem ao perfil: reilustrar a imagem do professor
// no clima do Guardiao (paleta e ambiente do perfil).
//
// A camada 1 (moldura na estetica do perfil, em frontend/src/lib/
// profileImageFrame.ts) continua valendo sempre e nao custa nada. ESTA custa:
// e uma chamada de geracao de imagem por imagem, e o pipeline roda uma vez por
// perfil - entao um material com 3 imagens sao 21 geracoes pra cobrir os 7
// perfis. Por isso vem DESLIGADA por padrao e com teto por material.
//
// Regras que evitam gastar a toa:
//   - ligada por padrao, com PROFILE_IMAGE_RESTYLE=0 como valvula de corte;
//   - teto por material, pra material com muita imagem nao virar fatura;
//   - GIF nunca entra: o modelo devolve imagem estatica e a animacao - que e
//     justamente o conteudo - se perderia. Nesse caso so a moldura se aplica;
//   - cota estourada interrompe o resto do material, em vez de insistir imagem
//     por imagem numa chamada fadada a falhar.

import { BRAIN_HEX_CONFIG, type BrainHexProfile } from "../constants/brainHex";

export const DEFAULT_MAX_RESTYLES_PER_MATERIAL = 2;
const TETO_ABSOLUTO = 12;

/**
 * LIGADA por padrao (decisao do usuario em 2026-08-24, ciente do custo).
 * PROFILE_IMAGE_RESTYLE=0 (ou false/off) desliga sem precisar de deploy de
 * codigo - e a valvula pra fechar rapido se a cota apertar.
 */
export function isRestyleEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const bruto = String(environment.PROFILE_IMAGE_RESTYLE ?? "").trim().toLowerCase();
  if (bruto === "0" || bruto === "false" || bruto === "off") return false;
  return true;
}

export function maxRestylesPerMaterial(
  environment: Record<string, string | undefined> = process.env,
): number {
  const bruto = Number(environment.PROFILE_IMAGE_RESTYLE_MAX ?? DEFAULT_MAX_RESTYLES_PER_MATERIAL);
  if (!Number.isFinite(bruto) || bruto <= 0) return DEFAULT_MAX_RESTYLES_PER_MATERIAL;
  return Math.min(Math.floor(bruto), TETO_ABSOLUTO);
}

/**
 * GIF fica de fora: a reilustracao devolve imagem estatica, e num gif a
 * animacao costuma SER o conteudo (um fluxo se desenhando, um passo a passo).
 * Perder isso pra ganhar paleta e um mau negocio.
 */
export function podeReilustrar(mimeType: string | undefined | null): boolean {
  const normalizado = String(mimeType ?? "").trim().toLowerCase();
  if (!normalizado.startsWith("image/")) return false;
  return normalizado !== "image/gif";
}

/**
 * Quantas imagens desta lista entram na reilustracao, respeitando o teto e
 * pulando as que nao podem. Devolve os INDICES, pra quem chama saber
 * exatamente o que trocar.
 */
export function selecionarParaReilustrar(
  imagens: Array<{ mimeType?: string | null }>,
  environment: Record<string, string | undefined> = process.env,
): number[] {
  if (!isRestyleEnabled(environment)) return [];
  const teto = maxRestylesPerMaterial(environment);
  const escolhidos: number[] = [];
  imagens.forEach((imagem, indice) => {
    if (escolhidos.length >= teto) return;
    if (!podeReilustrar(imagem.mimeType)) return;
    escolhidos.push(indice);
  });
  return escolhidos;
}

/**
 * Prompt de reilustracao no clima do perfil. Manda preservar o CONTEUDO
 * tecnico da imagem: o objetivo e a imagem parecer parte do material daquele
 * perfil, nao virar outra coisa - se o diagrama mudar de significado, a
 * personalizacao destruiu o material em vez de adapta-lo.
 */
export function buildRestylePrompt(
  profile: BrainHexProfile,
  contexto?: { topico?: string; assunto?: string },
): string {
  const config = BRAIN_HEX_CONFIG[profile];
  const assunto = contexto?.assunto || contexto?.topico || "o conteúdo da aula";

  return (
    `Reestilize esta imagem educativa mantendo RIGOROSAMENTE o mesmo conteúdo: ` +
    `os mesmos elementos, o mesmo diagrama, os mesmos rótulos e o mesmo significado técnico sobre ${assunto}. ` +
    `Não invente, não remova e não troque nenhum elemento. ` +
    `Mude apenas a linguagem visual, adaptando-a ao perfil "${config.label}" (guardião ${config.guideName}): ` +
    `paleta ancorada em ${config.color}, iluminação e atmosfera coerentes com "${config.description}". ` +
    `Traços limpos, alto contraste, legível como material de estudo, sem poluição visual e sem texto ilegível.`
  );
}

// --- Execucao -------------------------------------------------------------

/** Imagem do professor como o pipeline a carrega. */
export interface RestylableImage {
  data: string;
  mimeType: string;
  url?: string;
  name?: string;
  sourceText?: string;
  sourceOrder?: number;
}

export type ImageRestyler = (params: {
  dataBase64: string;
  mimeType: string;
  prompt: string;
}) => Promise<{ data: string; mimeType: string } | null>;

export interface RestyleOutcome {
  /** A lista com as imagens reilustradas trocadas no lugar das originais. */
  imagens: RestylableImage[];
  /** Quantas foram efetivamente trocadas. */
  reilustradas: number;
  /** Motivo de ter parado antes do teto, quando parou. */
  interrompidoPor?: "cota" | "erro";
}

function pareceCotaEsgotada(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? "");
  return /429|quota|RESOURCE_EXHAUSTED|rate limit/i.test(mensagem);
}

/**
 * Reilustra as imagens elegiveis no clima do perfil, respeitando a politica.
 *
 * O gerador entra injetado pra esta orquestracao ser testavel sem rede - e
 * porque quem sabe falar com o Gemini e o geminiService, nao este modulo.
 *
 * Falha em uma imagem NUNCA derruba o material: a original fica no lugar (e a
 * moldura do perfil, camada 1, continua valendo pra ela). Cota esgotada
 * interrompe o resto do material - insistir imagem por imagem numa chamada
 * fadada a falhar so queima o que sobrou da cota, que foi exatamente o laco
 * que derrubou a geracao em producao.
 */
export async function applyProfileRestyle(
  imagens: RestylableImage[],
  options: {
    profile: BrainHexProfile;
    restyle: ImageRestyler;
    assunto?: string;
    environment?: Record<string, string | undefined>;
    onAviso?: (mensagem: string, detalhe?: unknown) => void;
  },
): Promise<RestyleOutcome> {
  const { profile, restyle, assunto, environment = process.env, onAviso } = options;

  const alvos = selecionarParaReilustrar(imagens, environment);
  if (alvos.length === 0) return { imagens, reilustradas: 0 };

  const resultado = [...imagens];
  const prompt = buildRestylePrompt(profile, { assunto });
  let reilustradas = 0;
  let interrompidoPor: RestyleOutcome["interrompidoPor"];

  for (const indice of alvos) {
    const original = resultado[indice];
    try {
      const nova = await restyle({
        dataBase64: original.data,
        mimeType: original.mimeType,
        prompt,
      });
      if (!nova?.data) {
        onAviso?.(`reilustracao devolveu vazio (imagem ${indice + 1})`);
        continue;
      }
      resultado[indice] = {
        ...original,
        data: nova.data,
        mimeType: nova.mimeType,
        // A url identifica a imagem no markdown; trocar os bytes sem trocar a
        // url deixaria o documento apontando pro conteudo antigo.
        ...(original.url ? { url: `data:${nova.mimeType};base64,${nova.data}` } : {}),
      };
      reilustradas += 1;
    } catch (erro) {
      onAviso?.(`falha ao reilustrar imagem ${indice + 1}`, erro);
      if (pareceCotaEsgotada(erro)) {
        interrompidoPor = "cota";
        break;
      }
      interrompidoPor = "erro";
    }
  }

  return { imagens: resultado, reilustradas, ...(interrompidoPor ? { interrompidoPor } : {}) };
}
