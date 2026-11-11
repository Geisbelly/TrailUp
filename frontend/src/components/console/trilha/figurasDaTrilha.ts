/**
 * Figuras do material dentro do texto gerado pela IA.
 *
 * A IA marca, numa linha sozinha, `{{figura:A1#p3|legenda}}` (página 3 do PDF
 * A1) ou `{{figura:A2#i4|legenda}}` (imagem 4 do PPTX/DOCX A2) — ver
 * `supabase/functions/generate-content-ai/anexosDaTrilha.ts`. Ao aplicar a
 * trilha, o console gera a imagem (a página do PDF vira PNG; a imagem do PPTX
 * vai como está), sobe no bucket `conteudos` e troca o marcador por
 * `![legenda](url)`, que o markdown do app do aluno já desenha. Sem o arquivo
 * na tela (rascunho retomado em outra sessão) ou com falha no envio, o
 * marcador some: figura quebrada é pior que figura nenhuma.
 */

const MARCADOR = /\{\{figura:([^|}]+)(?:\|([^}]*))?\}\}/g;

export type RefDeFigura =
  | { tipo: "pagina"; anexo: string; pagina: number; ref: string }
  | { tipo: "imagem"; anexo: string; ref: string };

export function lerRef(bruta: string): RefDeFigura | null {
  const ref = bruta.trim();
  const pagina = /^(A\d{1,3})#p(\d{1,4})$/.exec(ref);
  if (pagina) return Number(pagina[2]) >= 1 ? { tipo: "pagina", anexo: pagina[1], pagina: Number(pagina[2]), ref } : null;
  const imagem = /^(A\d{1,3})#i\d{1,4}$/.exec(ref);
  return imagem ? { tipo: "imagem", anexo: imagem[1], ref } : null;
}

/** As referências distintas do texto, na ordem em que aparecem. */
export function refsDoTexto(texto: string): RefDeFigura[] {
  const vistas = new Map<string, RefDeFigura>();
  for (const m of texto.matchAll(MARCADOR)) {
    const ref = lerRef(m[1]);
    if (ref && !vistas.has(ref.ref)) vistas.set(ref.ref, ref);
  }
  return [...vistas.values()];
}

const legendaLimpa = (legenda: string | undefined) =>
  (legenda ?? "").replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim() || "Figura do material";

/**
 * Troca cada marcador pela imagem que `urlDe` devolver (uma vez por
 * referência, mesmo que apareça em vários conteúdos, se `urlDe` guardar o
 * resultado) e apaga os que ficaram sem imagem.
 */
export async function trocarFiguras(texto: string, urlDe: (ref: RefDeFigura) => Promise<string | null>): Promise<string> {
  if (!texto.includes("{{figura:")) return texto;
  const urls = new Map<string, string | null>();
  for (const ref of refsDoTexto(texto)) {
    try {
      urls.set(ref.ref, await urlDe(ref));
    } catch {
      urls.set(ref.ref, null);
    }
  }
  return texto
    .replace(MARCADOR, (_, bruta: string, legenda?: string) => {
      const url = urls.get(bruta.trim());
      return url ? `![${legendaLimpa(legenda)}](${url})` : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Guarda o resultado por referência: a mesma figura em dois conteúdos sobe uma vez. */
export function comMemoria(urlDe: (ref: RefDeFigura) => Promise<string | null>) {
  const memoria = new Map<string, Promise<string | null>>();
  return (ref: RefDeFigura) => {
    let promessa = memoria.get(ref.ref);
    if (!promessa) {
      promessa = urlDe(ref).catch(() => null);
      memoria.set(ref.ref, promessa);
    }
    return promessa;
  };
}
