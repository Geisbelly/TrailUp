/**
 * Foto de perfil no bucket privado `perfil_fotos` (20261024_09, professor em 20261103_13).
 *
 * A coluna (`professor.foto_url`, `alunos.foto_url`) guarda a REFERENCIA
 * `perfil_fotos/<uid>/<arquivo>`; quem mostra assina na hora. O objeto mora na
 * pasta do uid porque e' isso que as policies de `storage.objects` checam para
 * deixar subir, trocar e apagar so' a propria foto. URL antiga do Storage
 * (public/sign/authenticated), ainda gravada em aluno de app velho, vale pelo
 * caminho dentro dela.
 */

export const BUCKET_DE_FOTO = "perfil_fotos";

/** O limite do bucket depois do fechamento; acima disso o Storage recusa. */
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const TIPOS_DE_FOTO = Object.keys(EXTENSOES);

const URL_DO_STORAGE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/perfil_fotos\/([^?#]+)/;

/** Motivo para recusar o arquivo antes de subir, ou `null` se ele serve. */
export function problemaDaFoto(arquivo: { type: string; size: number }): string | null {
  if (!EXTENSOES[arquivo.type.toLowerCase()]) return "Use uma imagem JPG, PNG, WebP ou GIF.";
  if (arquivo.size > FOTO_MAX_BYTES) return "A foto pode ter no máximo 5 MB.";
  return null;
}

/** Nome do objeto no bucket: `<uid>/<timestamp>.<ext>`. */
export function caminhoDaNovaFoto(uid: string, tipo: string, agora: number): string {
  return `${uid}/${agora}.${EXTENSOES[tipo.toLowerCase()] ?? "jpg"}`;
}

export function refDaFoto(caminho: string): string {
  return `${BUCKET_DE_FOTO}/${caminho}`;
}

function semTraversal(caminho: string): string | null {
  try {
    const limpo = decodeURIComponent(caminho).replace(/^\/+/, "");
    return limpo && !limpo.split("/").includes("..") ? limpo : null;
  } catch {
    return null;
  }
}

/** Caminho do objeto em `perfil_fotos` a partir da referencia ou URL antiga; senao `null`. */
export function caminhoDaFoto(valor: string | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (/^https?:\/\//i.test(texto)) {
    const achado = URL_DO_STORAGE.exec(texto);
    return achado ? semTraversal(achado[1]) : null;
  }
  if (!texto.startsWith(`${BUCKET_DE_FOTO}/`)) return null;
  return semTraversal(texto.slice(BUCKET_DE_FOTO.length + 1).split(/[?#]/)[0]);
}
