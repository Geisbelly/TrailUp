import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Depois do login, a cor da tela do aluno vem da cor-assinatura do perfil BrainHex
 * (`getProfileShellPalette`). Um componente que pinta com cor própria quebra isso em silêncio:
 * não falha teste nenhum, não aparece em typecheck, e o aluno só vê um pedaço do app que
 * "não é dele".
 *
 * O que este teste cobra: todo componente pós-login que declara cor própria tem de ter ALGUM
 * vínculo com o perfil (paleta, accent, `theme` por prop, emblema/arte do perfil). Quem não tem
 * precisa estar na lista abaixo, com o motivo — a ausência vira decisão registrada em vez de
 * esquecimento.
 *
 * Fora do escopo, de propósito:
 * - telas ANTES do login: não há perfil ainda;
 * - preto e branco puros: sombra e véu não são identidade visual.
 */
const ANTES_DO_LOGIN = ["(auth)", "tela_de_entrada", "AuthDesktop", "signup"];

/**
 * Exceções medidas, não supostas — cada uma foi conferida no código em 22/10/2026.
 * `nenhuma entrada esta obsoleta` abaixo derruba a entrada que deixar de violar a regra: lista
 * de exceção sem essa guarda cresce e mente para cima.
 */
const EXCECOES: Record<string, string> = {
  "src/components/SeloDePrazo.tsx":
    "vermelho/âmbar do prazo são SIGNIFICADO (atrasado, perto de vencer), não identidade. " +
    "Pintar com o accent faria 'atrasado' ficar verde para o seeker.",
  "src/context/IAContext.tsx":
    "paleta do CHEFE da batalha (preset, hpColor, shieldColor) — identidade do inimigo, " +
    "não a pele do aluno.",
  "src/components/ia/IATimerCard.tsx":
    "PENDENTE DE DECISÃO: o dourado #d4af37 é identidade inventada só aqui, não existe em " +
    "mais lugar nenhum do sistema. Os vermelhos de urgência são significado e ficam; o " +
    "dourado e o lilás é que deviam sair da paleta. Repintar é decisão de design.",
  "src/components/themed-text.tsx":
    "sobra do template do Expo; o #0a7ea4 está só no estilo `link`, usado uma vez em " +
    "src/app/modal.tsx.",
  "src/components/funcionais/ProgressoClasse.tsx":
    "CÓDIGO MORTO: nenhum arquivo monta este componente (conferido). O cartão branco com " +
    "roxo fixo não chega a aluno nenhum.",
  "src/components/trilhas/common/LockBadge.tsx":
    "CÓDIGO MORTO: nenhum arquivo monta este componente (conferido).",
};

const HEX = /["']#[0-9a-fA-F]{3,8}["']/g;
const RGBA = /["']rgba?\([^"']*\)["']/g;
const VINCULO_COM_O_PERFIL =
  /palette\.\w+|\baccent\b|getProfileShellPalette|getBrainHexConfig|profileEmblems|ProfileArtwork|theme\?\./;
const NEUTRA =
  /^["'](#000|#fff|#000000|#ffffff|rgba?\(\s*0\s*,\s*0\s*,\s*0[^)]*\)|rgba?\(\s*255\s*,\s*255\s*,\s*255[^)]*\))["']$/i;

function telas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return telas(caminho);
    return extname(nome) === ".tsx" && !nome.includes(".test.") ? [caminho] : [];
  });
}

/** Componentes pós-login que declaram cor própria e não falam com o perfil. */
function violadores(): string[] {
  const achados: string[] = [];
  for (const caminho of telas(join(process.cwd(), "src"))) {
    const relativo = relative(process.cwd(), caminho).split("\\").join("/");
    if (ANTES_DO_LOGIN.some((marca) => relativo.includes(marca))) continue;

    const texto = readFileSync(caminho, "utf8");
    const cores = [...(texto.match(HEX) ?? []), ...(texto.match(RGBA) ?? [])].filter(
      (cor) => !NEUTRA.test(cor)
    );
    if (cores.length > 0 && !VINCULO_COM_O_PERFIL.test(texto)) achados.push(relativo);
  }
  return achados.sort();
}

test("nenhum componente pos-login pinta com cor propria fora da lista", () => {
  const novos = violadores().filter((caminho) => !(caminho in EXCECOES));
  assert.deepEqual(
    novos,
    [],
    "componente com cor propria e sem vinculo com o perfil BrainHex:\n  " + novos.join("\n  ")
  );
});

test("nenhuma entrada da lista esta obsoleta", () => {
  const atuais = new Set(violadores());
  const obsoletas = Object.keys(EXCECOES).filter((caminho) => !atuais.has(caminho));
  assert.deepEqual(
    obsoletas,
    [],
    "entrada que ja nao viola a regra (corrigida ou apagada) — tire da lista:\n  " +
      obsoletas.join("\n  ")
  );
});

test("toda excecao tem motivo escrito", () => {
  for (const [caminho, motivo] of Object.entries(EXCECOES)) {
    assert.ok(motivo.trim().length > 30, `${caminho}: motivo curto demais para ser um motivo`);
  }
});
