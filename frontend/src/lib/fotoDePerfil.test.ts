import { describe, expect, it } from "vitest";
import { caminhoDaFoto, caminhoDaNovaFoto, FOTO_MAX_BYTES, problemaDaFoto, refDaFoto } from "./fotoDePerfil";

const UID = "0b8f5d4e-1a2b-4c3d-8e9f-0123456789ab";

describe("foto de perfil", () => {
  it("aceita imagem até 5 MB e recusa o resto", () => {
    expect(problemaDaFoto({ type: "image/png", size: 1024 })).toBeNull();
    expect(problemaDaFoto({ type: "IMAGE/JPEG", size: FOTO_MAX_BYTES })).toBeNull();
    expect(problemaDaFoto({ type: "image/png", size: FOTO_MAX_BYTES + 1 })).toMatch(/5 MB/);
    expect(problemaDaFoto({ type: "application/pdf", size: 10 })).toMatch(/JPG/);
    expect(problemaDaFoto({ type: "image/svg+xml", size: 10 })).toMatch(/JPG/);
  });

  it("sobe na pasta do próprio uid e grava a referência do bucket", () => {
    const caminho = caminhoDaNovaFoto(UID, "image/webp", 1700000000000);
    expect(caminho).toBe(`${UID}/1700000000000.webp`);
    expect(refDaFoto(caminho)).toBe(`perfil_fotos/${UID}/1700000000000.webp`);
  });

  it("lê a referência e a URL antiga do Storage", () => {
    expect(caminhoDaFoto(`perfil_fotos/${UID}/1.jpg`)).toBe(`${UID}/1.jpg`);
    expect(caminhoDaFoto(`https://x.supabase.co/storage/v1/object/public/perfil_fotos/${UID}-1.jpg?t=1`)).toBe(`${UID}-1.jpg`);
    expect(caminhoDaFoto(`https://x.supabase.co/storage/v1/object/sign/perfil_fotos/${UID}/2.png?token=a`)).toBe(`${UID}/2.png`);
  });

  it("ignora vazio, outro bucket, link externo e caminho com ..", () => {
    expect(caminhoDaFoto(null)).toBeNull();
    expect(caminhoDaFoto("")).toBeNull();
    expect(caminhoDaFoto(`banners_fotos/${UID}/1.jpg`)).toBeNull();
    expect(caminhoDaFoto("https://lh3.googleusercontent.com/a/foto")).toBeNull();
    expect(caminhoDaFoto("perfil_fotos/../outro/1.jpg")).toBeNull();
  });
});
