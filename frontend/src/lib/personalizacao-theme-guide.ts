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

const PERFIS_TEMA: PerfilTema[] = [
  {
    perfil: "Achiever",
    palette: { primary: "#22C55E", secondary: "#15803D", accent: "#86EFAC", background: "#0B1F14" },
    tom: "objetivo, progressivo e orientado a metas claras",
    diretrizes: ["Estruturar em checklists.", "Destacar avanco e conclusao.", "Usar linguagem direta."],
  },
  {
    perfil: "Seeker",
    palette: { primary: "#3B82F6", secondary: "#1D4ED8", accent: "#93C5FD", background: "#0A1628" },
    tom: "curioso, exploratorio e investigativo",
    diretrizes: [
      "Trazer perguntas de descoberta.",
      "Conectar conceitos com exploracao.",
      "Incluir pistas e desafios progressivos.",
    ],
  },
  {
    perfil: "Mastermind",
    palette: { primary: "#8B5CF6", secondary: "#6D28D9", accent: "#C4B5FD", background: "#130C22" },
    tom: "analitico, logico e estrategico",
    diretrizes: [
      "Priorizar estrutura conceitual.",
      "Explicar relacoes causa-efeito.",
      "Usar exemplos com decisao tecnica.",
    ],
  },
  {
    perfil: "Conqueror",
    palette: { primary: "#EF4444", secondary: "#B91C1C", accent: "#FCA5A5", background: "#2A0B0B" },
    tom: "competitivo, desafiador e focado em performance",
    diretrizes: ["Propor metas comparativas.", "Valorizar precisao e velocidade.", "Usar chamadas de superacao."],
  },
  {
    perfil: "Socializer",
    palette: { primary: "#EC4899", secondary: "#BE185D", accent: "#F9A8D4", background: "#2A0E20" },
    tom: "colaborativo, acolhedor e dialogico",
    diretrizes: ["Incluir colaboracao e troca.", "Usar exemplos de trabalho em grupo.", "Estimular feedback entre pares."],
  },
  {
    perfil: "Daredevil",
    palette: { primary: "#F97316", secondary: "#C2410C", accent: "#FDBA74", background: "#2B160A" },
    tom: "dinamico, energetico e orientado a acao",
    diretrizes: ["Aplicar cenarios praticos.", "Usar linguagem de execucao.", "Evitar excesso de teoria abstrata."],
  },
  {
    perfil: "Survivor",
    palette: { primary: "#06B6D4", secondary: "#0E7490", accent: "#67E8F9", background: "#0A1F24" },
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
