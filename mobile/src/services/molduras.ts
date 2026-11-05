// Molduras além das 7 de perfil (20261103_09): a vitrine, a compra, a moldura equipada e as
// ações do app que liberam as raras. Tudo é RPC no banco; o app não grava `moldura_aluno`.
import { supabase } from "@/database/supabase";
import { lerCatalogo, mensagemDeErro, type AcaoDeMoldura, type MolduraDoCatalogo } from "@/services/moldurasModel";
import { definirMoldurasRemotas } from "@/utils/moldurasRemotas";

export type { AcaoDeMoldura, MolduraDoCatalogo, OrigemDeMoldura } from "@/services/moldurasModel";

/**
 * Imagens cadastradas no console. Nunca levanta: banco sem as colunas ou rede fora só deixam
 * valer o desenho do pacote. A leitura é de todas, porque o ranking mostra a moldura dos colegas.
 */
export async function carregarMoldurasRemotas(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("molduras")
      .select("codigo, imagem_url, abertura" as never)
      .not("imagem_url" as never, "is", null);
    if (!error) definirMoldurasRemotas(data);
  } catch {
    // Fica com o que já estava carregado.
  }
}

export async function carregarMolduras(): Promise<MolduraDoCatalogo[]> {
  const [{ data, error }] = await Promise.all([supabase.rpc("molduras_catalogo" as never), carregarMoldurasRemotas()]);
  if (error) throw error;
  return lerCatalogo(data);
}

export async function comprarMoldura(codigo: string): Promise<{ saldo?: number }> {
  const { data, error } = await supabase.rpc("moldura_comprar" as never, { p_codigo: codigo } as never);
  if (error) throw error;
  const erro = mensagemDeErro(data);
  if (erro) throw new Error(erro);
  return data as { saldo?: number };
}

export async function equiparMoldura(codigo: string | null): Promise<void> {
  const { data, error } = await supabase.rpc("moldura_equipar" as never, { p_codigo: codigo } as never);
  if (error) throw error;
  const erro = mensagemDeErro(data);
  if (erro) throw new Error(erro);
  avisarEquipada(codigo);
}

/**
 * Registra a ação e devolve o nome da moldura quando ela acabou de ser liberada. Nunca levanta:
 * a ação é do aluno (gerar o relatório, salvar o lembrete) e não pode falhar por causa da moldura.
 */
export async function registrarAcaoDeMoldura(acao: AcaoDeMoldura): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("moldura_registrar_acao" as never, { p_acao: acao } as never);
    if (error) return null;
    const r = (data ?? {}) as { nova?: boolean; nome?: string };
    return r.nova ? String(r.nome ?? "nova") : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- moldura equipada

type Ouvinte = (codigo: string | null) => void;
const ouvintes = new Set<Ouvinte>();
let atual: { alunoId: string; codigo: string | null } | null = null;

function avisarEquipada(codigo: string | null) {
  if (atual) atual = { ...atual, codigo };
  for (const o of ouvintes) o(codigo);
}

export function ouvirMolduraEquipada(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function molduraEquipadaEmCache(alunoId: string): string | null | undefined {
  return atual?.alunoId === alunoId ? atual.codigo : undefined;
}

/**
 * Lida à parte do resto do cadastro de propósito: se o banco ainda não tiver a coluna (build
 * novo contra banco velho), só esta leitura falha, e o avatar fica com a moldura do perfil.
 */
export async function carregarMolduraEquipada(alunoId: string): Promise<string | null> {
  void carregarMoldurasRemotas();
  const { data, error } = await supabase
    .from("alunos")
    .select("moldura_equipada" as never)
    .eq("id", alunoId)
    .maybeSingle();
  const codigo = error ? null : (((data ?? {}) as { moldura_equipada?: string | null }).moldura_equipada ?? null);
  atual = { alunoId, codigo };
  for (const o of ouvintes) o(codigo);
  return codigo;
}
