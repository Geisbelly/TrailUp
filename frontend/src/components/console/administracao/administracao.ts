// Administração do dono (migrations 20261105_18, _25 e _27). Era HTML da API; agora são RPCs do banco, que conferem
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

/** Onde a foto entra, na tela de 256 × 256 de `mobile/src/utils/profileFrameLayout.ts`. */
export type Abertura = { x: number; y: number; radius: number };

export type MolduraAdmin = {
  codigo: string;
  nome: string;
  origem: string;
  preco: number | null;
  ativa: boolean;
  conquista: string | null;
  conquista_id: number | null;
  imagem_url: string | null;
  abertura: Abertura | null;
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

export type ConquistaDoSistema = { id: number; nome: string; moldura: string | null };

export type Molduras = { molduras: MolduraAdmin[]; acoes: AcaoAdmin[]; conquistas: ConquistaDoSistema[] };

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

const lerAbertura = (v: unknown): Abertura | null => {
  const a = objeto(v);
  const x = talvez(a?.x);
  const y = talvez(a?.y);
  const radius = talvez(a?.radius);
  return x === null || y === null || radius === null ? null : { x, y, radius };
};

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
      conquista_id: talvez(m.conquista_id),
      imagem_url: texto(m.imagem_url),
      abertura: lerAbertura(m.abertura),
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
    conquistas: lista(d.conquistas).map((c) => ({ id: numero(c.id), nome: texto(c.nome) ?? `Conquista ${numero(c.id)}`, moldura: texto(c.moldura) })),
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

// Termos, aceites e assinaturas (migration 20261105_27). Prova só cresce: o dono acrescenta, nunca reescreve.
export type Decisao = "accepted" | "rejected";

export type RegistroDeTermo = { status: Decisao; versao: string; decidido_em: string | null; vigente: boolean; metodo: string | null };

export type Idade = "desconhecida" | "menor" | "maior";

export type TermosDoAluno = PessoaAluno & {
  idade: Idade;
  modo_restrito: boolean;
  termo: RegistroDeTermo | null;
  responsavel: RegistroDeTermo | null;
  pesquisa: RegistroDeTermo | null;
};

export type TermosDoProfessor = {
  professor_id: string;
  nome: string | null;
  email: string | null;
  instituicao: string | null;
  liberado: boolean;
  aceite: RegistroDeTermo | null;
};

export type PainelDeTermos = {
  versoes: { responsavel: string; pesquisa: string; professor: string };
  alunos: TermosDoAluno[];
  professores: TermosDoProfessor[];
};

const lerRegistro = (v: unknown): RegistroDeTermo | null => {
  const r = objeto(v);
  if (!r) return null;
  return {
    status: r.status === "accepted" ? "accepted" : "rejected",
    versao: texto(r.versao) ?? "?",
    decidido_em: texto(r.decidido_em),
    vigente: r.vigente === true,
    metodo: texto(r.metodo),
  };
};

export function lerTermos(dado: unknown): PainelDeTermos | null {
  const d = objeto(dado);
  const versoes = objeto(d?.versoes);
  if (!d || !versoes) return null;
  return {
    versoes: {
      responsavel: texto(versoes.responsavel) ?? "?",
      pesquisa: texto(versoes.pesquisa) ?? "?",
      professor: texto(versoes.professor) ?? "?",
    },
    alunos: lista(d.alunos).map((a) => ({
      ...lerAluno(a),
      idade: a.idade === "menor" || a.idade === "maior" ? a.idade : "desconhecida",
      modo_restrito: a.modo_restrito === true,
      termo: lerRegistro(a.termo),
      responsavel: lerRegistro(a.responsavel),
      pesquisa: lerRegistro(a.pesquisa),
    })),
    professores: lista(d.professores).map((p) => ({
      professor_id: String(p.professor_id ?? ""),
      nome: texto(p.nome),
      email: texto(p.email),
      instituicao: texto(p.instituicao),
      liberado: p.liberado === true,
      aceite: lerRegistro(p.aceite),
    })),
  };
}

export type LinhaDoHistorico = {
  id: number;
  status: Decisao;
  versao: string;
  decidido_em: string | null;
  metodo: string | null;
  nome: string | null;
  relacao: string | null;
  finalidades: string[];
  motivo: string | null;
  canal: string | null;
  plataforma: string | null;
  por: string | null;
};

export type CorrecaoDeNascimento = { data_anterior: string | null; data_nova: string | null; motivo: string; corrigido_em: string | null; por: string | null };

export type DetalheDoAluno = {
  nascimento: string | null;
  correcoes: CorrecaoDeNascimento[];
  termos: LinhaDoHistorico[];
  responsavel: LinhaDoHistorico[];
  pesquisa: LinhaDoHistorico[];
};

const lerHistorico = (v: unknown): LinhaDoHistorico[] =>
  lista(v).map((l) => {
    const finalidades = objeto(l.finalidades) ?? {};
    return {
      id: numero(l.id),
      status: l.status === "accepted" ? "accepted" : "rejected",
      versao: texto(l.versao) ?? "?",
      decidido_em: texto(l.decidido_em),
      metodo: texto(l.metodo),
      nome: texto(l.nome),
      relacao: texto(l.relacao),
      finalidades: Object.keys(finalidades).filter((k) => finalidades[k] === true),
      motivo: texto(l.motivo),
      canal: texto(l.canal),
      plataforma: texto(l.plataforma),
      por: texto(l.por),
    };
  });

export function lerDetalheDoAluno(dado: unknown): DetalheDoAluno | null {
  const d = objeto(dado);
  if (!d) return null;
  return {
    nascimento: texto(objeto(d.nascimento)?.data),
    correcoes: lista(d.correcoes).map((c) => ({
      data_anterior: texto(c.data_anterior),
      data_nova: texto(c.data_nova),
      motivo: texto(c.motivo) ?? "",
      corrigido_em: texto(c.corrigido_em),
      por: texto(c.por),
    })),
    termos: lerHistorico(d.termos),
    responsavel: lerHistorico(d.responsavel),
    pesquisa: lerHistorico(d.pesquisa),
  };
}

export function lerDetalheDoProfessor(dado: unknown): LinhaDoHistorico[] | null {
  const d = objeto(dado);
  return d ? lerHistorico(d.aceites) : null;
}

export type Selo = { texto: string; pendente: boolean };

export function seloDaIdade(idade: Idade): Selo {
  if (idade === "menor") return { texto: "Menor de idade", pendente: false };
  if (idade === "maior") return { texto: "Maior de idade", pendente: false };
  return { texto: "Sem data", pendente: true };
}

export function seloDoTermo(r: RegistroDeTermo | null): Selo {
  if (!r) return { texto: "Sem registro", pendente: true };
  return r.status === "accepted" ? { texto: "Aceitou", pendente: false } : { texto: "Recusou", pendente: true };
}

export function seloDoResponsavel(a: Pick<TermosDoAluno, "idade" | "responsavel">): Selo {
  const r = a.responsavel;
  if (a.idade === "maior") return { texto: "Não se aplica", pendente: false };
  if (!r) return { texto: "Sem assinatura", pendente: a.idade === "menor" };
  if (r.status === "rejected") return { texto: "Não autorizou", pendente: true };
  if (!r.vigente) return { texto: "Versão antiga", pendente: true };
  return { texto: r.metodo === "papel" ? "Assinou em papel" : "Aceitou no app", pendente: false };
}

export function seloDaPesquisa(r: RegistroDeTermo | null): Selo {
  if (!r) return { texto: "Sem decisão", pendente: false };
  if (r.status === "rejected") return { texto: "Recusou", pendente: false };
  return r.vigente ? { texto: "Aceitou", pendente: false } : { texto: "Versão antiga", pendente: true };
}

export function seloDoProfessor(r: RegistroDeTermo | null): Selo {
  if (!r) return { texto: "Sem aceite registrado", pendente: true };
  if (r.status === "rejected") return { texto: "Aceite revogado", pendente: true };
  return r.vigente ? { texto: "Aceitou", pendente: false } : { texto: "Versão antiga", pendente: true };
}

export type FiltroDeTermos = "todos" | "pendentes";

export const alunoTemPendencia = (a: TermosDoAluno): boolean => a.modo_restrito || seloDoTermo(a.termo).pendente;

export function filtrarTermos<T extends { nome: string | null; email: string | null }>(pessoas: T[], busca: string, filtro: FiltroDeTermos, pendente: (p: T) => boolean): T[] {
  const termo = normalizar(busca);
  return pessoas.filter((p) => (filtro === "todos" || pendente(p)) && (!termo || normalizar(`${p.nome ?? ""} ${p.email ?? ""}`).includes(termo)));
}

export const MOTIVO_MINIMO = 5;

export function motivoValido(motivo: string): boolean {
  const limpo = motivo.trim();
  return limpo.length >= MOTIVO_MINIMO && limpo.length <= 500;
}

// Imagem das molduras (migration 20261105_28).
export const TELA_DA_MOLDURA = 256;
export const ABERTURA_PADRAO: Abertura = { x: 128, y: 128, radius: 90 };
export const IMAGEM_MAX_BYTES = 1024 * 1024;
const TIPOS_DE_IMAGEM: Record<string, string> = { "image/png": "png", "image/webp": "webp" };

/** Sem imagem própria, vale o desenho do pacote do app, copiado em `public/molduras`. */
export const imagemDaMoldura = (m: Pick<MolduraAdmin, "codigo" | "imagem_url">): string => m.imagem_url ?? `/molduras/${m.codigo}.webp`;

export function problemaDaImagem(arquivo: { type: string; size: number }): string | null {
  if (!TIPOS_DE_IMAGEM[arquivo.type.toLowerCase()]) return "Use uma imagem PNG ou WebP, com fundo transparente.";
  if (arquivo.size > IMAGEM_MAX_BYTES) return "A imagem pode ter no máximo 1 MB.";
  return null;
}

export function problemaDoTamanho(largura: number, altura: number): string | null {
  if (largura !== altura) return "A imagem precisa ser quadrada.";
  if (largura < TELA_DA_MOLDURA) return `A imagem precisa ter pelo menos ${TELA_DA_MOLDURA} × ${TELA_DA_MOLDURA} px.`;
  return null;
}

export const caminhoDaImagem = (codigo: string, tipo: string, agora: number): string => `${codigo}-${agora}.${TIPOS_DE_IMAGEM[tipo.toLowerCase()] ?? "png"}`;

const CAMINHO_NO_BUCKET = /\/storage\/v1\/object\/public\/molduras\/([A-Za-z0-9._-]+)$/;

export const caminhoDaUrl = (url: string | null | undefined): string | null => (url ? (CAMINHO_NO_BUCKET.exec(url)?.[1] ?? null) : null);

/** O código nasce do nome: é a chave da moldura e não muda depois. */
export function codigoDoNome(nome: string): string {
  const base = normalizar(nome).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  if (!base) return "";
  return /^[a-z]/.test(base) ? base : `m_${base}`.slice(0, 41);
}

export function aberturaCabe(a: Abertura): boolean {
  return a.radius >= 20 && a.radius <= 128 && a.x - a.radius >= 0 && a.y - a.radius >= 0 && a.x + a.radius <= TELA_DA_MOLDURA && a.y + a.radius <= TELA_DA_MOLDURA;
}

export type RascunhoDaMoldura = { nome: string; origem: "loja" | "conquista" | "acao"; preco: string; conquista: string };

/** A frase do que falta, ou null quando dá para salvar. */
export function problemaDoRascunho(r: RascunhoDaMoldura): string | null {
  if (!r.nome.trim()) return "Dê um nome à moldura.";
  if (r.nome.trim().length > 60) return "O nome pode ter até 60 caracteres.";
  if (r.origem === "conquista" && !r.conquista) return "Escolha a conquista que libera a moldura.";
  return r.origem === "loja" && !precoParaGravar("loja", r.preco).ok ? "O preço vai de 1 a 1000 moedas." : null;
}
