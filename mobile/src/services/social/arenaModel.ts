/**
 * Normalizacao da arena -- guilda, dupla e solo.
 *
 * Fica separada do servico pelo mesmo motivo de `perfilDoMaterial.ts` e
 * `acumuladorLote.ts`: o servico importa `@/database/supabase` no topo, e
 * arquivo que importa isso nao carrega no harness do node. A regra que decide
 * quem venceu e quanto cada um fez ficaria sem teste nenhum.
 *
 * `formato` diz QUEM joga, `modo` diz COMO se ganha. Sao colunas diferentes no
 * banco desde a `20260920_05`, e misturar as duas de volta aqui reintroduziria
 * o problema que a migracao resolveu.
 */

export type ArenaFormato = "guilda" | "dupla" | "solo";
export type ArenaModo = "todos" | "velocidade" | "precisao";
export type ArenaEstado = "convidado" | "aceito" | "recusado";
export type ArenaStatus = "aberto" | "encerrado";
/**
 * `sem_adversario` nao e empate: e uma rodada que nao aconteceu porque um
 * dos lados nao jogou. Ela existe como valor proprio porque o cliente NAO
 * pode deduzir isso do placar -- deduzir foi exatamente o defeito que deixou
 * desafiar quem nunca aceita pagar vitoria.
 */
export type ArenaResultado = "vitoria" | "empate" | "sem_adversario";

export const ARENA_FORMATOS: readonly ArenaFormato[] = ["guilda", "dupla", "solo"];
export const ARENA_MODOS: readonly ArenaModo[] = ["precisao", "velocidade", "todos"];

/** Quantos adversarios cada formato exige. Guilda nao convoca ninguem. */
export const ADVERSARIOS_POR_FORMATO: Record<ArenaFormato, number> = {
  guilda: 0,
  dupla: 2,
  solo: 1,
};

export const ROTULO_DO_FORMATO: Record<ArenaFormato, string> = {
  guilda: "GUILDA",
  dupla: "DUPLA",
  solo: "SOLO",
};

export const ROTULO_DO_MODO: Record<ArenaModo, string> = {
  precisao: "Precisão",
  velocidade: "Velocidade",
  todos: "Rodada completa",
};

export const EXPLICACAO_DO_FORMATO: Record<ArenaFormato, string> = {
  guilda: "Sua guilda inteira joga junto, contra a régua do modo.",
  dupla: "Você e um aliado contra outros dois da turma.",
  solo: "Você contra um colega da turma.",
};

export const EXPLICACAO_DO_MODO: Record<ArenaModo, string> = {
  precisao: "Vence quem acertar mais.",
  velocidade: "Mais acertos; empate desempata pelo menor tempo.",
  todos: "Só conta quem responder a rodada inteira.",
};

export type ArenaParticipante = {
  alunoId: string;
  nome: string;
  apelido: string | null;
  fotoUrl: string | null;
  perfilAtivo: string | null;
  equipe: 1 | 2;
  estado: ArenaEstado;
  acertos: number;
  respondidas: number;
  tempoMs: number;
};

export type ArenaEquipe = {
  equipe: 1 | 2;
  pontos: number;
  tempoMs: number;
  integrantes: number;
};

export type ArenaDesafio = {
  id: string;
  classeId: number;
  formato: ArenaFormato;
  modo: ArenaModo;
  status: ArenaStatus;
  titulo: string;
  guildaId: string | null;
  guildaNome: string | null;
  guildaRivalId: string | null;
  guildaRivalNome: string | null;
  resultado: ArenaResultado | null;
  criadoPor: string;
  souCriador: boolean;
  criadoEm: string | null;
  encerradoEm: string | null;
  vencedorEquipe: 1 | 2 | null;
  questoes: number;
  meuEstado: ArenaEstado;
  minhaEquipe: 1 | 2;
  minhasRespostas: number;
  participantes: ArenaParticipante[];
  equipes: ArenaEquipe[];
};

export type ArenaQuestao = {
  ordem: number;
  questaoId: number;
  enunciado: string;
  tipo: string | null;
  alternativas: unknown;
  midiaUrl: string | null;
  minhaResposta: string | null;
  correta: boolean | null;
  tempoMs: number | null;
  /** Só chega depois de responder -- o banco esconde antes disso. */
  respostaCorreta: string | null;
};

