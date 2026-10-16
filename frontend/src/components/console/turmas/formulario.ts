// Formulário de turma (criar e editar) — docs/frontend/redesign-fase-2/03-analise-turmas.md, 4.5.
// Regras puras de validação e a ordem de gravação da criação, com o banco
// injetado para poder testar o caminho de falha.

export type ModoDoFormulario = "criar" | "editar";

export type CamposDaTurma = {
  nome: string;
  /** "" = sem matéria ("Geral"). */
  materiaId: string;
  novaMateriaNome: string;
  novaMateriaDescricao: string;
};

export const CAMPOS_VAZIOS: CamposDaTurma = { nome: "", materiaId: "", novaMateriaNome: "", novaMateriaDescricao: "" };

export const MAX_NOME = 120;

export type DadosDaTurma = {
  descricao: string;
  materiaId: number | null;
  novaMateria: { nome: string; descricao: string | null } | null;
};

export type ErrosDoFormulario = Partial<Record<"nome" | "materia", string>>;

export type Validacao = { ok: true; dados: DadosDaTurma } | { ok: false; erros: ErrosDoFormulario };

/**
 * Nome obrigatório; matéria existente OU nova (nunca as duas); matéria nova
 * só ao criar — editar não cria matéria, como na tela atual.
 */
export function validarFormulario(campos: CamposDaTurma, modo: ModoDoFormulario): Validacao {
  const erros: ErrosDoFormulario = {};
  const nome = campos.nome.trim().replace(/\s+/g, " ");
  if (!nome) erros.nome = "Dê um nome à turma.";
  else if (nome.length > MAX_NOME) erros.nome = `Use no máximo ${MAX_NOME} caracteres.`;

  const materiaId = campos.materiaId ? Number(campos.materiaId) : null;
  const novoNome = modo === "criar" ? campos.novaMateriaNome.trim() : "";
  const novaDescricao = modo === "criar" ? campos.novaMateriaDescricao.trim() : "";
  if (materiaId !== null && (novoNome || novaDescricao)) {
    erros.materia = "Escolha uma matéria existente ou crie uma nova — não as duas.";
  } else if (!novoNome && novaDescricao) {
    erros.materia = "Dê um nome à matéria nova, ou apague a descrição.";
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      descricao: nome,
      materiaId,
      novaMateria: novoNome ? { nome: novoNome, descricao: novaDescricao || null } : null,
    },
  };
}

/** Nome como aparece na confirmação e nas faixas: nunca vazio. */
export const nomeDaTurma = (turma: { id: number; descricao: string | null }) => turma.descricao?.trim() || `Turma ${turma.id}`;

export type BancoDeTurmas = {
  inserirTurma: (dados: { descricao: string; materia_id: number | null }) => Promise<{ id: number; descricao: string | null }>;
  inserirMateria: (dados: { nome: string; descricao: string | null }) => Promise<{ id: number }>;
  vincularMateria: (turmaId: number, materiaId: number) => Promise<void>;
};

export type TurmaCriada = { id: number; descricao: string | null; avisoDeMateria: string | null };

/**
 * A turma é gravada ANTES da matéria nova. O professor não pode apagar
 * matéria (a tabela não tem policy de DELETE), então "criar a matéria e
 * desfazer se a turma falhar" deixaria a matéria órfã para todos. Nesta
 * ordem, turma que falha não cria nada; matéria que falha deixa a turma
 * criada como "Geral", e o professor fica sabendo.
 */
export async function criarTurma(banco: BancoDeTurmas, dados: DadosDaTurma): Promise<TurmaCriada> {
  const turma = await banco.inserirTurma({ descricao: dados.descricao, materia_id: dados.materiaId });
  if (!dados.novaMateria) return { ...turma, avisoDeMateria: null };
  try {
    const materia = await banco.inserirMateria(dados.novaMateria);
    await banco.vincularMateria(turma.id, materia.id);
    return { ...turma, avisoDeMateria: null };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    return { ...turma, avisoDeMateria: `A turma foi criada sem a matéria "${dados.novaMateria.nome}" (${motivo}). Você pode escolher a matéria depois, em Editar.` };
  }
}
