// Regras do formulário de missão. Missão é uma `atividade` com `tipo = 'missao'`
// (decisão da #150), então o que o formulário produz é um payload de atividade.
//
// Fora desta primeira versão, de propósito (ver docs/frontend/redesign-fase-2/05-analise-novas-telas.md):
// - cronômetro por questão (exige verificação no servidor e mudança no app do aluno);
// - moedas e recompensa (decisões de produto em aberto);
// - missão sem tópico (`atividades.topico_id` é obrigatório hoje).

export const TIPO_DA_MISSAO = "missao";
export const TITULO_MAX = 80;
export const OBJETIVO_MAX = 600;
export const PONTOS_MAX = 1000;

export type FormularioDeMissao = {
  titulo: string;
  objetivo: string;
  /** Id do tópico em texto (vem de um select). */
  topicoId: string;
  /** `datetime-local`: "2026-10-20T23:59", ou vazio para sem prazo. */
  prazo: string;
  pontos: string;
};

export const FORMULARIO_DE_MISSAO_VAZIO: FormularioDeMissao = { titulo: "", objetivo: "", topicoId: "", prazo: "", pontos: "" };

export type PayloadDaMissao = {
  topico_id: number;
  titulo: string;
  descricao: string;
  tipo: typeof TIPO_DA_MISSAO;
  data_entrega: string | null;
  pontuacao_maxima: number;
};

export type ErrosDaMissao = Partial<Record<"titulo" | "objetivo" | "topicoId" | "prazo" | "pontos", string>>;

// Duas chaves exclusivas: strictNullChecks está desligado no projeto.
export type ResultadoDaMissao = { ok: boolean; payload: PayloadDaMissao | null; erros: ErrosDaMissao | null };

export function validarMissao(form: FormularioDeMissao): ResultadoDaMissao {
  const erros: ErrosDaMissao = {};

  const titulo = form.titulo.trim();
  if (titulo.length < 3) erros.titulo = "Dê um título de pelo menos 3 letras.";
  else if (titulo.length > TITULO_MAX) erros.titulo = `No máximo ${TITULO_MAX} caracteres.`;

  const objetivo = form.objetivo.trim();
  if (!objetivo) erros.objetivo = "Diga o que se espera que o aluno atinja.";
  else if (objetivo.length > OBJETIVO_MAX) erros.objetivo = `No máximo ${OBJETIVO_MAX} caracteres.`;

  const topico = Number(form.topicoId);
  if (!form.topicoId || !Number.isInteger(topico) || topico <= 0) erros.topicoId = "Escolha o tópico da missão.";

  let dataEntrega: string | null = null;
  if (form.prazo.trim()) {
    const d = new Date(form.prazo);
    if (Number.isNaN(d.getTime())) erros.prazo = "Data inválida.";
    else dataEntrega = d.toISOString();
  }

  const pontos = Number(form.pontos.trim().replace(",", "."));
  if (!form.pontos.trim() || !Number.isInteger(pontos) || pontos < 1 || pontos > PONTOS_MAX) {
    erros.pontos = `Informe a pontuação máxima (inteiro de 1 a ${PONTOS_MAX}).`;
  }

  if (Object.keys(erros).length > 0) return { ok: false, payload: null, erros };
  return {
    ok: true,
    erros: null,
    payload: { topico_id: topico, titulo, descricao: objetivo, tipo: TIPO_DA_MISSAO, data_entrega: dataEntrega, pontuacao_maxima: pontos },
  };
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
