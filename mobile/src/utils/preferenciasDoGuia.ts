/**
 * O que o Guia aprendeu sobre o aluno (`aluno_preferencias_guia`, 20261124_04): rótulos e textos
 * da tela "O que o Guia sabe de você". Só funções puras; a leitura fica em
 * `services/preferenciasDoGuia.ts`.
 *
 * O catálogo é o mesmo da migration (CHECK) e de `api/app/services/preferencias_do_guia.py`; o
 * teste da API (`test_preferencias_do_guia.py`) confere as três listas.
 */

export const GOSTOS_DO_GUIA: Record<string, string> = {
  games: "Games",
  futebol: "Futebol",
  outros_esportes: "Outros esportes",
  musica: "Música",
  filmes_series: "Filmes e séries",
  anime_quadrinhos: "Anime e quadrinhos",
  tecnologia: "Tecnologia",
  ciencia_espaco: "Ciência e espaço",
  natureza_animais: "Natureza e animais",
  culinaria: "Culinária",
  arte_desenho: "Arte e desenho",
  moda: "Moda",
  viagens: "Viagens",
  historia_mitologia: "História e mitologia",
  carros_motos: "Carros e motos",
  livros: "Livros",
};

export const POSTURAS_DO_GUIA: Record<string, string> = {
  instigar: "Te provoca com perguntas e contrapontos",
  acolher: "Vai com calma, um passo de cada vez",
  pragmatico: "Vai direto ao que estudar",
};

export type PreferenciasDoGuia = {
  gostos: string[];
  resumo: string | null;
  postura: string | null;
  coleta_ligada: boolean;
  atualizado_em: string | null;
};

/** Sem linha no banco, a coleta vale ligada e nada foi guardado (o padrão da tabela). */
export const PREFERENCIAS_VAZIAS: PreferenciasDoGuia = {
  gostos: [],
  resumo: null,
  postura: null,
  coleta_ligada: true,
  atualizado_em: null,
};

export function rotulosDosGostos(gostos: readonly string[] | null | undefined): string[] {
  return (gostos ?? []).filter((g) => g in GOSTOS_DO_GUIA).map((g) => GOSTOS_DO_GUIA[g]);
}

export function descreverPostura(postura: string | null | undefined): string | null {
  return postura && postura in POSTURAS_DO_GUIA ? POSTURAS_DO_GUIA[postura] : null;
}

export function temAlgoGuardado(p: PreferenciasDoGuia): boolean {
  return rotulosDosGostos(p.gostos).length > 0 || !!p.resumo?.trim() || !!descreverPostura(p.postura);
}