export type ArenaRodada = {
  id: string;
  formato: ArenaFormato;
  modo: ArenaModo;
  status: ArenaStatus;
  meuEstado: ArenaEstado;
  minhaEquipe: 1 | 2;
  questoes: ArenaQuestao[];
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function inteiro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function equipe(valor: unknown): 1 | 2 {
  return Number(valor) === 2 ? 2 : 1;
}

export function normalizarFormato(valor: unknown): ArenaFormato {
  const bruto = String(valor ?? "").trim().toLowerCase();
  return (ARENA_FORMATOS as readonly string[]).includes(bruto)
    ? (bruto as ArenaFormato)
    : "solo";
}

export function normalizarModo(valor: unknown): ArenaModo {
  const bruto = String(valor ?? "").trim().toLowerCase();
  return (ARENA_MODOS as readonly string[]).includes(bruto)
    ? (bruto as ArenaModo)
    : "precisao";
}

function normalizarResultado(valor: unknown): ArenaResultado | null {
  const bruto = String(valor ?? "").trim().toLowerCase();
  return bruto === "vitoria" || bruto === "empate" || bruto === "sem_adversario"
    ? (bruto as ArenaResultado)
    : null;
}

function normalizarEstado(valor: unknown): ArenaEstado {
  const bruto = String(valor ?? "").trim().toLowerCase();
  return bruto === "aceito" || bruto === "recusado" ? bruto : "convidado";
}

function normalizarParticipante(valor: unknown): ArenaParticipante | null {
  if (!valor || typeof valor !== "object") return null;
  const linha = valor as Record<string, unknown>;
  if (!linha.aluno_id) return null;
  return {
    alunoId: String(linha.aluno_id),
    nome: texto(linha.nome) ?? "Colega",
    apelido: texto(linha.apelido),
    fotoUrl: texto(linha.foto_url),
    perfilAtivo: texto(linha.perfil_ativo),
    equipe: equipe(linha.equipe),
    estado: normalizarEstado(linha.estado),
    acertos: inteiro(linha.acertos),
    respondidas: inteiro(linha.respondidas),
    tempoMs: inteiro(linha.tempo_ms),
  };
}

export function normalizarDesafio(valor: unknown): ArenaDesafio | null {
  if (!valor || typeof valor !== "object") return null;
  const linha = valor as Record<string, unknown>;
  if (!linha.id) return null;
  const participantes = Array.isArray(linha.participantes)
    ? (linha.participantes.map(normalizarParticipante).filter(Boolean) as ArenaParticipante[])
    : [];
  const equipes = Array.isArray(linha.equipes)
    ? linha.equipes.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const bruto = item as Record<string, unknown>;
        return [
          {
            equipe: equipe(bruto.equipe),
            pontos: inteiro(bruto.pontos),
            tempoMs: inteiro(bruto.tempo_ms),
            integrantes: inteiro(bruto.integrantes),
          },
        ];
      })
    : [];
  const vencedor = linha.vencedor_equipe;
  return {
    id: String(linha.id),
    classeId: inteiro(linha.classe_id),
    formato: normalizarFormato(linha.formato),
    modo: normalizarModo(linha.modo),
    status: String(linha.status ?? "aberto") === "encerrado" ? "encerrado" : "aberto",
    titulo: texto(linha.titulo) ?? "Desafio",
    guildaId: texto(linha.guilda_id),
    guildaNome: texto(linha.guilda_nome),
    guildaRivalId: texto(linha.guilda_rival_id),
    guildaRivalNome: texto(linha.guilda_rival_nome),
    resultado: normalizarResultado(linha.resultado),
    criadoPor: String(linha.criado_por ?? ""),
    souCriador: Boolean(linha.sou_criador),
    criadoEm: texto(linha.created_at),
    encerradoEm: texto(linha.encerrado_em),
    vencedorEquipe: vencedor === 1 || vencedor === 2 ? (vencedor as 1 | 2) : null,
    questoes: inteiro(linha.questoes),
    meuEstado: normalizarEstado(linha.meu_estado),
    minhaEquipe: equipe(linha.minha_equipe),
    minhasRespostas: inteiro(linha.minhas_respostas),
    participantes,
    equipes,
  };
}

export function normalizarDesafios(linhas: unknown): ArenaDesafio[] {
  return Array.isArray(linhas)
    ? (linhas.map(normalizarDesafio).filter(Boolean) as ArenaDesafio[])
    : [];
}

