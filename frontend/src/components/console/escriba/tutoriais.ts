// Tutoriais guiados da Lumi: levam o professor pela tela, destacando cada botão,
// como o tutorial de entrada do app do aluno. O catálogo é fechado de propósito:
// o modelo só escolhe o id (paridade com TUTORIAIS_DO_CONSOLE em
// api/app/services/escriba.py) e nunca escreve um passo, porque um passo inventado
// apontaria para um botão que não existe. Lógica pura; a tela é TutorialGuiado.tsx.

import { consolePathForView, type ConsoleView } from "@/pages/consoleSections";
import { TODAS } from "./constantes";

export type PassoDoTutorial = {
  view: ConsoleView;
  /** Aba da Economia (`?aba=`). */
  aba?: string;
  /** `data-tutorial` do elemento. Sem ele na tela (turma vazia, menu em gaveta) o balão vai ao centro. */
  alvo?: string;
  titulo: string;
  texto: string;
};

export type Tutorial = { id: string; titulo: string; passos: PassoDoTutorial[] };

export const TUTORIAIS: Tutorial[] = [
  {
    id: "conhecer_console",
    titulo: "Conhecer o console",
    passos: [
      { view: "dashboard", alvo: "menu-dashboard", titulo: "Visão geral", texto: "Os indicadores da turma: quem está parado, onde a turma trava e quem precisa de atenção." },
      { view: "classes", alvo: "menu-classes", titulo: "Turmas", texto: "O ponto de partida: crie a turma, matricule os alunos e registre a presença." },
      { view: "trilha", alvo: "menu-trilha", titulo: "Trilhas", texto: "O mapa de tópicos, conteúdos e atividades de cada turma." },
      { view: "personalizacoes", alvo: "menu-personalizacoes", titulo: "Personalizações", texto: "O material gerado para os 7 perfis. Confira aqui se algum perfil falhou." },
      { view: "recomendacoes", alvo: "menu-recomendacoes", titulo: "Recomendações", texto: "O que a IA propõe fica aqui até você decidir. Nada chega ao aluno sem a sua aprovação." },
      { view: "notas", alvo: "menu-notas", titulo: "Notas", texto: "Correção de dissertativas e entregas." },
      { view: "missoes", alvo: "menu-missoes", titulo: "Missões", texto: "Objetivos com prazo e pontuação para a turma." },
      { view: "eventos", alvo: "menu-eventos", titulo: "Eventos", texto: "Janelas de tempo com missões, desafios e arena." },
      { view: "economia", alvo: "menu-economia", titulo: "Economia", texto: "Moedas, pontos, loja, prazos, fundo e metas da turma." },
      { view: "ranks", alvo: "menu-ranks", titulo: "Rankings", texto: "Os critérios de classificação e as posições dos alunos." },
    ],
  },
  {
    id: "criar_turma",
    titulo: "Criar uma turma",
    passos: [
      { view: "classes", alvo: "menu-classes", titulo: "Abra Turmas", texto: "Tudo no console parte da turma: a trilha, as matrículas e os indicadores." },
      { view: "classes", alvo: "turma-nova", titulo: "Clique em Nova turma", texto: "Preencha a matéria e a descrição e salve. Depois disso você já pode matricular os alunos." },
    ],
  },
  {
    id: "matricular_alunos",
    titulo: "Matricular alunos",
    passos: [
      { view: "classes", alvo: "menu-classes", titulo: "Abra Turmas", texto: "As matrículas ficam no cartão de cada turma." },
      { view: "classes", alvo: "turma-matriculas", titulo: "Clique em Matrículas", texto: "Busque e marque vários alunos, ou cole uma lista de e-mails. Entram só alunos que já têm conta e acesso liberado para você." },
    ],
  },
  {
    id: "registrar_presenca",
    titulo: "Registrar presença",
    passos: [
      { view: "classes", alvo: "menu-classes", titulo: "Abra Turmas", texto: "A presença é registrada no cartão da turma." },
      { view: "classes", alvo: "turma-presenca", titulo: "Clique em Presença", texto: "Marque a turma inteira ou alguns alunos. Registrar duas vezes no mesmo dia não duplica." },
    ],
  },
  {
    id: "montar_trilha",
    titulo: "Montar a trilha",
    passos: [
      { view: "trilha", alvo: "menu-trilha", titulo: "Abra Trilhas", texto: "Cada turma tem a sua trilha. Escolha a turma no topo da tela." },
      { view: "trilha", alvo: "trilha-gerar", titulo: "Com a IA", texto: "Em Gerar trilha com IA você descreve o plano de ensino e a IA propõe tópicos e ordem. Nada é publicado sem a sua confirmação." },
      { view: "trilha", alvo: "trilha-topico", titulo: "Ou à mão", texto: "Adicione um tópico por assunto. Depois abra o tópico para criar conteúdos, atividades e cards." },
    ],
  },
  {
    id: "criar_missao",
    titulo: "Criar uma missão",
    passos: [
      { view: "missoes", alvo: "menu-missoes", titulo: "Abra Missões", texto: "Uma missão é um objetivo com prazo e pontuação." },
      { view: "missoes", alvo: "missao-nova", titulo: "Clique em Nova missão", texto: "Escolha o tipo: entregas que você corrige, ou metas que o app fecha sozinho. Os itens da missão você monta no editor do tópico." },
    ],
  },
  {
    id: "criar_evento",
    titulo: "Criar um evento",
    passos: [
      { view: "eventos", alvo: "menu-eventos", titulo: "Abra Eventos", texto: "Um evento é uma janela de tempo com missões, desafios e arena." },
      { view: "eventos", alvo: "evento-novo", titulo: "Clique em Novo evento", texto: "Ele nasce como rascunho. Com \"Abrir sozinho no começo\", vai ao ar no horário de início e encerra sozinho no fim." },
    ],
  },
  {
    id: "criar_conquista",
    titulo: "Criar uma conquista",
    passos: [
      { view: "conquistas", alvo: "menu-conquistas", titulo: "Abra Conquistas", texto: "Aqui ficam as conquistas exclusivas da turma." },
      { view: "conquistas", alvo: "conquista-nova", titulo: "Clique em Nova conquista", texto: "Preencha o formulário e salve. O botão fica desligado quando a turma chega ao limite." },
    ],
  },
  {
    id: "criar_ranking",
    titulo: "Criar um ranking",
    passos: [
      { view: "ranks", alvo: "menu-ranks", titulo: "Abra Rankings", texto: "Aqui ficam os critérios de classificação e as posições." },
      { view: "ranks", alvo: "ranking-novo", titulo: "Clique em Novo ranking", texto: "Escolha o critério e salve. Depois é só clicar no ranking para ver as posições." },
    ],
  },
  {
    id: "configurar_economia",
    titulo: "Configurar a economia",
    passos: [
      { view: "economia", alvo: "menu-economia", titulo: "Abra Economia", texto: "Moedas, pontos e loja são configurados por turma." },
      { view: "economia", aba: "valores", alvo: "economia-valores", titulo: "Valores", texto: "Quantos pontos e moedas o aluno ganha por ação. Comece por aqui." },
      { view: "economia", aba: "prazos", alvo: "economia-prazos", titulo: "Prazos e tempo", texto: "Os limites de prazo extra e o que o aluno recebe ao concluir um tópico." },
      { view: "economia", aba: "loja", alvo: "economia-loja", titulo: "Loja", texto: "Preços, estoques e limites dos itens de ajuda." },
      { view: "economia", aba: "fundo", alvo: "economia-fundo", titulo: "Fundo da turma", texto: "Uma meta coletiva: os alunos doam moedas por uma recompensa conjunta." },
      { view: "economia", aba: "metas", alvo: "economia-metas", titulo: "Metas", texto: "Créditos por critérios que a turma atinge." },
    ],
  },
];

