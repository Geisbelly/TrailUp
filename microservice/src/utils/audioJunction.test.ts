import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audioSegmentsFromChapters,
  cleanAudioScript,
  DEFAULT_AUDIO_JUNCTION_CONFIG,
  joinAudioBlocks,
  resolveAudioJunctionConfig,
} from "./audioJunction";

const frase = (n: number) => `Frase número ${n} sobre frações, com numerador e denominador explicados com calma.`;
const paragrafo = (inicio: number, frases: number) =>
  Array.from({ length: frases }, (_, i) => frase(inicio + i)).join(" ");

test("tag de tom sozinha na linha vai para a fala seguinte, e tag sem fala no fim sai (Daredevil, turma 66)", () => {
  const roteiro = "Saudações! Preparado?\n\n[Tom: Focado e Pragmático]\nAgora, vamos ao cerne da missão.\n\n[Tom: Entusiasmado e Didático]";
  assert.equal(
    cleanAudioScript(roteiro),
    "Saudações! Preparado?\n\n[Tom: Focado e Pragmático] Agora, vamos ao cerne da missão.",
  );
});

test("título, ênfase e marcador de lista do markdown não chegam ao TTS; passo numerado fica", () => {
  const roteiro = "## Isolando o x\nA estrutura *ax + b = 0* é a **regra**.\n- primeiro item\n1. Subtraia 7.";
  assert.equal(cleanAudioScript(roteiro), "A estrutura ax + b = 0 é a regra. primeiro item 1. Subtraia 7.");
});

test("diálogo: sem tags, e linha sem 'Nome:' cola na fala anterior (Socializer, turma 68)", () => {
  const roteiro = "Mateo: Sabe, Zuri, a origem da palavra fração é muito inte\nressante, vinda do latim!\n[Tom: Alegre]\nZuri: Sim, Mateo!";
  assert.equal(
    cleanAudioScript(roteiro, { speakers: ["Mateo", "Zuri"] }),
    "Mateo: Sabe, Zuri, a origem da palavra fração é muito inte ressante, vinda do latim!\nZuri: Sim, Mateo!",
  );
});

test("a junção junta seções pequenas em partes perto do alvo, sem passar do teto", () => {
  // 8 seções de ~1.700 caracteres: o caminho antigo dava 8 chamadas de TTS.
  const segments = Array.from({ length: 8 }, (_, i) => ({
    titulo: `Seção ${i + 1}`,
    audioScript: `## Seção ${i + 1}\n${paragrafo(i * 20, 20)}`,
  }));
  const parts = joinAudioBlocks(segments);
  assert.ok(parts.length < 8, `esperava menos de 8 partes, saíram ${parts.length}`);
  for (const part of parts) {
    assert.ok(part.audioScript.length <= DEFAULT_AUDIO_JUNCTION_CONFIG.maxChars);
    assert.ok(!part.audioScript.includes("##"));
  }
  assert.deepEqual(parts.map((p) => p.ordem), parts.map((_, i) => i + 1));
  assert.equal(parts[0].titulo, "Seção 1");
  // Nada se perde e a ordem se mantém.
  const juntado = parts.map((p) => p.audioScript).join("\n\n");
  for (let i = 0; i < 160; i += 1) assert.ok(juntado.includes(frase(i)), `sumiu a frase ${i}`);
  assert.ok(juntado.indexOf(frase(0)) < juntado.indexOf(frase(159)));
});

test("seção maior que o teto é dividida entre frases, nunca no meio da palavra, e o tom continua", () => {
  const longa = `[Tom: Calculista e pausado] ${paragrafo(0, 120)}`;
  const parts = joinAudioBlocks([{ titulo: "Longa", audioScript: longa }], { targetChars: 1_500, maxChars: 2_000, minChars: 500 });
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(part.audioScript.length <= 2_000);
    assert.match(part.audioScript, /^\[Tom: Calculista e pausado\] Frase número \d+/);
    assert.match(part.audioScript, /calma\.$/);
  }
});

test("parte final curta vira o fim da anterior quando cabe no teto", () => {
  const parts = joinAudioBlocks(
    [
      { titulo: "A", audioScript: paragrafo(0, 40) },
      { titulo: "B", audioScript: frase(99) },
    ],
    { targetChars: 3_000, maxChars: 4_500, minChars: 1_200 },
  );
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].sectionBoundaries.map((b) => b.title), ["A", "B"]);
  const b = parts[0].sectionBoundaries[1];
  assert.equal(parts[0].audioScript.slice(b.charStart, b.charEnd), frase(99));
});

test("a abertura antes do primeiro marcador não se perde (Socializer, turma 66)", () => {
  const segments = audioSegmentsFromChapters([
    {
      markdown: "## Introdução às Equações\n\ntexto",
      audioScript: "Mateo: Saudações, viajante!\n## Introdução às Equações\nZuri: Uma equação é uma igualdade.\n## Isolando o x\nMateo: Agora isolamos o x.",
    },
    { markdown: "## Prática\n\ntexto", audioScript: "Mateo: Hora da prática." },
  ]);
  assert.deepEqual(segments.map((s) => s.titulo), ["Introdução às Equações", "Isolando o x", "Prática"]);
  assert.match(segments[0].audioScript, /^Mateo: Saudações, viajante!/);
  assert.match(segments[0].audioScript, /Zuri: Uma equação é uma igualdade\./);
});

test("resolveAudioJunctionConfig: padrão, teto acima de 6.000 recusado e alvo nunca acima do teto", () => {
  assert.deepEqual(resolveAudioJunctionConfig({}), DEFAULT_AUDIO_JUNCTION_CONFIG);
  assert.equal(resolveAudioJunctionConfig({ AUDIO_JUNCTION_MAX_CHARS: "9000" }).maxChars, 4_500);
  const baixo = resolveAudioJunctionConfig({ AUDIO_JUNCTION_MAX_CHARS: "2000", AUDIO_JUNCTION_TARGET_CHARS: "3000" });
  assert.equal(baixo.maxChars, 2_000);
  assert.equal(baixo.targetChars, 2_000);
});
