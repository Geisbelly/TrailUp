// Variante web de nativeDocumentParsers.native.ts (resolvida pelo Metro so
// para esta plataforma). DocumentBlock nunca chama parseDocxBlocks/
// parsePptxSlides na web -- isNativeLocalReader exige Platform.OS !== "web" --
// entao aqui e so contrato de tipos, sem puxar mammoth/jszip/fast-xml-parser/
// node-html-parser pro bundle web (~4,75 MB de JS antes desta divisao,
// issue #29).

export type NativeDocBlock =
  | {
      type: "heading";
      level: number;
      text: string;
    }
  | {
      type: "paragraph" | "quote";
      text: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "image";
      src: string;
      alt?: string | null;
    }
  | {
      type: "table";
      rows: string[][];
    };

export type NativePptxSlideElement =
  | {
      type: "text";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      text: string;
      fontSize: number;
      align: "left" | "center" | "right";
      bold?: boolean;
      color?: string | null;
    }
  | {
      type: "image";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      src: string;
    }
  | {
      type: "shape";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      fillColor?: string | null;
      strokeColor?: string | null;
      strokeWidth?: number;
      opacity?: number;
      radius?: number;
    };

export type NativePptxSlide = {
  id: string;
  width: number;
  height: number;
  backgroundColor?: string | null;
  elements: NativePptxSlideElement[];
};

export async function parseDocxBlocks(_localUri: string): Promise<NativeDocBlock[]> {
  throw new Error("parseDocxBlocks nao esta disponivel na web (leitor nativo e so mobile).");
}

export async function parsePptxSlides(_localUri: string): Promise<NativePptxSlide[]> {
  throw new Error("parsePptxSlides nao esta disponivel na web (leitor nativo e so mobile).");
}
