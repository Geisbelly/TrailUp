import assert from "node:assert/strict";
import test from "node:test";

import { computeImageCues } from "./audioImageCues";

const boundaries = [
  { globalIndex: 0, title: "A", charStart: 0, charEnd: 100 },
  { globalIndex: 1, title: "B", charStart: 102, charEnd: 302 }, // total 300 chars (ate o fim de B)
];

test("calcula minutagem proporcional ao tamanho de texto de cada secao", () => {
  const cues = computeImageCues(boundaries, 30, [{ url: "https://x.test/a.png" }, { url: "https://x.test/b.png" }]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSec, 0); // charStart 0
  assert.equal(cues[1].startSec, 30 * (102 / 302));
});

test("usa o indice GLOBAL da secao pro round-robin, nao o indice local dentro da parte", () => {
  const boundariesComGapNoInicio = [
    { globalIndex: 3, title: "D", charStart: 0, charEnd: 50 },
    { globalIndex: 4, title: "E", charStart: 52, charEnd: 100 },
  ];
  const images = [{ url: "img0" }, { url: "img1" }, { url: "img2" }, { url: "img3" }, { url: "img4" }];
  const cues = computeImageCues(boundariesComGapNoInicio, 10, images);
  assert.equal(cues[0].imageUrl, "img3"); // globalIndex 3 % 5 = 3
  assert.equal(cues[1].imageUrl, "img4"); // globalIndex 4 % 5 = 4
});

test("sem imagens disponiveis: retorna array vazio", () => {
  assert.deepEqual(computeImageCues(boundaries, 30, []), []);
});

test("sem sectionBoundaries ou sem duracao: retorna array vazio", () => {
  assert.deepEqual(computeImageCues(undefined, 30, [{ url: "x" }]), []);
  assert.deepEqual(computeImageCues(boundaries, null, [{ url: "x" }]), []);
  assert.deepEqual(computeImageCues([], 30, [{ url: "x" }]), []);
});
