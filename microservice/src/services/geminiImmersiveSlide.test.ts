import assert from "node:assert/strict";
import { test } from "node:test";
import { generateImmersiveSlideHtml } from "./geminiService";

test("chama o executor com o design token do perfil e o conteúdo do slide no prompt", async () => {
  let capturedSystemInstruction = "";
  let capturedUserText = "";
  const fakeExecutor = async (params: { systemInstruction: string; contentsParts: any[] }) => {
    capturedSystemInstruction = params.systemInstruction;
    capturedUserText = params.contentsParts.map((p: any) => p.text).join("\n");
    return { html: "<section>ok</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    {
      index: 0,
      total: 3,
      contentSummary: "Como o teorema CAP define trade-offs em sistemas distribuídos.",
      profile: "mastermind",
    },
    { executor: fakeExecutor as any },
  );

  assert.equal(html, "<section>ok</section>");
  assert.match(capturedSystemInstruction, /#5b3fd9/i);
  assert.match(capturedUserText, /teorema CAP/);
});

test("passa o HTML do slide anterior como referência de continuidade, quando houver", async () => {
  let capturedUserText = "";
  const fakeExecutor = async (params: { contentsParts: any[] }) => {
    capturedUserText = params.contentsParts.map((p: any) => p.text).join("\n");
    return { html: "<section>ok</section>" };
  };

  await generateImmersiveSlideHtml(
    {
      index: 1,
      total: 3,
      contentSummary: "Consistência eventual.",
      profile: "seeker",
      previousSlideHtml: "<section>slide anterior</section>",
    },
    { executor: fakeExecutor as any },
  );

  assert.match(capturedUserText, /slide anterior/);
});

test("repete a geração se a validação estática falhar, e lança depois de esgotar as tentativas", async () => {
  let calls = 0;
  const fakeExecutor = async () => {
    calls += 1;
    return { html: "<script>fetch('https://evil.example')</script>" };
  };

  await assert.rejects(
    () => generateImmersiveSlideHtml(
      { index: 0, total: 1, contentSummary: "x", profile: "achiever" },
      { executor: fakeExecutor as any, maxAttempts: 2 },
    ),
    /Falha ao gerar slide imersivo/,
  );
  assert.equal(calls, 2);
});

test("aceita na primeira tentativa válida, sem repetir chamadas desnecessárias", async () => {
  let calls = 0;
  const fakeExecutor = async () => {
    calls += 1;
    return { html: "<section>slide válido</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    { index: 0, total: 1, contentSummary: "x", profile: "survivor" },
    { executor: fakeExecutor as any, maxAttempts: 3 },
  );

  assert.equal(html, "<section>slide válido</section>");
  assert.equal(calls, 1);
});
