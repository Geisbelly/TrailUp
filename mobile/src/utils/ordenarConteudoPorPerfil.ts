import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { orderContentBlocksByMode } from "@/utils/presentationOrder";

export function ordenarConteudoPorPerfil(
  blocks: ContentBlock[],
  userPerfil: string
) {
  if (userPerfil === "visual") {
    return orderContentBlocksByMode(blocks, { modo: "atividade_primeiro" });
  }

  if (userPerfil === "leitor") {
    return orderContentBlocksByMode(blocks, { modo: "conteudo_primeiro" });
  }

  return orderContentBlocksByMode(blocks, { modo: "misto" });
}
