// Textos do tutorial de primeiro acesso na web em tela larga (#346, protótipo
// v4, revisao-04-lacunas-mobile/telas/tutorial-primeiro-acesso.md, "Adaptações
// para a web"). O app tem 4 abas na base da tela; a web tem 6 áreas numa barra
// à esquerda. Função pura sobre os passos de `buildFirstAccessTourSteps`.
import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import type { FirstAccessTourStep } from "./firstAccessTour";

// A mesma voz de cada guardião, sem "quatro" e sem "base da tela".
const NAVEGACAO: Record<BrainHexProfile, string> = {
  seeker: "Antes de partirmos, olhe a barra à esquerda: são as portas da jornada, e eu conheço todas.",
  survivor: "Firme comigo: estas portas à esquerda são suas rotas seguras.",
  daredevil: "Rápido, olhe à esquerda: cada porta leva à ação.",
  mastermind: "Observe a barra à esquerda: cada área guarda um tipo de dado.",
  conqueror: "Antes da campanha, reconheça o terreno: estes são seus setores de comando.",
  socializer: "Venha com a gente: são vários espaços, e nenhum se percorre sozinho.",
  achiever: "Primeira meta: reconhecer as áreas. Olhe a barra à esquerda.",
};

export function adaptarTourParaTelaLarga(steps: readonly FirstAccessTourStep[], profileName?: string | null): FirstAccessTourStep[] {
  const profile = normalizeBrainHexProfile(profileName) ?? "seeker";
  return steps.map((step) => {
    if (step.id === "navigation")
      return {
        ...step,
        title: "Suas áreas",
        description: `${NAVEGACAO[profile]} Trilha, Notificações, Social, Loja, Ranking e Perfil — trocar de área não perde seu progresso.`,
      };
    if (step.id === "notifications")
      return {
        ...step,
        description: step.description.replace(
          "Arraste um aviso para marcar como lido ou excluir.",
          "Abra um aviso para ler, marcar como não lido ou excluir.",
        ),
      };
    if (step.id === "camera-consent")
      return { ...step, description: step.description.replace("permissão do Android", "permissão do navegador") };
    return step;
  });
}
