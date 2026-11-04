import type { FirstAccessTourStep } from "./firstAccessTour";
import type { Aberturas, Funcionalidade } from "./portoes";

/**
 * Tutoriais práticos do Guardião: levam o aluno pela tela, destacando cada parte, com o mesmo
 * balão do tutorial de entrada. O catálogo é fechado de propósito: o modelo só escolhe o `id`
 * (paridade testada com `TUTORIAIS_DO_APP`, em `api/app/services/guia_do_app.py`) e nunca escreve
 * um passo, porque um passo inventado apontaria para um botão que não existe.
 */
export type TutorialDoGuia = {
  id: string;
  titulo: string;
  /** Aba com cadeado de que o tutorial depende: fechada, ele não é oferecido. */
  portao?: Funcionalidade;
  passos: FirstAccessTourStep[];
};

export const TUTORIAIS_DO_GUIA: readonly TutorialDoGuia[] = [
  {
    id: "conhecer_app",
    titulo: "Conhecer o app",
    passos: [
      { id: "abas", route: "/(tabs)", page: "Navegação", title: "Suas áreas", description: "Daqui você chega à Trilha, às Notificações, ao Social, ao Ranking e ao Perfil. Trocar de área não perde seu progresso.", target: "abas_principais", highlight: "navigation" },
      { id: "mapa", route: "/(tabs)", page: "Trilha", title: "Sua jornada", description: "Os tópicos da turma ficam aqui. Abra um para ver o material e as atividades.", target: "trilha_mapa" },
      { id: "avisos", route: "/(tabs)/notificacoes", page: "Notificações", title: "Seus avisos", description: "Prazos, conquistas e recados chegam aqui.", target: "notificacoes_lista" },
      { id: "perfil", route: "/(tabs)/perfil", page: "Perfil", title: "Sua conta", description: "Suas métricas, a Loja, as conquistas e as configurações ficam no Perfil.", target: "perfil_resumo" },
    ],
  },
  {
    id: "continuar_estudo",
    titulo: "Continuar o estudo",
    passos: [
      { id: "progresso", route: "/(tabs)", page: "Trilha", title: "Seu progresso", description: "Aqui você vê quanto já concluiu da turma.", target: "trilha_resumo" },
      { id: "mapa", route: "/(tabs)", page: "Trilha", title: "De onde parou", description: "\"Você parou aqui\" marca o seu tópico. Toque nele e em Continuar para retomar. Tópico com cadeado depende dos anteriores.", target: "trilha_mapa" },
    ],
  },
  {
    id: "gastar_moedas",
    titulo: "Usar a Loja",
    passos: [
      { id: "loja", route: "/(tabs)/perfil", page: "Perfil", title: "Abra a Loja", description: "No celular ela fica aqui no Perfil; na tela larga, na barra lateral.", target: "perfil_loja" },
      { id: "moedas", route: "/(tabs)/perfil", page: "Loja", title: "Gaste suas moedas", description: "Você ganha moedas estudando e compra itens. O que você compra vai para a Bag.", target: "perfil_loja" },
    ],
  },
  {
    id: "ver_conquistas",
    titulo: "Ver suas conquistas",
    passos: [
      { id: "resumo", route: "/(tabs)/perfil/biblioteca-conquistas", page: "Conquistas", title: "Sua biblioteca", description: "Aqui estão as concluídas, as em progresso e as bloqueadas. Toque numa conquista para ver o que falta.", target: "conquistas_resumo" },
    ],
  },
  {
    id: "ler_notificacoes",
    titulo: "Ler os avisos",
    passos: [
      { id: "lista", route: "/(tabs)/notificacoes", page: "Notificações", title: "Seus avisos", description: "Filtre por não lidas e toque num aviso para abrir. Dentro dele você pode silenciar aquele tipo.", target: "notificacoes_lista" },
    ],
  },
  {
    id: "ver_ranking",
    titulo: "Ver o ranking",
    portao: "rank",
    passos: [
      { id: "categorias", route: "/(tabs)/ranking", page: "Ranking", title: "Escolha a categoria", description: "Troque a categoria aqui. Sua posição aparece sempre, mesmo fora do topo.", target: "ranking_categorias" },
    ],
  },
  {
    id: "fazer_amizades",
    titulo: "Conhecer o Social",
    portao: "social",
    passos: [
      { id: "social", route: "/(tabs)/social", page: "Social", title: "Sua turma", description: "Aqui você convida colegas, entra numa guilda, desafia alguém e acompanha as missões do dia e o evento da turma." },
    ],
  },
  {
    id: "controlar_coleta",
    titulo: "Controlar a coleta",
    passos: [
      { id: "camera", route: "/(tabs)/perfil/coleta-dados", page: "Coleta e acessos", title: "Câmera", description: "Ligue ou desligue aqui. Desligar não bloqueia aulas, atividades nem notas.", target: "config_camera" },
      { id: "chat", route: "/(tabs)/perfil/coleta-dados", page: "Coleta e acessos", title: "Chat do mentor", description: "O mesmo vale para o registro do chat. Cada mudança é salva na hora.", target: "config_chat" },
    ],
  },
  {
    id: "gerar_relatorio",
    titulo: "Gerar o relatório",
    passos: [
      { id: "botao", route: "/(tabs)/perfil/relatorio", page: "Relatório dos dados", title: "Gere o PDF", description: "Este botão monta o relatório para guardar ou compartilhar. Gerar não altera seus dados.", target: "config_relatorio" },
    ],
  },
  {
    id: "mudar_metricas",
    titulo: "Mudar as métricas",
    passos: [
      { id: "estilo", route: "/(tabs)/perfil/metricas-estilo", page: "Estilo das métricas", title: "Escolha o estilo", description: "Muda só a aparência do painel. Automático segue o seu perfil.", target: "config_metricas_visual" },
    ],
  },
  {
    id: "modo_foco",
    titulo: "Usar o modo foco",
    passos: [
      { id: "foco", route: "/(tabs)/perfil/modo-foco", page: "Modo foco e avisos", title: "Ligue o foco", description: "Com o foco ligado, nenhuma notificação chega. Ao sair, vem só a mais recente de cada tipo." },
    ],
  },
  {
    id: "lembrete_diario",
    titulo: "Criar um lembrete",
    passos: [
      { id: "lembrete", route: "/(tabs)/perfil/lembrete-diario", page: "Lembrete diário", title: "Escolha o horário", description: "O app avisa nesse horário para você continuar. No navegador, só com o app aberto." },
    ],
  },
];

export function tutorialDisponivel(id: string | null | undefined, aberturas: Aberturas): TutorialDoGuia | null {
  const tutorial = TUTORIAIS_DO_GUIA.find((t) => t.id === id);
  if (!tutorial) return null;
  return !tutorial.portao || aberturas[tutorial.portao] ? tutorial : null;
}
