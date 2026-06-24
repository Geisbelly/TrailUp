import { ContentBlock } from "./IContentBlock";

export type ContentNode = {
  block: ContentBlock;
  prev?: ContentNode;
  next?: ContentNode;
};
