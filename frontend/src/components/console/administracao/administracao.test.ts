import { describe, expect, it } from "vitest";
import {
  alunoTemPendencia,
  candidatosDe,
  comoLiberaARara,
  contarAlunosDasTurmas,
  filtrarAlunos,
  filtrarMolduras,
  filtrarProfessores,
  filtrarTermos,
  lerAcessos,
  lerDetalheDoAluno,
  lerDetalheDoProfessor,
  lerEconomia,
  lerMolduras,
  lerTermos,
  motivoValido,
  precoParaGravar,
  seloDaIdade,
  seloDoProfessor,
  seloDoResponsavel,
  seloDoTermo,
  resumirMudanca,
  todasAsTurmas,
  turmasPorAluno,
  type MolduraAdmin,
  type ProfessorAdmin,
} from "./administracao";

const prof = (p: Partial<ProfessorAdmin>): ProfessorAdmin => ({ professor_id: "p", nome: null, descricao: null, instituicao: null, disciplina: null, liberado: true, alunos: [], turmas: [], ...p });
const ana = { aluno_id: "a", nome: "Ana", email: "ana@example.test" };
const bia = { aluno_id: "b", nome: null, email: "bia@example.test" };

describe("leitura do banco", () => {
  it("recusa o que não é objeto e não inventa campo", () => {
    expect(lerAcessos(null)).toBeNull();
    expect(lerMolduras([])).toBeNull();
    expect(lerEconomia("x")).toBeNull();
    expect(lerAcessos({})).toEqual({ professores: [], alunos: [] });
  });

  it("professor sem `liberado` verdadeiro conta como bloqueado", () => {
    const lido = lerAcessos({ professores: [{ professor_id: "p", liberado: "true", alunos: [{ aluno_id: "a", nome: "Ana" }] }], alunos: [] });
    expect(lido?.professores[0].liberado).toBe(false);
    expect(lido?.professores[0].alunos[0]).toEqual({ aluno_id: "a", nome: "Ana", email: null });
  });

  it("lê o formato anterior, sem turmas, e dá nome à turma sem descrição", () => {
    expect(lerAcessos({ professores: [{ professor_id: "p" }] })?.professores[0].turmas).toEqual([]);
    const lido = lerAcessos({ professores: [{ turmas: [{ classe_id: 7, nome: "  ", alunos: ["a", 3] }] }] });
    expect(lido?.professores[0].turmas[0]).toEqual({ classe_id: 7, nome: "Turma 7", alunos: ["a"] });
  });

  it("moldura sem preço continua sem preço, não vira zero", () => {
    expect(lerMolduras({ molduras: [{ codigo: "c", preco: null, ativa: true }] })?.molduras[0]).toMatchObject({ nome: "c", preco: null, ativa: true });
  });

  it("entidade_id numérico vira texto, e operações vêm sem lixo", () => {
    const lido = lerEconomia({ operacoes: ["compra", 1, ""], auditoria: [{ id: 3, operacao: "compra", entidade_id: 7, aluno_nome: "Ana" }] });
    expect(lido?.operacoes).toEqual(["compra"]);
    expect(lido?.auditoria[0]).toMatchObject({ entidade_id: "7", aluno_nome: "Ana" });
  });
});

describe("professores", () => {
  const lista = [prof({ professor_id: "1", nome: "João Silva", disciplina: "Cálculo" }), prof({ professor_id: "2", nome: "Maria", liberado: false, instituicao: "ULBRA" })];

  it("busca sem acento nem caixa, em nome, instituição e disciplina", () => {
    expect(filtrarProfessores(lista, "joao", "todos").map((p) => p.professor_id)).toEqual(["1"]);
    expect(filtrarProfessores(lista, "calculo", "todos").map((p) => p.professor_id)).toEqual(["1"]);
    expect(filtrarProfessores(lista, "ulbra", "todos").map((p) => p.professor_id)).toEqual(["2"]);
  });

  it("bloqueado vem primeiro e o filtro de situação vale", () => {
    expect(filtrarProfessores(lista, "", "todos").map((p) => p.professor_id)).toEqual(["2", "1"]);
    expect(filtrarProfessores(lista, "", "liberados").map((p) => p.professor_id)).toEqual(["1"]);
    expect(filtrarProfessores(lista, "", "bloqueados").map((p) => p.professor_id)).toEqual(["2"]);
  });

  it("não altera a lista recebida", () => {
    const original = [...lista];
    filtrarProfessores(lista, "", "todos");
    expect(lista).toEqual(original);
  });

  it("aluno em duas turmas conta uma vez", () => {
    expect(contarAlunosDasTurmas(prof({ turmas: [{ classe_id: 1, nome: "A", alunos: ["a", "b"] }, { classe_id: 2, nome: "B", alunos: ["a"] }] }))).toBe(2);
  });
});