export function normalizarRodada(valor: unknown): ArenaRodada | null {
  if (!valor || typeof valor !== "object") return null;
  const linha = valor as Record<string, unknown>;
  if (!linha.id) return null;
  const questoes = Array.isArray(linha.questoes)
    ? linha.questoes.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const bruto = item as Record<string, unknown>;
        const id = Number(bruto.questao_id);
        if (!Number.isFinite(id) || id <= 0) return [];
        return [
          {
            ordem: inteiro(bruto.ordem),
            questaoId: id,
            enunciado: texto(bruto.enunciado) ?? "",
            tipo: texto(bruto.tipo),
            alternativas: bruto.alternativas ?? null,
            midiaUrl: texto(bruto.midia_url),
            minhaResposta: typeof bruto.minha_resposta === "string" ? bruto.minha_resposta : null,
            correta: typeof bruto.correta === "boolean" ? bruto.correta : null,
            tempoMs: bruto.tempo_ms == null ? null : inteiro(bruto.tempo_ms),
            respostaCorreta: texto(bruto.resposta_correta),
          },
        ];
      })
    : [];
  return {
    id: String(linha.id),
    formato: normalizarFormato(linha.formato),
    modo: normalizarModo(linha.modo),
    status: String(linha.status ?? "aberto") === "encerrado" ? "encerrado" : "aberto",
    meuEstado: normalizarEstado(linha.meu_estado),
    minhaEquipe: equipe(linha.minha_equipe),
    questoes,
  };
}

/**
 * As alternativas chegam como JSONB e o professor cadastrou de tudo: array de
 * string, array de objeto `{ texto }` / `{ opcao }`, ou objeto com as letras
 * por chave. Uma lista vazia e resposta legitima -- questao dissertativa nao
 * tem alternativa.
 */
export function alternativasDaQuestao(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => {
      if (typeof item === "string") return item.trim() ? [item] : [];
      if (item && typeof item === "object") {
        const bruto = item as Record<string, unknown>;
        const achado = texto(bruto.texto) ?? texto(bruto.opcao) ?? texto(bruto.label) ?? texto(bruto.valor);
        return achado ? [achado] : [];
      }
      return [];
    });
  }
  if (valor && typeof valor === "object") {
    return Object.values(valor as Record<string, unknown>).flatMap((item) =>
      typeof item === "string" && item.trim() ? [item] : [],
    );
  }
  return [];
}

/**
 * Cooperativo e decidido pela IDENTIDADE do desafio, nunca pelo placar --
 * mesma regra de `arena_encerrar`. Deduzir de "a equipe 2 esta vazia" e o que
 * fazia uma rodada em que o adversario nunca apareceu passar por treino.
 */
export function ehCooperativo(desafio: ArenaDesafio): boolean {
  return desafio.formato === "guilda" && desafio.guildaRivalId === null;
}

/** A rodada acabou para MIM quando respondi tudo. Nao diz nada sobre os outros. */
export function terminei(desafio: ArenaDesafio): boolean {
  return desafio.questoes > 0 && desafio.minhasRespostas >= desafio.questoes;
}

export type ArenaSituacao =
  | "convite"
  | "recusado"
  | "jogando"
  | "aguardando"
  | "venci"
  | "perdi"
  | "empate"
  | "sem_adversario";

/**
 * O que o aluno ve no card.
 *
 * `aguardando` e o estado que faltava na primeira versao: quem respondeu tudo
 * mas cujo adversario ainda nao jogou nao esta "jogando" nem tem resultado, e
 * mostrar o card como se fosse a vez dele e o que faz a pessoa reabrir a
 * rodada procurando questao que nao existe mais.
 */
export function situacaoDoDesafio(desafio: ArenaDesafio): ArenaSituacao {
  if (desafio.meuEstado === "convidado") return "convite";
  if (desafio.meuEstado === "recusado") return "recusado";
  if (desafio.status === "aberto") return terminei(desafio) ? "aguardando" : "jogando";
  // O `resultado` vem do banco. O fallback por `vencedorEquipe` existe so para
  // desafio encerrado ANTES da coluna existir; nele `sem_adversario` e
  // indistinguivel de empate, e e por isso que a coluna foi criada.
  if (desafio.resultado === "sem_adversario") return "sem_adversario";
  if (desafio.vencedorEquipe === null) return "empate";
  return desafio.vencedorEquipe === desafio.minhaEquipe ? "venci" : "perdi";
}

