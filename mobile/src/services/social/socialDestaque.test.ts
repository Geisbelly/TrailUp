import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { AREA_EM_DESTAQUE, areaEmDestaque, ordemDasAncoras, ordemDasAreas, type AncoraDoSocial } from "./socialDestaque";

const BRAIN_HEX_PROFILES = Object.keys(AREA_EM_DESTAQUE) as BrainHexProfile[];
const TODAS = new Set<AncoraDoSocial>(["evento", "arena", "convites", "amigos", "guildas", "encontrar", "bloqueados"]);

test("os sete perfis têm destaque", () => {
  assert.equal(BRAIN_HEX_PROFILES.length, 7);
});

test("todo perfil de batalha abre a Social na Arena, e só eles", () => {
  for (const perfil of BRAIN_HEX_PROFILES) {
    const batalha = getBrainHexProfileCapabilities(perfil).hasBattle;
    assert.equal(AREA_EM_DESTAQUE[perfil] === "arena", batalha, perfil);
  }
});

test("Socializer abre na Conversa e Seeker em Descobrir", () => {
  assert.equal(areaEmDestaque("socializer"), "conversa");
  assert.equal(areaEmDestaque("Seeker"), "descobrir");
  assert.equal(areaEmDestaque("achiever"), "eventos");
});

test("perfil desconhecido cai no padrão do app (mastermind)", () => {
  assert.equal(areaEmDestaque(null), AREA_EM_DESTAQUE.mastermind);
  assert.equal(areaEmDestaque("qualquer"), AREA_EM_DESTAQUE.mastermind);
});

test("a área em destaque vem primeiro e nenhuma some", () => {
  for (const perfil of BRAIN_HEX_PROFILES) {
    const ordem = ordemDasAreas(perfil);
    assert.equal(ordem[0], AREA_EM_DESTAQUE[perfil]);
    assert.deepEqual([...ordem].sort(), ["arena", "conversa", "descobrir", "eventos"]);
  }
});

test("blocos: todos presentes, bloqueados por último", () => {
  const ordem = ordemDasAncoras("socializer", TODAS);
  assert.deepEqual(ordem, ["convites", "amigos", "guildas", "evento", "arena", "encontrar", "bloqueados"]);
  assert.equal(ordemDasAncoras("conqueror", TODAS)[0], "arena");
});

test("sem turma, evento e arena não entram", () => {
  const semTurma = new Set<AncoraDoSocial>(["convites", "amigos", "guildas", "encontrar"]);
  assert.deepEqual(ordemDasAncoras("daredevil", semTurma), ["convites", "amigos", "guildas", "encontrar"]);
});
