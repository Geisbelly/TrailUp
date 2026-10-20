// Regras do formulário de missão.
//
// Missão deixou de ser `atividades` com `tipo = 'missao'` (decisão da #150) e passou a ser uma
// linha de `missoes` (`20261019_05`). Decisão de produto: **um editor, dois caminhos**.
//
// - `entrega`  — o que a missão era: o aluno entrega e o professor corrige. Continua criando
//                uma `atividades` (que é onde vivem nota, moedas e as questões, e o que
//                alimenta `notas_fila`/`avaliar_entrega`), e a `missoes` aponta para ela com
//                `criterio = atividade_especifica`.
// - `meta`     — o que a missão passou a poder ser: um alvo que o banco avalia sozinho, por
//                uma das métricas de `fn_conquista_metrica_suportada`. Não cria atividade.
//
// Nota e pontos de rank são coisas diferentes e não se atropelam: `pontos` aqui é
// `atividades.pontuacao_maxima` (a nota, 0..max), e os pontos de rank saem de
// `eventos_pontuacao` pela chave em `missoes.recompensa_tipo`.
//
// Resolvido desde a primeira versão: missão sem tópico. `missoes` não tem `topico_id`, então o
// caminho `meta` não pede tópico — era a limitação que o comentário antigo registrava.

import type { EscopoDaMissao } from "./aprovacao";
import { criterioDeEntrega, criterioDeMeta, definicaoDaMetrica, metricaSomaEmGuilda, type MetricaDeMissao } from "./criterio";

export const TIPO_DA_MISSAO = "missao";
export const TITULO_MAX = 80;
export const OBJETIVO_MAX = 600;
export const PONTOS_MAX = 1000;
export const MOEDAS_MAX = 1000;

/** Chave de `eventos_pontuacao`. Semeada valendo zero em `20261019_05`; a fase 4 dá valor. */
export const RECOMPENSA_PADRAO = "missao_concluida";

export type CaminhoDaMissao = "entrega" | "meta";

export type FormularioDeMissao = {
  caminho: CaminhoDaMissao;
  titulo: string;
  objetivo: string;
  /** `datetime-local`: "2026-10-20T23:59", ou vazio para sem prazo. Vale nos dois caminhos. */
  prazo: string;
  /** Só em `entrega`. Id do tópico em texto (vem de um select). */
  topicoId: string;
  /** Só em `entrega`: a NOTA da atividade, não pontos de rank. */
  pontos: string;
  /** Só em `entrega`: pagas quando o professor aprova a entrega (`avaliar_entrega`). */
  moedas: string;
  /** Só em `meta`. */
  metrica: string;
  /** Só em `meta`: o alvo numérico, na unidade da métrica. */
  alvo: string;
  /**
   * Quem cumpre. Ausente = `turma`. `guilda` soma o progresso dos membros (`20261021_15`) e
   * por isso só aceita o caminho `meta` com métrica que soma.
   */
  escopo?: EscopoDaMissao;
};

export const FORMULARIO_DE_MISSAO_VAZIO: FormularioDeMissao = {
  caminho: "entrega",
  titulo: "",
  objetivo: "",
  prazo: "",
  topicoId: "",
  pontos: "",
  moedas: "",
  metrica: "",
  alvo: "",
};

/** O que vai para `atividades` — só no caminho `entrega`. */
export type PayloadDaAtividade = {
  topico_id: number;
  titulo: string;
  descricao: string;
  tipo: typeof TIPO_DA_MISSAO;
  data_entrega: string | null;
  pontuacao_maxima: number;
  moedas: number;
};

/** O que vai para `missoes`. `criterio` fica para depois em `entrega`: depende do id da atividade. */
export type PayloadDaMissao = {
  escopo: EscopoDaMissao;
  origem: "professor";
  titulo: string;
  descricao: string;
  recompensa_tipo: string;
  janela_fim: string | null;
  criterio: Record<string, unknown> | null;
};

export type ErrosDaMissao = Partial<
  Record<"escopo" | "caminho" | "titulo" | "objetivo" | "topicoId" | "prazo" | "pontos" | "moedas" | "metrica" | "alvo", string>
>;

export type ResultadoDaMissao = {
  ok: boolean;
  missao: PayloadDaMissao | null;
  atividade: PayloadDaAtividade | null;
  erros: ErrosDaMissao | null;
};

function inteiro(texto: string): number {
  return Number(texto.trim().replace(",", "."));
}