/**
 * Ordem da lista: o que pede acao primeiro.
 *
 * Convite antes de tudo (alguem esta esperando resposta), depois a rodada em
 * que e a minha vez, depois a espera, e por fim o que ja acabou -- em ordem de
 * recencia dentro de cada grupo.
 */
const PESO_DA_SITUACAO: Record<ArenaSituacao, number> = {
  convite: 0,
  jogando: 1,
  aguardando: 2,
  venci: 3,
  empate: 3,
  perdi: 3,
  sem_adversario: 3,
  recusado: 4,
};

export function ordenarDesafios(desafios: readonly ArenaDesafio[]): ArenaDesafio[] {
  return [...desafios].sort((a, b) => {
    const peso = PESO_DA_SITUACAO[situacaoDoDesafio(a)] - PESO_DA_SITUACAO[situacaoDoDesafio(b)];
    if (peso !== 0) return peso;
    return String(b.criadoEm ?? "").localeCompare(String(a.criadoEm ?? ""));
  });
}

export function placarDaEquipe(desafio: ArenaDesafio, numero: 1 | 2): ArenaEquipe {
  return (
    desafio.equipes.find((e) => e.equipe === numero) ?? {
      equipe: numero,
      pontos: 0,
      tempoMs: 0,
      integrantes: 0,
    }
  );
}

export function integrantesDaEquipe(
  desafio: ArenaDesafio,
  numero: 1 | 2,
): ArenaParticipante[] {
  return desafio.participantes.filter((p) => p.equipe === numero);
}

/**
 * O que falta para poder criar. Devolve null quando esta pronto.
 *
 * Fica aqui, e nao no componente, porque e a MESMA regra que
 * `arena_desafio_criar` aplica -- a diferenca e que aqui ela vira texto em vez
 * de excecao. Duas contas divergiriam, e o aluno tomaria erro do servidor num
 * botao que a tela deixou habilitado.
 */
export function faltaParaCriar(params: {
  formato: ArenaFormato;
  guildaId?: string | null;
  guildaRivalId?: string | null;
  aliadoId?: string | null;
  adversarios: readonly string[];
}): string | null {
  const { formato, guildaId, guildaRivalId, aliadoId, adversarios } = params;
  const exigidos = ADVERSARIOS_POR_FORMATO[formato];

  if (formato === "guilda") {
    if (!guildaId) return "Você precisa estar numa guilda desta turma.";
    // Rival igual a própria guilda poria os mesmos alunos nas duas equipes --
    // o banco recusa com `arena_rival_invalida`, e a tela não deve deixar
    // chegar lá.
    if (guildaRivalId && guildaRivalId === guildaId) {
      return "A rival tem de ser outra guilda.";
    }
    return null;
  }
  if (formato === "dupla" && !aliadoId) return "Escolha o seu aliado.";
  if (adversarios.length !== exigidos) {
    return exigidos === 1
      ? "Escolha um adversário."
      : `Escolha ${exigidos} adversários.`;
  }
  const todos = [aliadoId, ...adversarios].filter(Boolean) as string[];
  if (new Set(todos).size !== todos.length) {
    return "Cada pessoa só pode entrar uma vez.";
  }
  return null;
}

/**
 * O que o banco compara para decidir o vencedor: `acertos / (questoes x
 * integrantes)`. Acerto BRUTO nao serve -- pontuacao de equipe e soma, entao
 * uma guilda de 5 bateria uma de 2 so por ser maior. Medido no banco: 4
 * acertos em 2 jogadores (50%) perde para 3 acertos em 1 jogador (75%).
 *
 * Mostrar o bruto no card enquanto o banco decide pelo aproveitamento faria a
 * tela explicar o resultado errado.
 */
export function aproveitamentoDaEquipe(desafio: ArenaDesafio, numero: 1 | 2): number | null {
  const equipe = placarDaEquipe(desafio, numero);
  const base = desafio.questoes * equipe.integrantes;
  if (base <= 0) return null;
  return Math.round((100 * equipe.pontos) / base);
}

export function formatarTempo(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "--";
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos}min ${String(segundos % 60).padStart(2, "0")}s`;
}
