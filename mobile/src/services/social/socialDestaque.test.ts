import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { AREA_EM_DESTAQUE, ICONE_DO_SOCIAL, abaDaAncora, abasDoSocial, areaEmDestaque, blocosDaArena, cabecaDaDisputa, iconeDoSocial, ordemDasAreas } from "./socialDestaque";

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

test("a aba de disputa é Arena só para os perfis de batalha; para os demais, Eventos", () => {
  for (const perfil of BRAIN_HEX_PROFILES) {
    const batalha = getBrainHexProfileCapabilities(perfil).hasBattle;
    assert.equal(cabecaDaDisputa(perfil), batalha ? "arena" : "eventos", perfil);
    assert.deepEqual(blocosDaArena(perfil, true), batalha ? ["arena", "evento"] : ["evento", "arena"], perfil);
  }
});

test("Achiever e Mastermind abrem na aba de disputa, que para eles é Eventos", () => {
  assert.equal(abasDoSocial("achiever")[0], "arena");
  assert.equal(abasDoSocial("mastermind")[0], "arena");
  assert.equal(cabecaDaDisputa("achiever"), "eventos");
});

test("sem turma, a aba de disputa é Arena para todos e fica sem o bloco do evento", () => {
  assert.deepEqual(blocosDaArena("achiever", false), ["arena"]);
  assert.deepEqual(blocosDaArena("daredevil", false), ["arena"]);
  assert.equal(cabecaDaDisputa("achiever", false), "arena");
});

test("cada bloco mora numa aba, bloqueados na Conversa", () => {
  assert.equal(abaDaAncora("evento"), "arena");
  assert.equal(abaDaAncora("arena"), "arena");
  assert.equal(abaDaAncora("guildas"), "conversa");
  assert.equal(abaDaAncora("encontrar"), "descobrir");
  assert.equal(abaDaAncora("bloqueados"), "conversa");
});

test("o ícone do Social existe, muda ao abrir, não repete entre perfis nem a Trilha do mesmo perfil", () => {
  const glifos = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json") as Record<string, number>;
  // `profileImages.ts` carrega PNG e não roda no node: os ícones da Trilha saem do texto dele.
  const fonte = readFileSync(join(__dirname, "../../constants/profileImages.ts"), "utf8");
  const iconesDaTrilha = (perfil: string) => {
    const bloco = fonte.match(new RegExp(`\\n  ${perfil}: \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? "";
    const icon = bloco.match(/\bicon: "([^"]+)"/)?.[1];
    const iconFocus = bloco.match(/\bicon_focus: "([^"]+)"/)?.[1];
    assert.ok(icon && iconFocus, `${perfil}: ícone da Trilha não encontrado`);
    return [icon, iconFocus];
  };
  const vistos = new Set<string>();
  for (const perfil of BRAIN_HEX_PROFILES) {
    const { ativo, inativo } = ICONE_DO_SOCIAL[perfil];
    assert.ok(glifos[ativo] && glifos[inativo], `${perfil}: ícone inexistente`);
    // `strategy` não tem versão de contorno: o Mastermind muda só de cor.
    if (perfil !== "mastermind") assert.notEqual(ativo, inativo, `${perfil}: o ícone tem de mudar ao abrir, como o da Trilha`);
    for (const icone of new Set([ativo, inativo])) {
      assert.ok(!vistos.has(icone), `${perfil}: ${icone} já é de outro perfil`);
      vistos.add(icone);
    }
    const trilha = iconesDaTrilha(perfil);
    for (const icone of [ativo, inativo]) assert.ok(!trilha.includes(icone), `${perfil}: ${icone} repete a Trilha`);
  }
  assert.equal(vistos.size, 13);
  assert.equal(iconeDoSocial("Socializer", true), "forum");
  assert.equal(iconeDoSocial("seeker", false), "account-search-outline");
  assert.equal(iconeDoSocial(null, false), "account-group-outline");
});
