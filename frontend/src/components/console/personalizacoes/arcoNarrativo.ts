// Arco narrativo da turma (#145): a história que o professor escreve e que entra na geração do
// material personalizado. Guardar é banco (`classe_arco_narrativo`, migration 20261102_16); o
// console grava direto no Supabase, sem a API. Regras puras aqui, com o banco injetado para testar.

/** O mesmo teto do CHECK de `classe_arco_narrativo.texto` e de `class_story_arc` no microservice. */
export const ARCO_MAXIMO = 3000;

export type ArcoSalvo = { texto: string; atualizadoEm: string | null };

/** Por caractere (code point), como o `char_length` do banco: emoji conta um, não dois. */
export const contarCaracteres = (texto: string) => Array.from(texto.trim()).length;

export type ValidacaoDoArco =
  | { ok: true; texto: string | null }
  | { ok: false; erro: string };

/** Texto vazio é "sem arco" (apaga a linha), nunca uma linha com texto em branco. */
export function validarArco(rascunho: string): ValidacaoDoArco {
  const texto = rascunho.trim();
  if (!texto) return { ok: true, texto: null };
  if (contarCaracteres(texto) > ARCO_MAXIMO) {
    return { ok: false, erro: `Use no máximo ${ARCO_MAXIMO.toLocaleString("pt-BR")} caracteres.` };
  }
  return { ok: true, texto };
}

/** Espaço nas pontas não é edição: o gatilho do banco também não regera por isso. */
export const arcoMudou = (salvo: ArcoSalvo | null, rascunho: string) => (salvo?.texto.trim() ?? "") !== rascunho.trim();

export type BancoDoArco = {
  ler: (classeId: number) => Promise<ArcoSalvo | null>;
  gravar: (classeId: number, texto: string) => Promise<ArcoSalvo>;
  apagar: (classeId: number) => Promise<void>;
};

/** Grava ou apaga conforme o rascunho. Devolve o que ficou no banco (null = turma sem arco). */
export async function salvarArco(banco: BancoDoArco, classeId: number, rascunho: string): Promise<ArcoSalvo | null> {
  const v = validarArco(rascunho);
  if (v.ok === false) throw new Error(v.erro);
  if (v.texto === null) {
    await banco.apagar(classeId);
    return null;
  }
  return banco.gravar(classeId, v.texto);
}
