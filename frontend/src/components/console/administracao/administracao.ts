// Administração do dono (migrations 20261105_18 e _25). Era HTML da API; agora são RPCs do banco, que conferem
// `app_e_dono()`. Aqui ficam a leitura sem confiança no formato, os filtros e as regras que a tela precisa.
import { normalizar, type AlunoCandidato } from "../turmas/matriculas";

export type PessoaAluno = { aluno_id: string; nome: string | null; email: string | null };

export type TurmaAdmin = { classe_id: number; nome: string; alunos: string[] };

export type ProfessorAdmin = {
  professor_id: string;
  nome: string | null;
  descricao: string | null;
  instituicao: string | null;
  disciplina: string | null;
  liberado: boolean;
  alunos: PessoaAluno[];
  turmas: TurmaAdmin[];
};

export type Acessos = { professores: ProfessorAdmin[]; alunos: PessoaAluno[] };

export type MolduraAdmin = {
  codigo: string;
  nome: string;
  origem: string;
  preco: number | null;
  ativa: boolean;
  conquista: string | null;
  donos: number;
};

export type AcaoAdmin = {
  acao: string;
  rotulo: string;
  descricao: string | null;
  moldura_codigo: string | null;
  ativa: boolean;
  feitas: number;
};

export type Molduras = { molduras: MolduraAdmin[]; acoes: AcaoAdmin[] };

export type RegistroDaAuditoria = {
  id: number;
  ocorrido_em: string | null;
  operacao: string;
  entidade: string | null;
  entidade_id: string | null;
  classe_id: number | null;
  aluno_id: string | null;
  aluno_nome: string | null;
  antes: unknown;
  depois: unknown;
};

export type Inconsistencia = {
  aluno_id: string | null;
  aluno_nome: string | null;
  saldo: number;
  saldo_negativo: boolean;
  compras_sem_debito: number;
  estornos_sem_credito: number;
};

export type Economia = { operacoes: string[]; auditoria: RegistroDaAuditoria[]; consistencia: Inconsistencia[] };

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const talvez = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : []);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const lerAluno = (a: Record<string, unknown>): PessoaAluno => ({ aluno_id: String(a.aluno_id ?? ""), nome: texto(a.nome), email: texto(a.email) });

export function lerAcessos(dado: unknown): Acessos | null {
  const d = objeto(dado);
  if (!d) return null;
  return {
    professores: lista(d.professores).map((p) => ({
      professor_id: String(p.professor_id ?? ""),
      nome: texto(p.nome),
      descricao: texto(p.descricao),
      instituicao: texto(p.instituicao),
      disciplina: texto(p.disciplina),
      liberado: p.liberado === true,
      alunos: lista(p.alunos).map(lerAluno),
      turmas: lista(p.turmas).map((t) => ({
        classe_id: numero(t.classe_id),
        nome: texto(t.nome)?.trim() || `Turma ${numero(t.classe_id)}`,
        alunos: textos(t.alunos),
      })),
    })),
    alunos: lista(d.alunos).map(lerAluno),
  };
}

export function lerMolduras(dado: unknown): Molduras | null {
  const d = objeto(dado);
  if (!d) return null;
  return {
    molduras: lista(d.molduras).map((m) => ({
      codigo: String(m.codigo ?? ""),
      nome: texto(m.nome) ?? String(m.codigo ?? ""),
      origem: texto(m.origem) ?? "?",
      preco: talvez(m.preco),
      ativa: m.ativa === true,
      conquista: texto(m.conquista),
      donos: numero(m.donos),
    })),
    acoes: lista(d.acoes).map((a) => ({
      acao: String(a.acao ?? ""),
      rotulo: texto(a.rotulo) ?? String(a.acao ?? ""),
      descricao: texto(a.descricao),
      moldura_codigo: texto(a.moldura_codigo),
      ativa: a.ativa === true,
      feitas: numero(a.feitas),
    })),
  };
}

export function lerEconomia(dado: unknown): Economia | null {
  const d = objeto(dado);
  if (!d) return null;
  return {
    operacoes: textos(d.operacoes),
    auditoria: lista(d.auditoria).map((e) => ({
      id: numero(e.id),
      ocorrido_em: texto(e.ocorrido_em),
      operacao: texto(e.operacao) ?? "?",
      entidade: texto(e.entidade),
      entidade_id: e.entidade_id === null || e.entidade_id === undefined ? null : String(e.entidade_id),
      classe_id: talvez(e.classe_id),
      aluno_id: texto(e.aluno_id),
      aluno_nome: texto(e.aluno_nome),
      antes: e.antes ?? null,
      depois: e.depois ?? null,
    })),
    consistencia: lista(d.consistencia).map((c) => ({
      aluno_id: texto(c.aluno_id),
      aluno_nome: texto(c.aluno_nome),
      saldo: numero(c.saldo),
      saldo_negativo: c.saldo_negativo === true,
      compras_sem_debito: numero(c.compras_sem_debito),
      estornos_sem_credito: numero(c.estornos_sem_credito),
    })),
  };
}

