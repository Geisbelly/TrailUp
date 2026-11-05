import { medirFetch, type Coletor } from "./coletor";

// Separado de `index.ts`: `database/supabase.ts` importa isto, e `index.ts` importa o Supabase.
// Aqui não entra react-native, para os testes em Node continuarem carregando o cliente.

let coletorAtivo: Coletor | null = null;

export function definirColetor(coletor: Coletor): void {
  coletorAtivo = coletor;
}

export const fetchMedido = medirFetch(
  (entrada, init) => globalThis.fetch(entrada, init),
  (destino, metodo, status) => coletorAtivo?.registrarChamada(destino, metodo, status),
);

const ESCRITA_CRITICA = new Set(["atividade_aluno", "conteudo_aluno"]);

/** O que o aluno sente quando falha: entrar, abrir a trilha e concluir atividade. */
export function destinoCriticoDoAluno(destino: string, metodo: string): boolean {
  if (destino === "auth/token") return true;
  if (destino === "topico_aluno") return true;
  return metodo !== "GET" && ESCRITA_CRITICA.has(destino);
}
