// Administração do dono (migration 20261105_16). Era HTML da API; agora são RPCs do banco, que conferem
// `app_e_dono()`. Aqui ficam a chamada, a leitura sem confiança no formato e as regras que a tela precisa.
export type PessoaAluno = { aluno_id: string; nome: string | null; email: string | null };

export type ProfessorAdmin = {
  professor_id: string;
  nome: string | null;
  descricao: string | null;
  instituicao: string | null;
  disciplina: string | null;
  liberado: boolean;
  alunos: PessoaAluno[];
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
  antes: unknown;
  depois: unknown;
};

export type Inconsistencia = {
  aluno_id: string | null;
  saldo: number;
  saldo_negativo: boolean;
  compras_sem_debito: number;
  estornos_sem_credito: number;
};

export type Economia = { auditoria: RegistroDaAuditoria[]; consistencia: Inconsistencia[] };

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const talvez = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : []);
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
    auditoria: lista(d.auditoria).map((e) => ({
      id: numero(e.id),
      ocorrido_em: texto(e.ocorrido_em),
      operacao: texto(e.operacao) ?? "?",
      entidade: texto(e.entidade),
      entidade_id: e.entidade_id === null || e.entidade_id === undefined ? null : String(e.entidade_id),
      classe_id: talvez(e.classe_id),
      aluno_id: texto(e.aluno_id),
      antes: e.antes ?? null,
      depois: e.depois ?? null,
    })),
    consistencia: lista(d.consistencia).map((c) => ({
      aluno_id: texto(c.aluno_id),
      saldo: numero(c.saldo),
      saldo_negativo: c.saldo_negativo === true,
      compras_sem_debito: numero(c.compras_sem_debito),
      estornos_sem_credito: numero(c.estornos_sem_credito),
    })),
  };
}

/** Quem ainda não está vinculado: oferecer quem já está só geraria um clique sem efeito. */
export function alunosParaVincular(professor: ProfessorAdmin, alunos: PessoaAluno[]): PessoaAluno[] {
  const vinculados = new Set(professor.alunos.map((a) => a.aluno_id));
  return alunos.filter((a) => !vinculados.has(a.aluno_id));
}

export const rotuloDoAluno = (a: PessoaAluno): string => (a.nome && a.email ? `${a.nome} (${a.email})` : a.nome ?? a.email ?? a.aluno_id);

/** Preço só vale na loja, de 1 a 1000. Devolve o valor a gravar, ou null quando a moldura não tem preço. */
export function precoParaGravar(origem: string, digitado: string): { ok: true; preco: number | null } | { ok: false } {
  if (origem !== "loja") return { ok: true, preco: null };
  const preco = Number(digitado);
  return digitado.trim() !== "" && Number.isInteger(preco) && preco >= 1 && preco <= 1000 ? { ok: true, preco } : { ok: false };
}
