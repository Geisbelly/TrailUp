import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

export type ContentNode = {
  block: ContentBlock;
  prev?: ContentNode;
  next?: ContentNode;
};

export function buildLinkedList(blocks: ContentBlock[]): ContentNode | null {
  if (blocks.length === 0) return null;

  let head: ContentNode | undefined;
  let prev: ContentNode | undefined;

  blocks.forEach((b) => {
    const node: ContentNode = { block: b, prev };
    if (prev) prev.next = node;
    if (!head) head = node;
    prev = node;
  });

  return head!;
}