describe("alunos", () => {
  const acessos = { alunos: [ana, bia], professores: [prof({ nome: "Maria", turmas: [{ classe_id: 1, nome: "A", alunos: ["a"] }, { classe_id: 2, nome: "B", alunos: ["a"] }] })] };

  it("junta as turmas de cada aluno e lista todas para escolher", () => {
    expect(turmasPorAluno(acessos).get("a")).toEqual([{ classe_id: 1, nome: "A", professor: "Maria" }, { classe_id: 2, nome: "B", professor: "Maria" }]);
    expect(todasAsTurmas(acessos)).toHaveLength(2);
  });

  it("filtra quem está sem turma e busca por e-mail", () => {
    const mapa = turmasPorAluno(acessos);
    expect(filtrarAlunos(acessos.alunos, mapa, "", "sem_turma")).toEqual([bia]);
    expect(filtrarAlunos(acessos.alunos, mapa, "ANA@", "todos")).toEqual([ana]);
  });

  it("candidato sem nome usa o e-mail", () => {
    expect(candidatosDe([bia])[0]).toEqual({ id: "b", nome: "bia@example.test", email: "bia@example.test" });
  });
});

describe("molduras", () => {
  const m = (c: Partial<MolduraAdmin>): MolduraAdmin => ({ codigo: "c", nome: "Ouro", origem: "loja", preco: 1, ativa: true, conquista: null, donos: 0, ...c });

  it("filtra por origem e procura também na conquista", () => {
    const lista = [m({ codigo: "a" }), m({ codigo: "b", nome: "Mestre", origem: "conquista", conquista: "Primeira Trilha" })];
    expect(filtrarMolduras(lista, "", "loja").map((x) => x.codigo)).toEqual(["a"]);
    expect(filtrarMolduras(lista, "trilha", "todas").map((x) => x.codigo)).toEqual(["b"]);
  });

  it("preço vale de 1 a 1000 e só na loja", () => {
    expect(precoParaGravar("loja", "1")).toEqual({ ok: true, preco: 1 });
    expect(precoParaGravar("loja", "1000")).toEqual({ ok: true, preco: 1000 });
    for (const ruim of ["", " ", "0", "1001", "2.5", "abc"]) expect(precoParaGravar("loja", ruim)).toEqual({ ok: false });
    expect(precoParaGravar("conquista", "")).toEqual({ ok: true, preco: null });
  });
});

describe("resumo da auditoria", () => {
  it("mostra só o que mudou e ignora o ator", () => {
    expect(resumirMudanca({ ativa: true, preco: 10 }, { ativa: true, preco: 20, ator: "x" })).toBe("preco: 10 → 20");
  });

  it("cobre campo novo, valor solto e nada", () => {
    expect(resumirMudanca(null, { saldo: 5 })).toBe("saldo: — → 5");
    expect(resumirMudanca(1, 2)).toBe("1 → 2");
    expect(resumirMudanca(null, null)).toBe("—");
    expect(resumirMudanca({ a: 1 }, { a: 1 })).toBe("sem mudança");
  });
});

describe("comoLiberaARara", () => {
  const acao = (rotulo: string, moldura_codigo: string | null, ativa = true) => ({ acao: rotulo, rotulo, descricao: null, moldura_codigo, ativa, feitas: 0 });

  it("acusa a moldura que nenhuma ação libera", () => {
    expect(comoLiberaARara("sol", [])).toEqual({ texto: "Nenhuma ação libera esta moldura", alerta: true });
    expect(comoLiberaARara("sol", [acao("Reportar", "lua")])).toEqual({ texto: "Nenhuma ação libera esta moldura", alerta: true });
  });

  it("diz qual ação libera e acusa quando ela está desligada", () => {
    expect(comoLiberaARara("sol", [acao("Reportar", "sol")])).toEqual({ texto: "Ação: Reportar", alerta: false });
    expect(comoLiberaARara("sol", [acao("Reportar", "sol", false)])).toEqual({ texto: "Ação: Reportar (desligada)", alerta: true });
  });
});

