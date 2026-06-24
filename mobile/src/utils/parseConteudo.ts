import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { buildContentBlocks } from "./contentBlocks";

export function parseConteudo(atual: any): ContentBlock[] {
  return buildContentBlocks(atual);
}
