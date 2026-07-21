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
    palette: { primary: "#AD6002", secondary: "#703E01", accent: "#DAB78D", background: "#110A00" },
    tom: "objetivo, progressivo e orientado a metas claras",
    diretrizes: ["Estruturar em checklists.", "Destacar avanco e conclusao.", "Usar linguagem direta."],
  },
  {
    perfil: "Seeker",
    palette: { primary: "#A78C07", secondary: "#6D5B05", accent: "#D7CB8F", background: "#110E01" },
    tom: "curioso, exploratorio e investigativo",
    diretrizes: [
      "Trazer perguntas de descoberta.",
      "Conectar conceitos com exploracao.",
      "Incluir pistas e desafios progressivos.",
    ],
  },
  {
    perfil: "Mastermind",
    palette: { primary: "#707C88", secondary: "#495158", accent: "#BFC4C9", background: "#0B0C0E" },
    tom: "analitico, logico e estrategico",
    diretrizes: [
      "Priorizar estrutura conceitual.",
      "Explicar relacoes causa-efeito.",
      "Usar exemplos com decisao tecnica.",
    ],
  },
  {
    perfil: "Conqueror",
    palette: { primary: "#01808B", secondary: "#01535A", accent: "#8DC6CB", background: "#000D0E" },
    tom: "competitivo, desafiador e focado em performance",
    diretrizes: ["Propor metas comparativas.", "Valorizar precisao e velocidade.", "Usar chamadas de superacao."],
  },
  {
    perfil: "Socializer",
    palette: { primary: "#6D15BE", secondary: "#470E7C", accent: "#BD96E2", background: "#0B0213" },
    tom: "colaborativo, acolhedor e dialogico",
    diretrizes: ["Incluir colaboracao e troca.", "Usar exemplos de trabalho em grupo.", "Estimular feedback entre pares."],
  },
  {
    perfil: "Daredevil",
    palette: { primary: "#1B6B1B", secondary: "#124612", accent: "#98BC98", background: "#030B03" },
    tom: "dinamico, energetico e orientado a acao",
    diretrizes: ["Aplicar cenarios praticos.", "Usar linguagem de execucao.", "Evitar excesso de teoria abstrata."],
  },
  {
    perfil: "Survivor",
    palette: { primary: "#720101", secondary: "#4A0101", accent: "#C08D8D", background: "#0B0000" },
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
