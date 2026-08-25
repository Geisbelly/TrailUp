import type { GeminiTtsVoice } from "../services/geminiService";
import type { BrainHexProfile } from "./brainHex";

export type GuardianVoiceProfile = {
  voice: GeminiTtsVoice;
  direction: string;
  secondaryVoice?: GeminiTtsVoice;
  secondaryDirection?: string;
};

/**
 * Direção canônica das vozes dos Guardiões.
 *
 * Origem e etnia orientam somente uma musicalidade cultural sutil. O texto deve
 * continuar em português brasileiro claro, sem caricaturar sotaques.
 */
export const GUARDIAN_VOICE_PROFILES: Record<BrainHexProfile, GuardianVoiceProfile> = {
  mastermind: {
    voice: "Charon",
    direction:
      "Idris é um homem jovem adulto, norte-africano, de fala informativa e serena. Use português brasileiro claro, voz masculina jovem, raciocínio preciso, ritmo médio e uma musicalidade magrebina muito sutil, sem caricatura.",
  },
  seeker: {
    voice: "Leda",
    direction:
      "Amara é uma mulher jovem adulta negra, de origem africana oriental. Use português brasileiro claro, voz feminina jovem, curiosa e luminosa, ritmo médio e uma musicalidade cultural muito sutil, sem caricatura.",
  },
  survivor: {
    voice: "Schedar",
    direction:
      "Kenji é um homem jovem adulto japonês. Use português brasileiro claro, voz masculina jovem, estável e paciente, ritmo médio-lento, dicção contida e apenas uma musicalidade japonesa sutil, sem caricatura.",
  },
  daredevil: {
    voice: "Zephyr",
    direction:
      "Ember é uma mulher jovem adulta branca, de origem europeia setentrional. Use português brasileiro claro, voz feminina jovem, brilhante e energética, ritmo dinâmico e atitude ousada, sem caricatura de sotaque.",
  },
  conqueror: {
    voice: "Kore",
    direction:
      "Amina é uma mulher jovem adulta negra, de origem africana oriental. Use português brasileiro claro, voz feminina jovem, firme e régia, ritmo dinâmico, presença de liderança e uma musicalidade cultural muito sutil, sem caricatura.",
  },
  socializer: {
    voice: "Achird",
    direction:
      "Mateo é um homem jovem adulto afro-latino. Use português brasileiro claro, voz masculina jovem, amigável e comunicativa, ritmo médio e calor humano, com musicalidade latino-americana sutil, sem caricatura.",
    secondaryVoice: "Sulafat",
    secondaryDirection:
      "Zuri é uma mulher jovem adulta afro-latina e irmã gêmea de Mateo. Use português brasileiro claro, voz feminina jovem, calorosa e empática, ritmo médio e musicalidade latino-americana sutil, sem caricatura.",
  },
  achiever: {
    voice: "Orus",
    direction:
      "Kwame é um homem jovem adulto negro, ganês de origem Akan. Use português brasileiro claro, voz masculina jovem, firme e confiante, ritmo médio, disciplina e progressão clara, com musicalidade cultural muito sutil, sem caricatura.",
  },
};
