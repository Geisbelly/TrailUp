import assert from "node:assert/strict";
import { test } from "node:test";
import { generateImmersiveSlideHtml } from "./geminiService";
import { renderImmersiveSlides } from "./geminiService";
import type { ImmersiveSlideInput } from "./geminiService";

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
    { executor: fakeExecutor },
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
    { executor: fakeExecutor },
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
      { executor: fakeExecutor, maxAttempts: 2 },
    ),
    /Falha ao gerar slide imersivo \(slide 1, perfil achiever\)/,
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
    { executor: fakeExecutor, maxAttempts: 3 },
  );

  assert.equal(html, "<section>slide válido</section>");
  assert.equal(calls, 1);
});

test("maxAttempts <= 0 ainda chama o executor exatamente uma vez (guarda Math.max(1, ...))", async () => {
  let calls = 0;
  const fakeExecutor = async () => {
    calls += 1;
    return { html: "<section>slide válido</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    { index: 0, total: 1, contentSummary: "x", profile: "survivor" },
    { executor: fakeExecutor, maxAttempts: -5 },
  );

  assert.equal(html, "<section>slide válido</section>");
  assert.equal(calls, 1);
});

test("realimenta o motivo da rejeição na tentativa seguinte, em vez de repetir o prompt verbatim", async () => {
  const capturedUserTextByAttempt: string[] = [];
  let calls = 0;
  const fakeExecutor = async (params: { contentsParts: any[] }) => {
    calls += 1;
    capturedUserTextByAttempt.push(params.contentsParts.map((p: any) => p.text).join("\n"));
    if (calls === 1) {
      return { html: "<script>fetch('https://evil.example')</script>" };
    }
    return { html: "<section>slide válido</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    { index: 0, total: 1, contentSummary: "x", profile: "conqueror" },
    { executor: fakeExecutor, maxAttempts: 3 },
  );

  assert.equal(html, "<section>slide válido</section>");
  assert.equal(calls, 2);
  assert.doesNotMatch(capturedUserTextByAttempt[0], /tentativa anterior foi rejeitada/);
  assert.match(capturedUserTextByAttempt[1], /tentativa anterior foi rejeitada por:.*fetch/i);
});

test("renderImmersiveSlides gera 1 chamada por slide, na ordem, e monta o deck", async () => {
  const slides = [
    { title: "Slide 1", topics: ["a"], explanation: "exp1", visualDescription: "vd1", characterQuote: "q1", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
    { title: "Slide 2", topics: ["b"], explanation: "exp2", visualDescription: "vd2", characterQuote: "q2", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
  ];
  const calls: Array<{ index: number; contentSummary: string }> = [];
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    calls.push({ index: input.index, contentSummary: input.contentSummary });
    return `<section>slide ${input.index}</section>`;
  };

  const deckHtml = await renderImmersiveSlides(slides, "mastermind", { generateSlideFn: fakeGenerate });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].index, 0);
  assert.equal(calls[1].index, 1);
  assert.match(calls[0].contentSummary, /Slide 1/);
  assert.match(calls[0].contentSummary, /exp1/);
  assert.match(deckHtml, /<iframe/);
});

test("renderImmersiveSlides propaga o erro se qualquer slide falhar (sem deck parcial)", async () => {
  let calls = 0;
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    calls += 1;
    if (input.index === 1) throw new Error("falha simulada no slide 2");
    return `<section>slide ${input.index}</section>`;
  };
  const slides = [
    { title: "Slide 1", topics: [], explanation: "", visualDescription: "", characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
    { title: "Slide 2", topics: [], explanation: "", visualDescription: "", characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
  ];

  await assert.rejects(
    () => renderImmersiveSlides(slides, "seeker", { generateSlideFn: fakeGenerate }),
    /falha simulada no slide 2/,
  );
});

test("renderImmersiveSlides respeita o limite de concorrência informado", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return `<section>${input.index}</section>`;
  };
  const slides = Array.from({ length: 6 }, (_, i) => ({
    title: `Slide ${i}`, topics: [], explanation: "", visualDescription: "",
    characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [],
  }));

  await renderImmersiveSlides(slides, "achiever", { generateSlideFn: fakeGenerate, concurrency: 2 });

  assert.ok(maxInFlight <= 2, `esperava no maximo 2 chamadas simultaneas, teve ${maxInFlight}`);
});
