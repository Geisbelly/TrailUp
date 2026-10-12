// Resumo ao lado de "Coleta e acessos" nas Configurações da web em tela larga
// (#346, protótipo v4): quantos sinais estão ligados e o que a IA faz com cada
// um. Só dados e funções puras.
import type { TelemetryConsentPreferences } from "./telemetryConsent";

type Chave = keyof TelemetryConsentPreferences;

export const SINAIS_COLETA: { chave: Chave; titulo: string; usoPelaIa: string }[] = [
  {
    chave: "cameraEnabled",
    titulo: "Câmera",
    usoPelaIa: "Estima sua expressão (concentração, cansaço) para ajustar o ritmo. Desligada: nada é capturado.",
  },
  {
    chave: "usageEnabled",
    titulo: "Uso e navegação",
    usoPelaIa: "Mede o tempo ativo de estudo; é o que alimenta o Tempo de Estudo do ranking.",
  },
  {
    chave: "performanceEnabled",
    titulo: "Desempenho acadêmico",
    usoPelaIa: "Escolhe a ordem do material e onde reforçar.",
  },
  {
    chave: "chatEnabled",
    titulo: "Chat com a IA",
    usoPelaIa: "Libera o guia do seu perfil para explicar a trilha; ele não entrega respostas.",
  },
];

export function contarSinaisAtivos(prefs: TelemetryConsentPreferences): { ativos: number; total: number } {
  return { ativos: SINAIS_COLETA.filter((s) => prefs[s.chave]).length, total: SINAIS_COLETA.length };
}

/** "Termo de consentimento · versão 2026-10-02-v4 · atualizado em 07/10/2026"; sem registro, null. */
export function descreverTermo(registro: { version?: string; updatedAt?: string } | null | undefined): string | null {
  if (!registro?.version) return null;
  const data = registro.updatedAt ? new Date(registro.updatedAt) : null;
  if (!data || Number.isNaN(data.getTime())) return `Termo de consentimento · versão ${registro.version}`;
  const dd = String(data.getDate()).padStart(2, "0");
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  return `Termo de consentimento · versão ${registro.version} · atualizado em ${dd}/${mm}/${data.getFullYear()}`;
}
