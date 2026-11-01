import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { AREA_EM_DESTAQUE, abaDaAncora, abasDoSocial, areaEmDestaque, blocosDaArena, ordemDasAreas } from "./socialDestaque";

const BRAIN_HEX_PROFILES = Object.keys(AREA_EM_DESTAQUE) as BrainHexProfile[];

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

test("abas: três, a do perfil abre e nenhuma some", () => {
  assert.deepEqual(abasDoSocial("socializer"), ["conversa", "arena", "descobrir"]);
  assert.equal(abasDoSocial("conqueror")[0], "arena");
  for (const perfil of BRAIN_HEX_PROFILES) assert.deepEqual([...abasDoSocial(perfil)].sort(), ["arena", "conversa", "descobrir"], perfil);
});

test("Eventos mora na Arena: Achiever e Mastermind abrem nela, com o evento primeiro", () => {
  assert.equal(abasDoSocial("achiever")[0], "arena");
  assert.equal(abasDoSocial("mastermind")[0], "arena");
  assert.deepEqual(blocosDaArena("achiever", true), ["evento", "arena"]);
  assert.deepEqual(blocosDaArena("conqueror", true), ["arena", "evento"]);
  assert.deepEqual(blocosDaArena("seeker", true), ["arena", "evento"]);
});

test("sem turma, a Arena fica sem o bloco do evento", () => {
  assert.deepEqual(blocosDaArena("achiever", false), ["arena"]);
  assert.deepEqual(blocosDaArena("daredevil", false), ["arena"]);
});

test("cada bloco mora numa aba, bloqueados na Conversa", () => {
  assert.equal(abaDaAncora("evento"), "arena");
  assert.equal(abaDaAncora("arena"), "arena");
  assert.equal(abaDaAncora("guildas"), "conversa");
  assert.equal(abaDaAncora("encontrar"), "descobrir");
  assert.equal(abaDaAncora("bloqueados"), "conversa");
});
