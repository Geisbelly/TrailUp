// Regras de leitura do Rank de batalhas (duelos de guilda da turma). Só funções puras.
// Fonte: `arena_professor_resumo` (migration 20261017_04). O protótipo pede "nada de valor negativo":
// nunca se mostra derrota, só vitórias, empates e aproveitamento.

export type LinhaDoRanking = { guildaId: string; nome: string; vitorias: number; empates: number; duelos: number };

export type Duelo = {
  id: string;
  titulo: string;
  formato: "guilda" | "dupla" | "solo";
  modo: "todos" | "velocidade" | "precisao";
  status: "aberto" | "encerrado";
  resultado: "vitoria" | "empate" | "sem_adversario" | null;
  vencedorEquipe: 1 | 2 | null;
  guildaNome: string | null;
  rivalNome: string | null;
  criadoEm: string;
  aceitaram: number;
  equipes: { equipe: number; pontos: number; integrantes: number }[];
};

/** Aproveitamento 0–100: (vitórias + meio ponto por empate) sobre os duelos; sem duelo dá 0. */
export function aproveitamento(l: Pick<LinhaDoRanking, "vitorias" | "empates" | "duelos">): number {
  if (l.duelos <= 0) return 0;
  return Math.round(((l.vitorias + l.empates / 2) / l.duelos) * 100);
}

/** Vitórias, depois empates, depois menos duelos (mesmo saldo com menos jogos é melhor), depois nome. */
export function ordenarRanking(linhas: LinhaDoRanking[]): LinhaDoRanking[] {
  return [...linhas].sort(
    (a, b) => b.vitorias - a.vitorias || b.empates - a.empates || a.duelos - b.duelos || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Posição com empate dividindo o lugar (mesmas vitórias, empates e duelos). */
export function posicoes(linhas: LinhaDoRanking[]): { linha: LinhaDoRanking; posicao: number }[] {
  const ordenado = ordenarRanking(linhas);
  let posicao = 0;
  return ordenado.map((linha, i) => {
    const anterior = ordenado[i - 1];
    const igual = anterior && anterior.vitorias === linha.vitorias && anterior.empates === linha.empates && anterior.duelos === linha.duelos;
    if (!igual) posicao = i + 1;
    return { linha, posicao };
  });
}

export const ROTULO_DO_MODO = { todos: "Todos respondem", velocidade: "Velocidade", precisao: "Precisão" } as const;
export const ROTULO_DO_FORMATO = { guilda: "Guilda", dupla: "Dupla", solo: "Solo" } as const;

export function rotuloDoDesfecho(d: Pick<Duelo, "status" | "resultado" | "vencedorEquipe" | "guildaNome" | "rivalNome">): string {
  if (d.status === "aberto") return "Em andamento";
  if (d.resultado === "sem_adversario") return "Sem adversário";
  if (d.resultado === "empate") return "Empate";
  if (d.resultado === "vitoria") {
    if (!d.rivalNome) return "Desafio cumprido";
    const vencedora = d.vencedorEquipe === 2 ? d.rivalNome : d.guildaNome;
    return vencedora ? `Vitória de ${vencedora}` : "Vitória";
  }
  return "Encerrado";
}

export function tituloDoDuelo(d: Pick<Duelo, "titulo" | "formato" | "guildaNome" | "rivalNome">): string {
  if (d.titulo?.trim()) return d.titulo.trim();
  if (d.formato === "guilda" && d.guildaNome) return d.rivalNome ? `${d.guildaNome} × ${d.rivalNome}` : `Desafio de ${d.guildaNome}`;
  return d.formato === "dupla" ? "Duelo em dupla" : d.formato === "solo" ? "Duelo solo" : "Duelo";
}
