import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: {} },
};

const { normalizePersonalizedTopicPayload } =
  require("@/utils/personalization") as typeof import("@/utils/personalization");

// Reproduz o estado real do material 3832 (classe 54, topico 131, conqueror):
// audio marcado como gerado, mas com arquivo_url/storage_path nulos em todas
// as partes porque a geracao falhou.
const audioSemArquivo = {
  bucket: "conteudo_aluno",
  payload: {
    roteiro: "[Tom: Majestoso e Firme] Saudacoes, guerreiro da computacao.",
    duracao_estimada_seg: 180,
  },
  partes: [
    { ordem: 1, titulo: "Conceito de Sistema Distribuido", arquivo_url: null, storage_path: null },
    { ordem: 2, titulo: "Arquitetura SIMD", arquivo_url: null, storage_path: null },
  ],
};

function normalizar(materiais: Record<string, unknown>) {
  return normalizePersonalizedTopicPayload({
    record: { id: 3832, conteudo_id: 192, materiais },
    classeId: 54,
    topicoId: 131,
  } as never);
}

test("audio sem arquivo nao vira bloco de texto com o roteiro do TTS", () => {
  const payload = normalizar({ audio: audioSemArquivo });
  const blocos = [...(payload.primaryBlocks ?? []), ...(payload.fallbackBlocks ?? [])];

  const titulos = blocos.map((b) => {
    const bloco = b as { title?: unknown; payload?: { title?: unknown } };
    return String(bloco.title ?? bloco.payload?.title ?? "");
  });
  assert.equal(
    titulos.some((t) => t.includes("Roteiro guiado")),
    false,
    `o roteiro do TTS nao pode virar conteudo; blocos: ${JSON.stringify(titulos)}`
  );
  assert.equal(
    titulos.some((t) => t.includes("Áudio personalizado")),
    false,
    "sem arquivo reproduzivel o material de audio nao entra na trilha"
  );

  const serializado = JSON.stringify(blocos);
  assert.equal(
    serializado.includes("[Tom:"),
    false,
    "marcacao de direcao de voz nao pode chegar ao aluno"
  );
});

test("o markdown legitimo continua entrando normalmente", () => {
  const payload = normalizar({
    audio: audioSemArquivo,
    markdown: { payload: { texto: "# Conteudo real\n\nTexto de estudo." } },
  });
  const serializado = JSON.stringify([
    ...(payload.primaryBlocks ?? []),
    ...(payload.fallbackBlocks ?? []),
  ]);
  assert.equal(serializado.includes("Conteudo real"), true);
  assert.equal(serializado.includes("Roteiro guiado"), false);
});
