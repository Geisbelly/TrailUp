import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
// `contentBlocks` puxa `supabaseStorage` -> `@/database/supabase` -> `react-native`, que o
// harness do node nao transforma. O dublê entra no cache antes do require, como nos outros
// testes de componente deste repo.
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = {
    id: path, filename: path, loaded: true, exports,
  };
};
mockModule("@/database/supabase", { supabase: { storage: { from: () => ({}) } } });

const { buildContentBlocks, inferBlockType, looksLikeMarkdown } = require("./contentBlocks");

/**
 * O campo que o professor usa para escrever o material É o markdown: no console o tipo
 * "Texto / Artigo" tem rótulo **"Material (Markdown)"**, placeholder `# Digite seu conteúdo
 * aqui...` e o selo "Markdown Suportado" ao lado. Mas ele é gravado com `tipo: "texto"`.
 *
 * `inferBlockType` respeitava o tipo declarado sem olhar o conteúdo, então o aluno lia
 * `# Título` e `1.` crus (#507). A web em tela larga escapava por uma exceção no
 * `ContentRenderer` (#497) — no celular e na web estreita, não.
 */
const MATERIAL_DO_PROFESSOR = [
  "# Revolução Industrial",
  "",
  "1. Primeira fase",
  "2. Segunda fase",
].join("\n");

test("material do professor com markdown vira bloco markdown, nao texto cru", () => {
  assert.equal(inferBlockType({ declaredType: "texto", text: MATERIAL_DO_PROFESSOR }), "markdown");
});

test("prosa continua sendo texto", () => {
  // A guarda e' conservadora de proposito: `looksLikeMarkdown` exige titulo, bloco de codigo
  // ou DOIS sinais diferentes. Texto corrido do professor nao pode virar markdown.
  const prosa = "A Revolucao Industrial comecou na Inglaterra. Teve duas fases distintas.";
  assert.equal(looksLikeMarkdown(prosa), false);
  assert.equal(inferBlockType({ declaredType: "texto", text: prosa }), "texto");
});

test("uma lista numerada sozinha nao basta para virar markdown", () => {
  // Um unico sinal. Se isto passar a devolver "markdown", qualquer enumeracao em prosa
  // comeca a ser renderizada como lista.
  const umSinal = "Os passos sao estes.\n1. comecar pelo inicio";
  assert.equal(inferBlockType({ declaredType: "texto", text: umSinal }), "texto");
});

test("tipo declarado que nao e texto continua mandando", () => {
  // O conteudo de um bloco de video/pdf pode conter '#' sem ser markdown; o tipo declarado
  // desses e' explicito e nao pode ser atropelado.
  for (const declarado of ["video", "pdf", "audio", "imagem", "documento"]) {
    const tipo = inferBlockType({ declaredType: declarado, text: MATERIAL_DO_PROFESSOR });
    assert.notEqual(tipo, "markdown", `${declarado} virou markdown`);
  }
});

test("markdown declarado continua markdown", () => {
  assert.equal(inferBlockType({ declaredType: "markdown", text: "texto simples" }), "markdown");
});

test("de ponta a ponta: o conteudo do professor chega como markdown ao renderizador", () => {
  // Este e' o caminho real: `buildContentBlocks` e' o que a tela do topico chama.
  const blocos = buildContentBlocks({
    tipo: "texto",
    titulo: "Revolução Industrial",
    conteudo: MATERIAL_DO_PROFESSOR,
  });

  assert.equal(blocos.length, 1, "esperava um bloco");
  assert.equal(blocos[0].tipo, "markdown", "o aluno veria a marcacao crua");
});
