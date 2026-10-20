/**
 * A arena (20261021_19): desafio com adversário, que vale Elo.
 *
 * O que vem de `arena_listar` e o que a tela decide a partir disso. Nada aqui conta ponto nem
 * Elo: quem fecha a partida e mexe no rating é o banco (`arena_responder` → `arena_encerrar` →
 * `fn_desafio_encerrar` → `fn_elo_aplicar`). A tela só mostra o estado e oferece a próxima ação.
 */

export type FormatoDaArena = "solo" | "dupla" | "guilda";
export type ModoDaArena = "precisao" | "velocidade" | "todos";

export type ParticipanteDaArena = {
  alunoId: string;
  nome: string;
  equipe: number;
  estado: string;
  acertos: number;
  respondidas: number;
};

export type EquipeDaArena = { equipe: number; pontos: number; integrantes: number };

/** A minha linha de `ranqueada_elo_partida` neste desafio (decisão 10). Só existe depois do fechamento. */
export type MeuElo = { delta: number; ratingAntes: number; ratingDepois: number };

export function normalizeMeuElo(valor: unknown): MeuElo | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const delta = Number(row.delta);
  const depois = Number(row.rating_depois);
  if (!Number.isFinite(delta) || !Number.isFinite(depois)) return null;
  const antes = Number(row.rating_antes);
  return { delta, ratingAntes: Number.isFinite(antes) ? antes : depois - delta, ratingDepois: depois };
}

/** "+20 Elo", "−5 Elo", "±0 Elo". */
export function rotuloDoElo(elo: MeuElo): string {
  if (elo.delta > 0) return `+${elo.delta} Elo`;
  if (elo.delta < 0) return `−${Math.abs(elo.delta)} Elo`;
  return "±0 Elo";
}

export type DesafioDaArena = {
  id: string;
  formato: string;
  modo: string;
  status: "aberto" | "encerrado";
  resultado: string | null;
  vencedorEquipe: number | null;
  guildaNome: string | null;
  rivalNome: string | null;
  souCriador: boolean;
  meuEstado: string | null;
  minhaEquipe: number | null;
  questoes: number;
  minhasRespostas: number;
  participantes: ParticipanteDaArena[];
  equipes: EquipeDaArena[];
  meuElo: MeuElo | null;
  createdAt: string | null;
};

/** O que a tela oferece para cada desafio da lista. */
export type SituacaoNaArena = "convite" | "jogar" | "aguardando" | "encerrado" | "fora";

const numero = (v: unknown, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function normalizeParticipante(valor: unknown): ParticipanteDaArena | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const alunoId = texto(row.aluno_id);
  if (!alunoId) return null;
  return {
    alunoId,
    nome: texto(row.apelido) ?? texto(row.nome) ?? "Colega",
    equipe: numero(row.equipe, 1),
    estado: texto(row.estado) ?? "convidado",
    acertos: numero(row.acertos),
    respondidas: numero(row.respondidas),
  };
}

export function normalizeDesafioDaArena(valor: unknown): DesafioDaArena | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const id = texto(row.id);
  if (!id) return null;
  const vencedor = row.vencedor_equipe === null || row.vencedor_equipe === undefined ? null : numero(row.vencedor_equipe, 0) || null;
  return {
    id,
    formato: texto(row.formato) ?? "solo",
    modo: texto(row.modo) ?? "precisao",
    status: row.status === "encerrado" ? "encerrado" : "aberto",
    resultado: texto(row.resultado),
    vencedorEquipe: vencedor,
    guildaNome: texto(row.guilda_nome),
    rivalNome: texto(row.guilda_rival_nome),
    souCriador: row.sou_criador === true,
    meuEstado: texto(row.meu_estado),
    minhaEquipe: row.minha_equipe === null || row.minha_equipe === undefined ? null : numero(row.minha_equipe, 0) || null,
    questoes: numero(row.questoes),
    minhasRespostas: numero(row.minhas_respostas),
    participantes: Array.isArray(row.participantes)
      ? (row.participantes.map(normalizeParticipante).filter(Boolean) as ParticipanteDaArena[])
      : [],
    equipes: Array.isArray(row.equipes)
      ? row.equipes
          .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"))
          .map((e) => ({ equipe: numero(e.equipe, 1), pontos: numero(e.pontos), integrantes: numero(e.integrantes) }))
      : [],
    meuElo: normalizeMeuElo(row.meu_elo),
    createdAt: texto(row.created_at),
  };
}

/**
 * Só entra na lista o que é da arena: desafio com equipe 2. `arena_listar` devolve todo desafio
 * da turma em que eu estou, inclusive os cooperativos da guilda, que se jogam pelo chat.
 */
export function normalizeArena(valor: unknown): DesafioDaArena[] {
  if (!Array.isArray(valor)) return [];
  return (valor.map(normalizeDesafioDaArena).filter(Boolean) as DesafioDaArena[]).filter(ehCompetitivo);
}

export function ehCompetitivo(d: DesafioDaArena): boolean {
  return d.participantes.some((p) => p.equipe === 2);
}

export function situacaoNaArena(d: DesafioDaArena): SituacaoNaArena {
  // Quem recusou não jogou: o desafio pode até ter fechado (recusa fecha na hora), mas não é dele.
  if (d.meuEstado === "recusado") return "fora";
  if (d.status === "encerrado") return "encerrado";
  if (d.meuEstado === "convidado") return "convite";
  if (d.meuEstado !== "aceito") return "fora";
  return d.minhasRespostas < d.questoes ? "jogar" : "aguardando";
}