describe("termos", () => {
  const painel = {
    versoes: { responsavel: "r1", pesquisa: "p1", professor: "pr1" },
    alunos: [
      { aluno_id: "a", nome: "Ana", email: "ana@x", idade: "menor", modo_restrito: true, termo: null, responsavel: { status: "rejected", versao: "r1", metodo: "papel", vigente: false }, pesquisa: null },
      { aluno_id: "b", nome: "Beto", email: "beto@x", idade: "maior", modo_restrito: false, termo: { status: "accepted", versao: "v5" }, responsavel: null, pesquisa: { status: "accepted", versao: "p1", vigente: true } },
      { aluno_id: "c", nome: "Caio", email: null, idade: "outra", modo_restrito: true },
    ],
    professores: [{ professor_id: "p", nome: "Prof", email: "p@x", liberado: true, aceite: null }],
  };

  it("lê o painel sem confiar no formato", () => {
    expect(lerTermos(null)).toBeNull();
    expect(lerTermos({ alunos: [] })).toBeNull();
    const lido = lerTermos(painel)!;
    expect(lido.alunos[2].idade).toBe("desconhecida");
    expect(lido.alunos[1].termo?.versao).toBe("v5");
    expect(lido.professores[0].aceite).toBeNull();
  });

  it("dá nome à situação de cada aluno", () => {
    const [ana, beto, caio] = lerTermos(painel)!.alunos;
    expect(seloDoResponsavel(ana)).toEqual({ texto: "Não autorizou", pendente: true });
    expect(seloDoResponsavel(beto)).toEqual({ texto: "Não se aplica", pendente: false });
    expect(seloDoResponsavel(caio)).toEqual({ texto: "Sem assinatura", pendente: false });
    expect(seloDoResponsavel({ idade: "menor", responsavel: { status: "accepted", versao: "r1", decidido_em: null, vigente: true, metodo: "papel" } }).texto).toBe("Assinou em papel");
    expect(seloDoResponsavel({ idade: "menor", responsavel: { status: "accepted", versao: "r0", decidido_em: null, vigente: false, metodo: "aparelho" } })).toEqual({ texto: "Versão antiga", pendente: true });
    expect(seloDaIdade(caio.idade).pendente).toBe(true);
    expect(seloDoTermo(beto.termo)).toEqual({ texto: "Aceitou", pendente: false });
  });

  it("professor sem prova é pendência", () => {
    expect(seloDoProfessor(null)).toEqual({ texto: "Sem aceite registrado", pendente: true });
    expect(seloDoProfessor({ status: "rejected", versao: "pr1", decidido_em: null, vigente: false, metodo: null }).texto).toBe("Aceite revogado");
  });

  it("filtra por pendência e por nome, sem acento", () => {
    const { alunos } = lerTermos(painel)!;
    expect(filtrarTermos(alunos, "", "pendentes", alunoTemPendencia).map((a) => a.aluno_id)).toEqual(["a", "c"]);
    expect(filtrarTermos(alunos, "BÉTO", "todos", alunoTemPendencia).map((a) => a.aluno_id)).toEqual(["b"]);
  });

  it("lê o histórico com finalidades e revogação", () => {
    const d = lerDetalheDoAluno({
      nascimento: { data: "2015-01-15" },
      responsavel: [{ id: 2, status: "accepted", versao: "r1", finalidades: { camera: true, mentor: false }, nome: "Mãe" }],
      pesquisa: [{ id: 3, status: "rejected", versao: "p1", motivo: "pedido" }],
    })!;
    expect(d.nascimento).toBe("2015-01-15");
    expect(d.responsavel[0].finalidades).toEqual(["camera"]);
    expect(d.pesquisa[0].motivo).toBe("pedido");
    expect(d.correcoes).toEqual([]);
    expect(lerDetalheDoAluno({ nascimento: null })?.nascimento).toBeNull();
    expect(lerDetalheDoProfessor({ aceites: [{ id: 1, status: "accepted", versao: "pr1" }] })?.[0].status).toBe("accepted");
  });

  it("exige motivo de verdade", () => {
    expect(motivoValido("    ")).toBe(false);
    expect(motivoValido("ok")).toBe(false);
    expect(motivoValido("pedido do titular")).toBe(true);
  });
});