export function tutorialPorId(id: string): Tutorial | null {
  return TUTORIAIS.find((t) => t.id === id.trim()) ?? null;
}

export function caminhoDoPasso(passo: PassoDoTutorial, turma: string): string {
  const params = new URLSearchParams();
  if (turma !== TODAS && /^\d+$/.test(turma)) params.set("turma", turma);
  if (passo.aba) params.set("aba", passo.aba);
  const busca = params.toString();
  return `${consolePathForView(passo.view)}${busca ? `?${busca}` : ""}`;
}

export type Retangulo = { top: number; left: number; width: number; height: number };
export type Tela = { width: number; height: number };

/** Elemento escondido ou fora da tela (menu em gaveta fechada) não serve de alvo. */
/** Sem o menu lateral na tela (celular), o passo do menu aponta para o botão que abre a gaveta. */
export function alvoAlternativo(alvo: string): string | null {
  return alvo.startsWith("menu-") && alvo !== "menu-gaveta" ? "menu-gaveta" : null;
}

export function alvoNaTela(r: Retangulo, tela: Tela): boolean {
  return r.width > 0 && r.height > 0 && r.left + r.width > 0 && r.left < tela.width && r.top + r.height > 0 && r.top < tela.height;
}

const MARGEM = 16;
const FOLGA = 14;

/** Onde o balão fica: abaixo do alvo, senão acima, senão ao lado; sem alvo, no centro. */
export function posicaoDoBalao(alvo: Retangulo | null, tela: Tela, balao: { width: number; height: number }): { top: number; left: number } {
  const limite = (valor: number, maximo: number) => Math.max(MARGEM, Math.min(valor, maximo - MARGEM));
  const maxLeft = tela.width - balao.width;
  const maxTop = tela.height - balao.height;
  if (!alvo) return { top: limite(maxTop / 2, maxTop), left: limite(maxLeft / 2, maxLeft) };

  const abaixo = alvo.top + alvo.height + FOLGA;
  const acima = alvo.top - FOLGA - balao.height;
  const aoLado = alvo.left + alvo.width + FOLGA;
  if (aoLado + balao.width <= tela.width - MARGEM && alvo.left < tela.width / 3) {
    return { top: limite(alvo.top, maxTop), left: aoLado };
  }
  const centrado = limite(alvo.left + alvo.width / 2 - balao.width / 2, maxLeft);
  if (abaixo + balao.height <= tela.height - MARGEM) return { top: abaixo, left: centrado };
  if (acima >= MARGEM) return { top: acima, left: centrado };
  return { top: limite(abaixo, maxTop), left: centrado };
}
