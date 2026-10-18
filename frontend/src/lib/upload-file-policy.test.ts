import { describe, expect, it } from "vitest";
import {
  getFileExtension,
  isProfessorUploadFileAllowed,
  isQuestionMediaFileAllowed,
  PROFESSOR_UPLOAD_ACCEPT,
  PROFESSOR_UPLOAD_MAX_BYTES,
  QUESTION_MEDIA_ACCEPT,
} from "./upload-file-policy";

const arquivo = (nome: string, tipo = "") => new File(["x"], nome, { type: tipo });

describe("getFileExtension", () => {
  it("pega a última extensão, em minúsculas", () => {
    expect(getFileExtension("Aula 1.PDF")).toBe("pdf");
    expect(getFileExtension("a.b.c.docx")).toBe("docx");
  });
});

describe("isProfessorUploadFileAllowed", () => {
  it.each(["a.pdf", "a.docx", "a.pptx", "a.md", "a.mp3", "a.mov", "A.PDF"])("aceita pela extensão: %s", (nome) => {
    expect(isProfessorUploadFileAllowed(arquivo(nome))).toBe(true);
  });

  it("aceita pelo MIME quando a extensão não ajuda", () => {
    expect(isProfessorUploadFileAllowed(arquivo("sem-extensao.bin", "application/pdf"))).toBe(true);
    expect(isProfessorUploadFileAllowed(arquivo("x.dat", "video/quicktime"))).toBe(true);
  });

  it.each(["a.exe", "a.zip", "a.html", "a.svg", "a.js"])("recusa o que não é material: %s", (nome) => {
    expect(isProfessorUploadFileAllowed(arquivo(nome))).toBe(false);
  });

  it("MIME desconhecido não salva extensão desconhecida", () => {
    expect(isProfessorUploadFileAllowed(arquivo("a.exe", "application/x-msdownload"))).toBe(false);
  });
});

describe("isQuestionMediaFileAllowed", () => {
  it("aceita imagem, áudio, vídeo e pdf por extensão", () => {
    for (const nome of ["a.png", "a.JPG", "a.webp", "a.svg", "a.mp4", "a.wav", "a.pdf"]) {
      expect(isQuestionMediaFileAllowed(arquivo(nome))).toBe(true);
    }
  });

  it("aceita qualquer imagem/áudio/vídeo pelo prefixo do MIME", () => {
    expect(isQuestionMediaFileAllowed(arquivo("foto", "image/avif"))).toBe(true);
    expect(isQuestionMediaFileAllowed(arquivo("faixa", "audio/flac"))).toBe(true);
  });

  it("recusa documento de escritório e executável", () => {
    expect(isQuestionMediaFileAllowed(arquivo("a.docx"))).toBe(false);
    expect(isQuestionMediaFileAllowed(arquivo("a.exe", "application/x-msdownload"))).toBe(false);
  });
});

describe("constantes de interface", () => {
  it("o accept do seletor lista as extensões com ponto", () => {
    expect(PROFESSOR_UPLOAD_ACCEPT.split(",")).toContain(".pdf");
    expect(PROFESSOR_UPLOAD_ACCEPT.split(",").every((e) => e.startsWith("."))).toBe(true);
    expect(QUESTION_MEDIA_ACCEPT).toContain("image/*");
  });

  it("o teto de upload do professor é 200 MB", () => {
    expect(PROFESSOR_UPLOAD_MAX_BYTES).toBe(200 * 1024 * 1024);
  });
});
