import { extensaoDe } from "./arquivosParaIa";
import type { ConteudoFile } from "./types";
import { videoDoConteudo } from "./videoDoConteudo";

/**
 * O que "Sugerir cards e atividades" manda à IA além do texto, para as
 * questões saírem do material e não só do título do conteúdo:
 *
 * - vídeo do YouTube: o link, que o Gemini assiste (outros vídeos ele não abre);
 * - link externo: o endereço, que a edge function lê;
 * - PDF, PPTX e DOCX do conteúdo: os arquivos, lidos como na geração da trilha
 *   (`prepararAnexos`). TXT e MD continuam indo como texto em `fileContents`.
 */

/** Arquivos por pedido: mais que isso não cabe no limite de 10 MB nem na atenção do modelo. */
export const MAX_ARQUIVOS_POR_CONTEUDO = 5;

const BINARIOS_LIDOS = new Set(["pdf", "pptx", "docx"]);

export const ehArquivoParaAnexar = (nome: string) => BINARIOS_LIDOS.has(extensaoDe(nome));

export function enderecosDoConteudo(tipo: string, corpo: string): { videoUrl?: string; linkUrl?: string } {
  const texto = corpo.trim();
  if (tipo === "video") {
    const video = videoDoConteudo(texto);
    return video?.tipo === "youtube" ? { videoUrl: `https://www.youtube.com/watch?v=${video.id}` } : {};
  }
  if (tipo === "link" && /^https?:\/\/\S+$/i.test(texto)) return { linkUrl: texto };
  return {};
}

/**
 * Os arquivos binários do conteúdo como `File`: os já enviados (baixados por
 * `baixar`) e os que ainda estão só no formulário. Arquivo que não baixa fica
 * de fora — a geração segue com o resto.
 */
export async function arquivosParaAnexar(
  salvos: ConteudoFile[],
  pendentes: File[],
  baixar: (caminhoOuUrl: string) => Promise<Blob | null>,
): Promise<File[]> {
  const arquivos: File[] = pendentes.filter((arquivo) => ehArquivoParaAnexar(arquivo.name));
  for (const salvo of salvos) {
    if (arquivos.length >= MAX_ARQUIVOS_POR_CONTEUDO) break;
    const nome = salvo.name?.trim() || salvo.path.split("/").pop() || "arquivo";
    if (!ehArquivoParaAnexar(nome)) continue;
    try {
      const blob = await baixar(salvo.path);
      if (blob) arquivos.push(new File([blob], nome, { type: blob.type }));
    } catch (erro) {
      console.warn(`[ia] não deu para baixar ${nome} para a IA:`, erro);
    }
  }
  return arquivos.slice(0, MAX_ARQUIVOS_POR_CONTEUDO);
}
