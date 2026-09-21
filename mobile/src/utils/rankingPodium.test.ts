import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectPodium, formatRankScore } from "./rankingPodium";

test("podium uses official positions, never a personal row outside the leaders", () => {
  const rows = [
    { id_aluno: "me", posicao: 18 },
    { id_aluno: "b", posicao: 2 },
    { id_aluno: "a", posicao: 1 },
    { id_aluno: "c", posicao: 3 },
  ];
  assert.deepEqual(
    selectPodium(rows).map((row) => row.id_aluno),
    ["a", "b", "c"],
  );
  assert.equal(rows[0].id_aluno, "me");
});
test("podium preserves ties and deduplicates students", () => {
  const result = selectPodium([
    { id_aluno: "a", posicao: 1 },
    { id_aluno: "b", posicao: 1 },
    { id_aluno: "a", posicao: 1 },
    { id_aluno: "c", posicao: 3 },
  ]);
  assert.deepEqual(
    result.map((row) => row.posicao),
    [1, 1, 3],
  );
});
test("podium retains everyone tied in the top three positions", () => {
  assert.equal(
    selectPodium(
      ["a", "b", "c", "d"].map((id_aluno) => ({ id_aluno, posicao: 1 })),
    ).length,
    4,
  );
});
test("missing and invalid positions are not turned into winners", () => {
  assert.deepEqual(
    selectPodium(
      [null, 0, -1, 1.5, NaN, 4].map((posicao, i) => ({
        id_aluno: String(i),
        posicao,
      })),
    ),
    [],
  );
  assert.deepEqual(selectPodium([]), []);
  assert.equal(selectPodium([{ id_aluno: "a", posicao: 1 }]).length, 1);
});
test("score formatting respects the actual criterion and unavailable values", () => {
  assert.equal(formatRankScore(123, "tempo"), "2h 03min");
  assert.equal(formatRankScore(45.6, "percentual"), "46%");
  assert.equal(formatRankScore(250, "pontuacao"), "250");
  assert.equal(formatRankScore(null, "pontuacao"), "--");
  assert.equal(formatRankScore(NaN, "tempo"), "--");
  assert.equal(formatRankScore(0, "pontuacao"), "0");
});

test("podium belongs to rank detail, while the entry remains category navigation", () => {
  const home = readFileSync(
    join(process.cwd(), "src/app/(tabs)/ranking/index.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    join(process.cwd(), "src/app/(tabs)/ranking/[id].tsx"),
    "utf8",
  );
  assert.equal(home.includes("<RankingPodium"), false);
  assert.match(home, /pathname:\s*["']\/\(tabs\)\/ranking\/\[id\]["']/);
  assert.ok(detail.includes("<RankingPodium"));
  assert.match(detail, /getProfileArtwork\(profile,\s*["']rank["']\)/);
  assert.ok(detail.includes("getProfileShellPalette(profile)"));
});
