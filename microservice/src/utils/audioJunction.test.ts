import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audioSegmentsFromChapters,
  cleanAudioScript,
  AUDIO_JUNCTION_CONFIG_POR_PERFIL,
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

test("um áudio por bloco: blocos de tamanho normal não são empacotados juntos só porque cabem", () => {
  // 8 blocos de ~1.700 caracteres, todos do mesmo tópico: o caminho por
  // tamanho dava 4 partes; agora cada bloco é o seu áudio.
  const segments = audioSegmentsFromChapters(
    Array.from({ length: 8 }, (_, i) => ({
      blockId: `b${i + 1}`,
      markdown: `## Bloco ${i + 1}`,
      audioScript: `## Seção ${i + 1}\n${paragrafo(i * 20, 20)}`,
      topico: "Frações",
    })),
  );
  const parts = joinAudioBlocks(segments);
  assert.equal(parts.length, 8);
  assert.deepEqual(parts.map((p) => p.titulo), Array.from({ length: 8 }, (_, i) => `Bloco ${i + 1}`));
  for (const part of parts) {
    assert.ok(part.audioScript.length <= DEFAULT_AUDIO_JUNCTION_CONFIG.maxChars);
    assert.ok(!part.audioScript.includes("##"));
  }
  const juntado = parts.map((p) => p.audioScript).join("\n\n");
  for (let i = 0; i < 160; i += 1) assert.ok(juntado.includes(frase(i)), `sumiu a frase ${i}`);
  assert.ok(juntado.indexOf(frase(0)) < juntado.indexOf(frase(159)));
});

test("socializer do conteúdo 282: 8 blocos curtos de tópicos diferentes não viram 2 áudios", () => {
  // Medido em 03/11: ~4.500 caracteres de diálogo em 8 blocos saíam em 2
  // partes. Cada bloco tem o seu tópico, então nenhum continua o outro.
  const topicos = ["Partilha", "Notação", "Medição", "Comparar", "Representação", "Síntese", "Numerador", "Partes"];
  const fala = (i: number) => `Mateo: ${frase(i)} ${frase(i + 100)}\nZuri: ${frase(i + 200)} ${frase(i + 300)}`;
  const segments = audioSegmentsFromChapters(
    topicos.map((topico, i) => ({ blockId: `b${i}`, markdown: `## ${topico}`, audioScript: `## O que é uma fração\n${fala(i)}`, topico })),
  );
  const parts = joinAudioBlocks(segments, AUDIO_JUNCTION_CONFIG_POR_PERFIL.socializer, { speakers: ["Mateo", "Zuri"] });
  assert.equal(parts.length, 8);
  assert.deepEqual(parts.map((p) => p.titulo), topicos);
  for (const part of parts) assert.match(part.audioScript, /^Mateo: /m);
});

test("títulos de seção repetidos pelo modelo não mudam o agrupamento (survivor, conteúdo 282)", () => {
  const capitulos = (titulo: (i: number) => string) =>
    audioSegmentsFromChapters(
      Array.from({ length: 4 }, (_, i) => ({
        blockId: `b${i}`,
        markdown: `## Bloco ${i}`,
        audioScript: `## ${titulo(i)}\n${paragrafo(i * 40, 6)}\n## ${titulo(i)}\n${paragrafo(i * 40 + 20, 6)}`,
        topico: `Tópico ${i}`,
      })),
    );
  const repetidos = joinAudioBlocks(capitulos(() => "O que é uma fração"), AUDIO_JUNCTION_CONFIG_POR_PERFIL.survivor);
  const distintos = joinAudioBlocks(capitulos((i) => `Seção ${i}`), AUDIO_JUNCTION_CONFIG_POR_PERFIL.survivor);
  assert.equal(repetidos.length, 4);
  assert.deepEqual(repetidos.map((p) => p.audioScript), distintos.map((p) => p.audioScript));
  assert.deepEqual(repetidos.map((p) => p.titulo), ["Bloco 0", "Bloco 1", "Bloco 2", "Bloco 3"]);
});

