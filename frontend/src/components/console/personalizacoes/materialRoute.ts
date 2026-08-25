import { consolePathForView } from "@/pages/consoleSections";

// O conteudo completo de um perfil era um modal; virou pagina propria, e a URL
// e quem diz o que esta aberto. Tudo que a pagina precisa pra se reconstruir do
// zero (refresh, link colado, botao voltar) viaja na query - a selecao de
// turma/topico/conteudo mora em estado local da secao e se perderia num F5.
//
// Montar e ler o caminho vive so aqui, pra nao existir "/console/personalizacoes
// /material?..." escrito a mao em dois lugares.

export const MATERIAL_ROUTE_PATH = `${consolePathForView("personalizacoes")}/material`;

export interface MaterialRouteParams {
  classeId?: string;
  topicoId?: string;
  conteudoId?: string;
  perfil: string;
  aba?: string;
}

export function buildMaterialPath(params: MaterialRouteParams): string {
  const query = new URLSearchParams();
  if (params.classeId) query.set("classe", params.classeId);
  if (params.topicoId) query.set("topico", params.topicoId);
  if (params.conteudoId) query.set("conteudo", params.conteudoId);
  query.set("perfil", params.perfil);
  if (params.aba) query.set("aba", params.aba);
  return `${MATERIAL_ROUTE_PATH}?${query.toString()}`;
}

export function parseMaterialQuery(search: string | URLSearchParams): MaterialRouteParams | null {
  const query = typeof search === "string" ? new URLSearchParams(search) : search;
  const perfil = (query.get("perfil") ?? "").trim();
  if (!perfil) return null;

  const opcional = (chave: string) => {
    const valor = (query.get(chave) ?? "").trim();
    return valor || undefined;
  };

  return {
    perfil,
    classeId: opcional("classe"),
    topicoId: opcional("topico"),
    conteudoId: opcional("conteudo"),
    aba: opcional("aba"),
  };
}

/** True quando o pathname e a pagina de material (e nao a lista da secao). */
export function isMaterialRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === MATERIAL_ROUTE_PATH;
}
