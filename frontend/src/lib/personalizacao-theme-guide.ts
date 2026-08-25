type PerfilTema = {
  perfil: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  tom: string;
  diretrizes: string[];
};

// Paleta derivada da cor-assinatura oficial de cada perfil BrainHex
// (fonte: microservice/src/constants/brainHex.ts, espelhada em mobile/src/constants/profileImages.ts).
// primary = cor-assinatura; secondary = primary escurecida; accent = primary clareada; background = primary quase-preta.
const PERFIS_TEMA: PerfilTema[] = [
  {
    perfil: "Achiever",
    palette: { primary: "#C9A227", secondary: "#836919", accent: "#E7D59E", background: "#141004" },
    tom: "objetivo, progressivo e orientado a metas claras",
    diretrizes: ["Estruturar em checklists.", "Destacar avanco e conclusao.", "Usar linguagem direta."],
  },
  {
    perfil: "Seeker",
    palette: { primary: "#17A398", secondary: "#0F6A63", accent: "#97D6D1", background: "#02100F" },
    tom: "curioso, exploratorio e investigativo",
    diretrizes: [
      "Trazer perguntas de descoberta.",
      "Conectar conceitos com exploracao.",
      "Incluir pistas e desafios progressivos.",
    ],
  },
  {
    perfil: "Mastermind",
    palette: { primary: "#5B3FD9", secondary: "#3B298D", accent: "#B5A9EE", background: "#090616" },
    tom: "analitico, logico e estrategico",
    diretrizes: [
      "Priorizar estrutura conceitual.",
      "Explicar relacoes causa-efeito.",
      "Usar exemplos com decisao tecnica.",
    ],
  },
  {
    perfil: "Conqueror",
    palette: { primary: "#1E4FD6", secondary: "#14338B", accent: "#9AB0ED", background: "#030815" },
    tom: "competitivo, desafiador e focado em performance",
    diretrizes: ["Propor metas comparativas.", "Valorizar precisao e velocidade.", "Usar chamadas de superacao."],
  },
  {
    perfil: "Socializer",
    palette: { primary: "#F4623A", secondary: "#9F4026", accent: "#FAB8A6", background: "#180A06" },
    tom: "colaborativo, acolhedor e dialogico",
    diretrizes: ["Incluir colaboracao e troca.", "Usar exemplos de trabalho em grupo.", "Estimular feedback entre pares."],
  },
  {
    perfil: "Daredevil",
    palette: { primary: "#D7263D", secondary: "#8C1928", accent: "#ED9DA8", background: "#160406" },
    tom: "dinamico, energetico e orientado a acao",
    diretrizes: ["Aplicar cenarios praticos.", "Usar linguagem de execucao.", "Evitar excesso de teoria abstrata."],
  },
  {
    perfil: "Survivor",
    palette: { primary: "#4E5A66", secondary: "#333A42", accent: "#AFB5BA", background: "#08090A" },
    tom: "resiliente, encorajador e focado em superacao",
    diretrizes: ["Quebrar desafios em etapas.", "Reforcar progresso incremental.", "Usar mensagens de persistencia."],
  },
];

export function buildPersonalizacaoThemeGuide() {
  return {
    tema_base: {
      nome: "TrailUp Mobile - Real Medieval Magico",
      descricao:
        "Visual de fantasia medieval realista, com contraste forte, atmosfera epica e legibilidade mobile-first.",
      regras_visuais: [
        "Manter hierarquia visual clara para telas moveis.",
        "Usar paletas por perfil sem comprometer contraste.",
        "Aplicar linguagem tematica consistente com rank/trilha do app.",
      ],
    },
    perfis: PERFIS_TEMA,
    instrucao_global:
      "Ao gerar conteudo, adaptar estilo visual e tom ao perfil dominante do aluno; quando nao houver perfil dominante explicito, manter tom equilibrado.",
  };
}