/** Do ponto de vista de quem está olhando. `null` enquanto o desafio está aberto. */
export function resultadoParaMim(d: DesafioDaArena): "vitoria" | "derrota" | "empate" | "sem_adversario" | null {
  if (d.status !== "encerrado") return null;
  if (d.resultado === "empate") return "empate";
  if (d.resultado === "sem_adversario") return "sem_adversario";
  if (d.resultado === "vitoria" && d.vencedorEquipe !== null && d.minhaEquipe !== null) {
    return d.vencedorEquipe === d.minhaEquipe ? "vitoria" : "derrota";
  }
  return null;
}

export function tituloDoDesafio(d: DesafioDaArena, meuId: string | null): string {
  if (d.formato === "guilda") return `${d.guildaNome ?? "Guilda"} x ${d.rivalNome ?? "Guilda"}`;
  const nomes = (equipe: number) =>
    d.participantes
      .filter((p) => p.equipe === equipe)
      .map((p) => (p.alunoId === meuId ? "Você" : p.nome))
      .join(" e ") || "?";
  return `${nomes(1)} x ${nomes(2)}`;
}

/** Quem ainda não respondeu ao convite — é o que segura a partida aberta. */
export function pendentes(d: DesafioDaArena): ParticipanteDaArena[] {
  return d.participantes.filter((p) => p.estado === "convidado");
}

export type NovoDesafio = {
  formato: FormatoDaArena;
  aliado: string | null;
  adversarios: string[];
  guildaId: string | null;
  guildaRival: string | null;
};

/**
 * As mesmas regras que `arena_desafio_criar` cobra, para a tela não deixar enviar o que o banco
 * vai recusar. O banco continua sendo a palavra final.
 */
export function validarNovoDesafio(n: NovoDesafio, meuId: string | null): string | null {
  const todos = [n.aliado, ...n.adversarios].filter((x): x is string => Boolean(x));
  if (meuId && todos.includes(meuId)) return "Você não pode desafiar a si mesmo.";
  if (new Set(todos).size !== todos.length) return "Cada colega só pode aparecer uma vez.";
  if (n.formato === "solo") {
    return n.adversarios.length === 1 ? null : "Escolha um adversário.";
  }
  if (n.formato === "dupla") {
    if (!n.aliado) return "Escolha sua dupla.";
    return n.adversarios.length === 2 ? null : "Escolha os dois adversários.";
  }
  if (!n.guildaId) return "Você precisa estar numa guilda.";
  if (!n.guildaRival) return "Escolha a guilda rival.";
  return n.guildaRival === n.guildaId ? "A rival tem de ser outra guilda." : null;
}

/** Os argumentos de `arena_desafio_criar`, com os campos que não valem para o formato em null. */
export function argumentosDeCriacao(classeId: number, n: NovoDesafio, modo: ModoDaArena, quantidade: number) {
  return {
    p_classe_id: classeId,
    p_formato: n.formato,
    p_modo: modo,
    p_quantidade: Math.max(1, Math.min(10, Math.round(quantidade))),
    p_guilda_id: n.formato === "guilda" ? n.guildaId : null,
    p_aliado: n.formato === "dupla" ? n.aliado : null,
    p_adversarios: n.formato === "guilda" ? null : n.adversarios,
    p_guilda_rival: n.formato === "guilda" ? n.guildaRival : null,
  };
}

const ERROS: [string, string][] = [
  ["arena_limite_diario_adversario", "Vocês já jogaram o limite de partidas ranqueadas de hoje um contra o outro. Amanhã tem revanche."],
  ["arena_participante_bloqueado", "Há um bloqueio entre você e esse colega."],
  ["arena_participante_fora_da_turma", "Esse colega não está nesta turma."],
  ["arena_participante_repetido", "Cada colega só pode aparecer uma vez."],
  ["arena_participante_invalido", "Você não pode desafiar a si mesmo."],
  ["arena_rival_sem_membros", "A guilda rival não tem membros."],
  ["arena_rival_invalida", "Escolha outra guilda rival."],
  ["arena_sem_questoes_liberadas", "Ainda não há questões liberadas para todos."],
  ["arena_formato_invalido", "Confira os participantes do formato."],
  ["arena_convite_indisponivel", "Este convite já não está aberto."],
  ["arena_desafio_cooperativo", "Este desafio é da guilda: jogue pelo chat."],
  ["guilda_desafio_e_da_arena", "Este desafio é da Arena: jogue pela aba Arena."],
  ["arena_questao_fora_do_desafio", "Esta questão não é deste desafio."],
  ["arena_sem_permissao", "Você não está neste desafio."],
  ["arena_sem_sessao", "Entre de novo para jogar."],
];

export function mensagemDaArena(erro: unknown): string {
  const codigo = String((erro as { message?: unknown })?.message ?? erro ?? "");
  // O banco manda o limite no HINT (`arena_limite_diario_mesmo_adversario`, padrão 3).
  const limite = Number((erro as { hint?: unknown })?.hint);
  if (codigo.includes("arena_limite_diario_adversario") && Number.isFinite(limite) && limite > 0) {
    return `Vocês já jogaram ${limite} ${limite === 1 ? "partida ranqueada" : "partidas ranqueadas"} hoje um contra o outro, o limite do dia. Amanhã tem revanche.`;
  }
  return ERROS.find(([c]) => codigo.includes(c))?.[1] ?? "Não foi possível concluir. Tente de novo.";
}