export function validarMissao(form: FormularioDeMissao): ResultadoDaMissao {
  const erros: ErrosDaMissao = {};
  const entrega = form.caminho === "entrega";

  if (form.caminho !== "entrega" && form.caminho !== "meta") erros.caminho = "Escolha entrega ou meta.";

  const escopo = form.escopo ?? "turma";
  if (escopo !== "turma" && escopo !== "guilda" && escopo !== "aluno") erros.escopo = "Escolha quem cumpre.";
  // Guilda soma o progresso dos membros: entrega não é número, e o banco recusaria (22023).
  if (escopo === "guilda" && entrega) erros.caminho = "Missão de guilda é uma meta: a guilda soma o que os membros fazem.";

  const titulo = form.titulo.trim();
  if (titulo.length < 3) erros.titulo = "Dê um título de pelo menos 3 letras.";
  else if (titulo.length > TITULO_MAX) erros.titulo = `No máximo ${TITULO_MAX} caracteres.`;

  const objetivo = form.objetivo.trim();
  if (!objetivo) erros.objetivo = "Diga o que se espera que o aluno atinja.";
  else if (objetivo.length > OBJETIVO_MAX) erros.objetivo = `No máximo ${OBJETIVO_MAX} caracteres.`;

  let prazoIso: string | null = null;
  if (form.prazo.trim()) {
    const d = new Date(form.prazo);
    if (Number.isNaN(d.getTime())) erros.prazo = "Data inválida.";
    else prazoIso = d.toISOString();
  }

  // --- caminho entrega ---
  let topico = 0;
  let pontos = 0;
  let moedas = 0;
  if (entrega) {
    topico = inteiro(form.topicoId);
    if (!form.topicoId.trim() || !Number.isInteger(topico) || topico <= 0) erros.topicoId = "Escolha o tópico da missão.";

    pontos = inteiro(form.pontos);
    if (!form.pontos.trim() || !Number.isInteger(pontos) || pontos < 1 || pontos > PONTOS_MAX) {
      erros.pontos = `Informe a nota máxima (inteiro de 1 a ${PONTOS_MAX}).`;
    }

    const moedasTexto = form.moedas.trim();
    moedas = moedasTexto === "" ? 0 : inteiro(moedasTexto);
    if (!Number.isInteger(moedas) || moedas < 0 || moedas > MOEDAS_MAX) {
      erros.moedas = `Moedas: inteiro de 0 a ${MOEDAS_MAX}, ou deixe vazio.`;
    }
  }

  // --- caminho meta ---
  let metrica: MetricaDeMissao | null = null;
  let alvo = 0;
  if (!entrega) {
    const def = definicaoDaMetrica(form.metrica);
    if (!def) erros.metrica = "Escolha o que a missão mede.";
    else if (escopo === "guilda" && !metricaSomaEmGuilda(def.chave)) {
      erros.metrica = "Na guilda o progresso é a soma dos membros; escolha uma medida que soma.";
    } else metrica = def.chave;

    alvo = inteiro(form.alvo);
    if (!form.alvo.trim() || !Number.isInteger(alvo) || alvo < 1) {
      erros.alvo = "Informe o alvo (inteiro a partir de 1).";
    } else if (def && alvo > def.max) {
      erros.alvo = `No máximo ${def.max} ${def.unidade}.`;
    }
  }

  if (Object.keys(erros).length > 0) return { ok: false, missao: null, atividade: null, erros };

  const missao: PayloadDaMissao = {
    escopo,
    origem: "professor",
    titulo,
    descricao: objetivo,
    recompensa_tipo: RECOMPENSA_PADRAO,
    janela_fim: prazoIso,
    // Em `entrega` o critério só pode ser montado depois do INSERT da atividade.
    criterio: entrega ? null : criterioDeMeta(metrica as MetricaDeMissao, alvo),
  };

  return {
    ok: true,
    erros: null,
    missao,
    atividade: entrega
      ? {
          topico_id: topico,
          titulo,
          descricao: objetivo,
          tipo: TIPO_DA_MISSAO,
          data_entrega: prazoIso,
          pontuacao_maxima: pontos,
          moedas,
        }
      : null,
  };
}

/** Completa o critério de `entrega` quando o id da atividade já existe. */
export function comCriterioDaAtividade(missao: PayloadDaMissao, atividadeId: number): PayloadDaMissao {
  return { ...missao, criterio: criterioDeEntrega(atividadeId) };
}

const dois = (n: number) => String(n).padStart(2, "0");

/** ISO do banco → valor de `<input type="datetime-local">` no fuso do navegador. */
export function prazoParaCampo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function rotuloDoPrazo(iso: string | null | undefined): string {
  if (!iso) return "Sem prazo";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Sem prazo" : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}

export function resumoDeEntregas(entregues: number, total: number): string {
  return `${Math.min(entregues, total)}/${total}`;
}

/** 0–100; turma sem aluno dá 0 em vez de dividir por zero. */
export function percentualDeEntrega(entregues: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((entregues / total) * 100)) : 0;
}
