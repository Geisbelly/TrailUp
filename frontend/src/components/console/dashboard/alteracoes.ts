import type { Json } from "@/integrations/supabase/types";

/**
 * Alterações que o professor fez na trilha depois que algum aluno já tinha visto ou feito o item
 * (`alteracao_professor` / `alteracao_aluno`, migração 20261101_12), e o que a IA decidiu: se a
 * mudança é cosmética e quem precisa revisar. A decisão vale na hora; o professor pode desfazer.
 */

export type Decisao = "pendente_analise" | "cosmetica" | "destacar" | "revisar";
export type DecisaoDoProfessor = "cosmetica" | "destacar" | "revisar" | "ia";

export type AlteracaoDaTrilha = {
  id: number;
  classe_id: number;
  topico_id: number;
  alvo_tipo: "conteudo" | "atividade" | string;
  conteudo_id: number | null;
  atividade_id: number | null;
  mudancas: Json;
  status: "pendente_analise" | "analisada" | string;
  classificacao: "cosmetica" | "relevante" | string | null;
  resumo: string | null;
  motivo: string | null;
  tentativas: number;
  ultimo_erro: string | null;
  criada_em: string;
};

export type AlteracaoDoAluno = {
  id: number;
  alteracao_id: number;
  aluno_id: string;
  classe_id: number;
  situacao: "viu" | "fez" | string;
  decisao: Decisao | string;
  decisao_professor: Exclude<DecisaoDoProfessor, "ia"> | string | null;
  decisao_efetiva: Decisao | string;
  motivo: string | null;
  recorrigida: boolean;
  revisada_em: string | null;
};

/** O mesmo teto da migração: depois dele a fila para e espera o professor. */
export const MAX_TENTATIVAS_DA_IA = 8;

export const COLUNAS_ALTERACAO =
  "id, classe_id, topico_id, alvo_tipo, conteudo_id, atividade_id, mudancas, status, classificacao, resumo, motivo, tentativas, ultimo_erro, criada_em";
export const COLUNAS_ALTERACAO_ALUNO =
  "id, alteracao_id, aluno_id, classe_id, situacao, decisao, decisao_professor, decisao_efetiva, motivo, recorrigida, revisada_em";

export type EstadoDaAnalise = { rotulo: string; tom: "ia" | "neutro" | "atencao" };

export function estadoDaAnalise(a: Pick<AlteracaoDaTrilha, "status" | "classificacao" | "tentativas" | "ultimo_erro">): EstadoDaAnalise {
  if (a.status === "analisada") {
    return a.classificacao === "cosmetica"
      ? { rotulo: "Cosmética: ninguém foi avisado", tom: "neutro" }
      : { rotulo: "Relevante: alunos avisados", tom: "ia" };
  }
  if (a.tentativas >= MAX_TENTATIVAS_DA_IA) {
    return { rotulo: "A IA não conseguiu analisar: decida você", tom: "atencao" };
  }
  return a.ultimo_erro
    ? { rotulo: "Aguardando a IA (nova tentativa em breve)", tom: "neutro" }
    : { rotulo: "Aguardando a IA", tom: "neutro" };
}

export function rotuloDaDecisao(decisao: string, revisadaEm: string | null): string {
  if (decisao === "revisar") return revisadaEm ? "Revisão feita" : "Revisão pedida";
  if (decisao === "destacar") return "Avisado";
  if (decisao === "cosmetica") return "Sem aviso";
  return "Aguardando análise";
}

const CAMPOS: Record<string, string> = {
  titulo: "título",
  descricao: "descrição",
  conteudo: "texto",
  metadata: "anexos e configurações",
  tipo: "tipo",
  enunciado: "enunciado",
  alternativas: "alternativas",
  resposta_correta: "gabarito",
  midia_url: "mídia da questão",
  nota_estabelecida: "pontos da questão",
  pontuacao_maxima: "pontos",
  data_entrega: "prazo",
  imagem_url: "imagem do card",
};

/** O que mudou, em palavras de professor, sem repetir. */
export function oQueMudou(mudancas: Json): string[] {
  const lista = Array.isArray(mudancas) ? mudancas : [];
  const partes: string[] = [];
  const add = (p: string) => {
    if (!partes.includes(p)) partes.push(p);
  };
  for (const m of lista) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const tabela = String((m as Record<string, Json>).tabela ?? "");
    const op = String((m as Record<string, Json>).op ?? "");
    if (op === "INSERT") add(tabela === "cards" ? "card novo" : "questão nova");
    else if (op === "DELETE") add(tabela === "cards" ? "card removido" : "questão removida");
    else {
      const campos = (m as Record<string, Json>).campos;
      for (const c of Array.isArray(campos) ? campos : []) add(CAMPOS[String(c)] ?? String(c));
    }
  }
  return partes;
}

/** Revisão só existe para quem fez uma atividade (o app refaz atividade, não conteúdo). */
export function podePedirRevisao(alteracao: Pick<AlteracaoDaTrilha, "alvo_tipo">, aluno: Pick<AlteracaoDoAluno, "situacao">): boolean {
  return alteracao.alvo_tipo === "atividade" && aluno.situacao === "fez";
}

/** Tabela ou função ainda não criadas neste banco: a seção some em vez de mostrar erro. */
export function eEstruturaAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "42P01" ||
    erro.code === "PGRST205" ||
    erro.code === "PGRST202" ||
    /relation .* does not exist|could not find the (table|function)/i.test(erro.message ?? "")
  );
}