export const nomeDoAluno = (a: PessoaAluno): string => a.nome ?? a.email ?? "Aluno sem nome";
export const nomeDoProfessor = (p: ProfessorAdmin): string => p.nome ?? "Professor sem nome";
export const candidatosDe = (alunos: PessoaAluno[]): AlunoCandidato[] => alunos.map((a) => ({ id: a.aluno_id, nome: nomeDoAluno(a), email: a.email }));

export type SituacaoDoProfessor = "todos" | "liberados" | "bloqueados";

/** Nome, instituição e disciplina, sem acento nem caixa. Bloqueados vêm antes: são os que pedem ação. */
export function filtrarProfessores(professores: ProfessorAdmin[], termo: string, situacao: SituacaoDoProfessor): ProfessorAdmin[] {
  const t = normalizar(termo);
  return professores
    .filter((p) => situacao === "todos" || p.liberado === (situacao === "liberados"))
    .filter((p) => !t || [p.nome, p.instituicao, p.disciplina].some((c) => normalizar(c).includes(t)))
    .sort((a, b) => Number(a.liberado) - Number(b.liberado));
}

/** Alunos diferentes nas turmas do professor: quem está em duas turmas conta uma vez. */
export function contarAlunosDasTurmas(p: ProfessorAdmin): number {
  return new Set(p.turmas.flatMap((t) => t.alunos)).size;
}

export type TurmaDoAluno = { classe_id: number; nome: string; professor: string };

export function todasAsTurmas(acessos: Acessos): TurmaDoAluno[] {
  return acessos.professores.flatMap((p) => p.turmas.map((t) => ({ classe_id: t.classe_id, nome: t.nome, professor: nomeDoProfessor(p) })));
}

export function turmasPorAluno(acessos: Acessos): Map<string, TurmaDoAluno[]> {
  const mapa = new Map<string, TurmaDoAluno[]>();
  for (const p of acessos.professores) {
    for (const t of p.turmas) {
      for (const aluno of t.alunos) {
        mapa.set(aluno, [...(mapa.get(aluno) ?? []), { classe_id: t.classe_id, nome: t.nome, professor: nomeDoProfessor(p) }]);
      }
    }
  }
  return mapa;
}

export type FiltroDeAluno = "todos" | "sem_turma";

export function filtrarAlunos(alunos: PessoaAluno[], porAluno: Map<string, TurmaDoAluno[]>, termo: string, filtro: FiltroDeAluno): PessoaAluno[] {
  const t = normalizar(termo);
  return alunos
    .filter((a) => filtro === "todos" || !porAluno.get(a.aluno_id)?.length)
    .filter((a) => !t || normalizar(a.nome).includes(t) || normalizar(a.email).includes(t));
}

export type FiltroDeOrigem = "todas" | "loja" | "conquista" | "acao";

export function filtrarMolduras(molduras: MolduraAdmin[], termo: string, origem: FiltroDeOrigem): MolduraAdmin[] {
  const t = normalizar(termo);
  return molduras.filter((m) => (origem === "todas" || m.origem === origem) && (!t || normalizar(m.nome).includes(t) || normalizar(m.conquista).includes(t)));
}

/** O que libera uma moldura de ação. Sem ação ligada ela não sai para ninguém, e a tela precisa dizer isso. */
export function comoLiberaARara(codigo: string, acoes: AcaoAdmin[]): { texto: string; alerta: boolean } {
  const acao = acoes.find((a) => a.moldura_codigo === codigo);
  if (!acao) return { texto: "Nenhuma ação libera esta moldura", alerta: true };
  return acao.ativa ? { texto: `Ação: ${acao.rotulo}`, alerta: false } : { texto: `Ação: ${acao.rotulo} (desligada)`, alerta: true };
}

/** Preço só vale na loja, de 1 a 1000. Devolve o valor a gravar, ou null quando a moldura não tem preço. */
export function precoParaGravar(origem: string, digitado: string): { ok: true; preco: number | null } | { ok: false } {
  if (origem !== "loja") return { ok: true, preco: null };
  const preco = Number(digitado);
  return digitado.trim() !== "" && Number.isInteger(preco) && preco >= 1 && preco <= 1000 ? { ok: true, preco } : { ok: false };
}

const valor = (v: unknown): string => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Só o que mudou: `preco: 10 → 20`. Sem antes nem depois, um traço. O ator da moldura fica de fora: não é mudança. */
export function resumirMudanca(antes: unknown, depois: unknown): string {
  const a = objeto(antes);
  const d = objeto(depois);
  if (!a && !d) return antes === null && depois === null ? "—" : `${valor(antes)} → ${valor(depois)}`;
  const chaves = [...new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})])].filter((c) => c !== "ator");
  const mudou = chaves.filter((c) => valor(a?.[c]) !== valor(d?.[c]));
  return mudou.length ? mudou.map((c) => `${c}: ${valor(a?.[c])} → ${valor(d?.[c])}`).join("; ") : "sem mudança";
}