test("bloco curto junta-se ao seguinte quando é continuação dele; bloco longo não absorve o seguinte", () => {
  const curto = paragrafo(0, 4); // ~330 caracteres
  const medio = paragrafo(100, 25); // ~2.100 caracteres
  const parts = joinAudioBlocks(
    audioSegmentsFromChapters([
      { blockId: "a", markdown: "## Abertura", audioScript: curto, topico: "Frações" },
      { blockId: "b", markdown: "## Conceito", audioScript: medio, topico: "Frações" },
      { blockId: "c", markdown: "## Prática", audioScript: medio, topico: "Frações" },
      { blockId: "d", markdown: "## Outro assunto", audioScript: curto, topico: "Porcentagem" },
    ]),
    DEFAULT_AUDIO_JUNCTION_CONFIG,
  );
  // a (curto) vai com b; b+a já tem tamanho de áudio e não absorve c, que
  // caberia no teto; d é curto mas de outro tópico e fica sozinho.
  assert.deepEqual(parts.map((p) => p.titulo), ["Abertura", "Prática", "Outro assunto"]);
  assert.match(parts[0].audioScript, /Frase número 0 .*Frase número 100 /s);
});

test("bloco curto no fim, sem com quem ir adiante, volta para o anterior do mesmo tópico", () => {
  const parts = joinAudioBlocks(
    audioSegmentsFromChapters([
      { blockId: "a", markdown: "## A", audioScript: paragrafo(0, 40), topico: "Frações" },
      { blockId: "b", markdown: "## B", audioScript: frase(99), topico: "Frações" },
    ]),
    { targetChars: 3_000, maxChars: 4_500, minChars: 1_200 },
  );
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].sectionBoundaries.map((b) => b.title), ["A", "B"]);
  const b = parts[0].sectionBoundaries[1];
  assert.equal(parts[0].audioScript.slice(b.charStart, b.charEnd), frase(99));
});

test("bloco curto que pode ir com o próximo não volta para o anterior", () => {
  const parts = joinAudioBlocks(
    audioSegmentsFromChapters([
      { blockId: "a", markdown: "## A", audioScript: paragrafo(0, 25), topico: "T" },
      { blockId: "b", markdown: "## B", audioScript: frase(99), topico: "T" },
      { blockId: "c", markdown: "## C", audioScript: paragrafo(200, 25), topico: "T" },
    ]),
    DEFAULT_AUDIO_JUNCTION_CONFIG,
  );
  assert.deepEqual(parts.map((p) => p.titulo), ["A", "B"]);
  assert.ok(parts[1].audioScript.startsWith(frase(99)));
});

test("sem blockId, o capítulo inteiro é um bloco: o roteiro único do caminho antigo é dividido por tamanho", () => {
  const roteiro = Array.from({ length: 8 }, (_, i) => `## Seção ${i}\n${paragrafo(i * 20, 20)}`).join("\n");
  const parts = joinAudioBlocks(audioSegmentsFromChapters([{ markdown: "## Tudo", audioScript: roteiro }]));
  assert.ok(parts.length >= 3 && parts.length <= 5, `saíram ${parts.length}`);
  for (const part of parts) assert.ok(part.audioScript.length <= DEFAULT_AUDIO_JUNCTION_CONFIG.maxChars);
  // A divisão é entre seções, e as fronteiras seguem certas.
  for (const part of parts) {
    for (const b of part.sectionBoundaries) {
      assert.match(part.audioScript.slice(b.charStart, b.charEnd), /^Frase número \d+/);
    }
  }
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

test("config por perfil: daredevil mais curto que mastermind, e o env continua sobrepondo", () => {
  assert.deepEqual(resolveAudioJunctionConfig({}, "daredevil"), AUDIO_JUNCTION_CONFIG_POR_PERFIL.daredevil);
  assert.ok(AUDIO_JUNCTION_CONFIG_POR_PERFIL.daredevil.maxChars < AUDIO_JUNCTION_CONFIG_POR_PERFIL.mastermind.maxChars);
  for (const config of Object.values(AUDIO_JUNCTION_CONFIG_POR_PERFIL)) {
    assert.ok(config.maxChars <= 4_500 && config.minChars < config.targetChars && config.targetChars <= config.maxChars);
  }
  assert.equal(resolveAudioJunctionConfig({ AUDIO_JUNCTION_MAX_CHARS: "3000" }, "mastermind").maxChars, 3_000);
});
