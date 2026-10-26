// Fotos e banners do aluno no Storage (#195).
//
// `perfil_fotos` e `banners_fotos` sao PRIVADOS (alembic 20261024_09): a URL
// publica da' 400. O app grava em `alunos.foto_url`/`banner_url` uma REFERENCIA
// `<bucket>/<caminho>` e, na hora de mostrar, troca por uma URL assinada curta
// (ver `imagemPrivada.ts`). URLs antigas do Storage (public/sign/authenticated)
// ainda salvas em clientes velhos sao reconhecidas e assinadas do mesmo jeito.
// Modulo puro (sem React Native) para os testes rodarem no node.

export const BUCKETS_DE_FOTO = ["perfil_fotos", "banners_fotos"] as const;
export type BucketDeFoto = (typeof BUCKETS_DE_FOTO)[number];
export type RefDeImagem = { bucket: BucketDeFoto; caminho: string };

const URL_DO_STORAGE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/(perfil_fotos|banners_fotos)\/([^?#]+)/;

function ehBucketDeFoto(valor: string): valor is BucketDeFoto {
  return (BUCKETS_DE_FOTO as readonly string[]).includes(valor);
}

function decodificar(caminho: string): string | null {
  try {
    const limpo = decodeURIComponent(caminho).replace(/^\/+/, "");
    return limpo && !limpo.split("/").includes("..") ? limpo : null;
  } catch {
    return null;
  }
}

/** Ref `<bucket>/<caminho>` ou URL do Storage de foto/banner -> {bucket, caminho}; senao null. */
export function refDeImagem(valor: unknown): RefDeImagem | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(texto)) {
    // URL (http, file, blob, data...): so' interessa a do Storage de foto.
    const m = URL_DO_STORAGE.exec(texto);
    if (!m || !/^https?:\/\//i.test(texto)) return null;
    const caminho = decodificar(m[2]);
    return caminho ? { bucket: m[1] as BucketDeFoto, caminho } : null;
  }
  const barra = texto.indexOf("/");
  if (barra <= 0) return null;
  const bucket = texto.slice(0, barra);
  if (!ehBucketDeFoto(bucket)) return null;
  const caminho = decodificar(texto.slice(barra + 1).split(/[?#]/)[0]);
  return caminho ? { bucket, caminho } : null;
}

export function textoDaRef(ref: RefDeImagem): string {
  return `${ref.bucket}/${ref.caminho}`;
}

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function extensaoDoMime(mime: string | null | undefined): string {
  const tipo = String(mime ?? "").split(";")[0].trim().toLowerCase();
  return EXTENSOES[tipo] ?? "jpg";
}

/**
 * Nome do objeto no bucket: `<uid>/<timestamp>.<ext>`. A pasta com o uid e' o
 * que as politicas de `storage.objects` checam para deixar o aluno subir,
 * trocar e apagar so' a propria foto.
 */
export function nomeDoArquivoDeFoto(uid: string, mime: string | null | undefined, agora: number): string {
  return `${uid}/${agora}.${extensaoDoMime(mime)}`;
}
