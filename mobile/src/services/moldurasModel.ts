// Molduras: a parte pura (sem Supabase), para rodar no Node. Ver `services/molduras.ts`.
import { molduraConhecida } from "@/constants/molduras";
import { molduraRemota } from "@/utils/moldurasRemotas";

export type OrigemDeMoldura = "loja" | "conquista" | "acao";

export type MolduraDoCatalogo = {
  codigo: string;
  nome: string;
  origem: OrigemDeMoldura;
  preco: number | null;
  comoGanhar: string;
  tenho: boolean;
  equipada: boolean;
};

/**
 * As ações que o banco conhece (`molduras_acoes`). Ação fora desta lista volta
 * `acao_desconhecida` e não entrega nada; o teste da migração trava as duas listas juntas.
 */
export type AcaoDeMoldura =
  | "avaliar_app"
  | "reportar_erro"
  | "gerar_relatorio"
  | "definir_lembrete"
  | "usar_modo_foco"
  | "editar_perfil"
  | "compartilhar_guilda"
  | "ativar_notificacoes"
  | "ver_novidades"
  | "ver_estilo";

const ORIGENS: readonly OrigemDeMoldura[] = ["loja", "conquista", "acao"];

/**
 * Linha de `molduras_catalogo` → modelo. Moldura sem desenho no pacote e sem imagem cadastrada
 * fica de fora: mostrar o nome sem a imagem é pior que não mostrar.
 */
export function lerCatalogo(linhas: unknown): MolduraDoCatalogo[] {
  if (!Array.isArray(linhas)) return [];
  const saida: MolduraDoCatalogo[] = [];
  for (const bruta of linhas) {
    const l = (bruta ?? {}) as Record<string, unknown>;
    const codigo = String(l.codigo ?? "");
    const origem = String(l.origem ?? "") as OrigemDeMoldura;
    if ((!molduraConhecida(codigo) && !molduraRemota(codigo)) || !ORIGENS.includes(origem)) continue;
    saida.push({
      codigo,
      nome: String(l.nome ?? codigo),
      origem,
      preco: l.preco == null ? null : Number(l.preco),
      comoGanhar: String(l.como_ganhar ?? ""),
      tenho: l.tenho === true,
      equipada: l.equipada === true,
    });
  }
  return saida;
}

/** Onde a moldura aparece: comprar na Loja, ganhar nas Conquistas, as que o aluno tem na Bag. */
export type SecaoDeMoldura = "loja" | "conquistas" | "minhas";

export function moldurasDaSecao(itens: MolduraDoCatalogo[], secao: SecaoDeMoldura): MolduraDoCatalogo[] {
  if (secao === "minhas") return itens.filter((m) => m.tenho);
  if (secao === "loja") return itens.filter((m) => m.origem === "loja");
  // As "raras" (por ação no app) também são ganhas, não compradas: ficam com as de conquista.
  return itens.filter((m) => m.origem === "conquista" || m.origem === "acao");
}

const ERROS: Record<string, string> = {
  saldo_insuficiente: "Moedas insuficientes para esta moldura.",
  moldura_indisponivel: "Esta moldura não está à venda agora.",
  moldura_nao_e_sua: "Você ainda não tem esta moldura.",
  sem_sessao: "Entre de novo para continuar.",
};

export function mensagemDeErro(resposta: unknown): string | null {
  const r = (resposta ?? {}) as { ok?: boolean; erro?: string };
  if (r.ok) return null;
  return ERROS[r.erro ?? ""] ?? "Não foi possível concluir. Tente de novo.";
}
