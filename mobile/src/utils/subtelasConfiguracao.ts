// Seções das Configurações na web em tela larga (#346, protótipo v4,
// `11-configuracoes.html`): a lista da esquerda e o cabeçalho do painel da
// direita. Só dados e funções puras; as telas ficam em ConfiguracoesDesktop.

export type IdSubtela =
  | "info"
  | "senha"
  | "coleta"
  | "relatorio"
  | "privacidade"
  | "termos"
  | "excluir"
  | "lembrete"
  | "aparencia"
  | "metricas"
  | "tutorial"
  | "app"
  | "versao";

export type Subtela = {
  id: IdSubtela;
  rotulo: string;
  /** Eyebrow do cabeçalho do painel. */
  grupo: string;
  titulo: string;
  descricao?: string;
  /** Linha que faz uma ação (link, outra página) em vez de abrir painel. */
  acao?: boolean;
  perigo?: boolean;
};

export type GrupoSubtelas = { titulo: string; itens: Subtela[] };

const CONTA = "Conta";
const PRIVACIDADE = "Privacidade e termos";
const PREFERENCIAS = "Preferências";
const SOBRE = "Tutorial e informações do app";

export const GRUPOS_CONFIGURACAO: GrupoSubtelas[] = [
  {
    titulo: CONTA,
    itens: [
      {
        id: "info",
        rotulo: "Informações pessoais",
        grupo: CONTA,
        titulo: "Informações pessoais",
        descricao: "Seu nome, apelido e descrição aparecem no seu perfil público para a turma.",
      },
      { id: "senha", rotulo: "Resetar senha", grupo: CONTA, titulo: "Redefinir senha" },
    ],
  },
  {
    titulo: PRIVACIDADE,
    itens: [
      {
        id: "coleta",
        rotulo: "Coleta e acessos",
        grupo: PRIVACIDADE,
        titulo: "Coleta e acessos",
        descricao:
          "Você decide o que a plataforma pode observar durante seu estudo. Desativar um item não te tira do app — só reduz a personalização baseada naquele sinal.",
      },
      { id: "relatorio", rotulo: "Gerar relatório dos dados", grupo: PRIVACIDADE, titulo: "Gerar relatório dos dados", acao: true },
      { id: "privacidade", rotulo: "Política de privacidade", grupo: PRIVACIDADE, titulo: "Política de privacidade", acao: true },
      { id: "termos", rotulo: "Termos de uso", grupo: PRIVACIDADE, titulo: "Termos de uso", acao: true },
      { id: "excluir", rotulo: "Solicitar exclusão da conta", grupo: PRIVACIDADE, titulo: "Solicitar exclusão da conta", perigo: true },
    ],
  },
  {
    titulo: PREFERENCIAS,
    itens: [
      {
        id: "lembrete",
        rotulo: "Lembrete diário",
        grupo: PREFERENCIAS,
        titulo: "Lembrete diário",
        descricao:
          "Escolha o horário em que o TrailUp te avisa para continuar a trilha. Funciona mesmo com o app fechado (no navegador, só quando o app está aberto).",
      },
      { id: "aparencia", rotulo: "Aparência", grupo: PREFERENCIAS, titulo: "Aparência", descricao: "Personalize a aparência do aplicativo." },
      {
        id: "metricas",
        rotulo: "Estilo das métricas",
        grupo: "Personalização visual",
        titulo: "Visualização das métricas",
        descricao:
          "Esta configuração altera apenas a aparência e a organização do painel. Seus valores, progresso e histórico permanecem iguais.",
      },
    ],
  },
  {
    titulo: SOBRE,
    itens: [
      { id: "tutorial", rotulo: "Rever tutorial inicial", grupo: SOBRE, titulo: "Rever tutorial inicial", acao: true },
      {
        id: "app",
        rotulo: "Informações do app",
        grupo: SOBRE,
        titulo: "Informações do app",
        descricao:
          "TrailUp ajuda você a acompanhar sua trilha de aprendizado, módulos, atividades e conquistas em um só lugar. Aqui estão alguns detalhes técnicos e de produto.",
      },
      { id: "versao", rotulo: "Versão", grupo: SOBRE, titulo: "Informação de versão" },
    ],
  },
];

const TODAS = GRUPOS_CONFIGURACAO.flatMap((g) => g.itens);

/** Subtela aberta a partir do `?sub=` da URL; sem valor válido, Informações pessoais. */
export function subtelaDaUrl(sub: unknown): Subtela {
  const id = Array.isArray(sub) ? sub[0] : sub;
  return TODAS.find((s) => s.id === id && !s.acao) ?? TODAS[0];
}

/** Grupos filtrados pela busca (sem acento e sem caixa); grupos vazios somem. */
export function filtrarGrupos(busca: string): GrupoSubtelas[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(busca.trim());
  if (!q) return GRUPOS_CONFIGURACAO;
  return GRUPOS_CONFIGURACAO.map((g) => ({ ...g, itens: g.itens.filter((s) => norm(s.rotulo).includes(q)) })).filter(
    (g) => g.itens.length > 0,
  );
}
