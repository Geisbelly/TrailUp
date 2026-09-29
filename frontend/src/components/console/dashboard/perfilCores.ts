import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { contraste } from "./contraste";

// Espelho de microservice/src/constants/brainHex.ts (fonte oficial, ver
// CLAUDE.md) — mudou lá, muda aqui. `marca` é a cor oficial, para
// preenchimento sem texto (barra, bolinha, contorno). `texto` é a mesma
// matiz com a luminosidade HSL elevada até passar de 7:1 contra todas as
// superfícies do console e contra o fundo do chip do próprio perfil.
export const PERFIS_EM_ORDEM: BrainHexProfileKey[] = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
];

export const COR_DO_PERFIL: Record<BrainHexProfileKey, { marca: string; texto: string }> = {
  seeker: { marca: "#17a398", texto: "#1cc9bc" },
  survivor: { marca: "#4e5a66", texto: "#a3adb8" },
  daredevil: { marca: "#d7263d", texto: "#ed97a2" },
  mastermind: { marca: "#5b3fd9", texto: "#b3a6ed" },
  conqueror: { marca: "#1e4fd6", texto: "#94acf0" },
  socializer: { marca: "#f4623a", texto: "#f89b81" },
  achiever: { marca: "#c9a227", texto: "#dab43f" },
};

export const NOME_DO_PERFIL: Record<BrainHexProfileKey, string> = {
  seeker: "Seeker",
  survivor: "Survivor",
  daredevil: "Daredevil",
  mastermind: "Mastermind",
  conqueror: "Conqueror",
  socializer: "Socializer",
  achiever: "Achiever",
};

// Fundo do chip e do avatar: a marca a 13% sobre o card (o "22" hex do protótipo).
export const OPACIDADE_FUNDO_PERFIL = 34 / 255;

const APELIDOS: Record<string, BrainHexProfileKey> = {
  seeker: "seeker",
  explorador: "seeker",
  survivor: "survivor",
  sobrevivente: "survivor",
  desafiador: "survivor",
  daredevil: "daredevil",
  aventureiro: "daredevil",
  ousado: "daredevil",
  mastermind: "mastermind",
  estrategista: "mastermind",
  mestre: "mastermind",
  conqueror: "conqueror",
  conquistador: "conqueror",
  competidor: "conqueror",
  socializer: "socializer",
  socialiser: "socializer",
  socializador: "socializer",
  colaborador: "socializer",
  achiever: "achiever",
  realizador: "achiever",
  completionista: "achiever",
};

/** Nome do perfil como vem do banco (inglês ou rótulo em português) → chave; null se não reconhecer. */
export function chaveDoPerfil(nome: string | null | undefined): BrainHexProfileKey | null {
  const limpo = String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .split(/[\s(]/)[0];
  return APELIDOS[limpo] ?? null;
}

const ICONE_CLARO = "#ffffff";
const ICONE_ESCURO = "#0d0b16";

/**
 * Ícone sobre a marca sólida: branco ou escuro, o que contrastar mais. Serve
 * para ícone (gráfico, limite 3:1), não para texto — em 5 dos 7 perfis nenhuma
 * das duas chega aos 7:1 de texto AAA.
 */
export function corDoIconeSobre(marca: string): string {
  return contraste(ICONE_CLARO, marca) >= contraste(ICONE_ESCURO, marca) ? ICONE_CLARO : ICONE_ESCURO;
}

export function iniciaisDe(nome: string): string {
  return (
    nome
      .split(" ")
      .filter(Boolean)
      .map((parte) => parte[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
