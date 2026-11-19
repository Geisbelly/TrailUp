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
import type { LinhaDoDesafio, Missao } from "./missoesApi";
import { PROFILE_LABEL, type BrainHexProfileKey } from "@/features/signup/brainhex";
import { criterioDeEntrega, criterioDeMeta, definicaoDaMetrica, metricaSomaEmGuilda, type MetricaDeMissao } from "./criterio";

export const TIPO_DA_MISSAO = "missao";
export const TITULO_MAX = 80;
export const OBJETIVO_MAX = 600;
export const PONTOS_MAX = 1000;
export const MOEDAS_MAX = 1000;

/** Chave de `eventos_pontuacao`. Semeada valendo zero em `20261019_05`; a fase 4 dá valor. */
export const RECOMPENSA_PADRAO = "missao_concluida";

export type CaminhoDaMissao = "entrega" | "meta";

/**
 * Para quem é a missão. Vazio = todos os perfis. Os valores são os de `missoes.perfil_alvo` (CHECK
 * com os 7 nomes em minúsculas); o avaliador e o app só entregam a missão a quem tem esse perfil
 * como perfil da missão (`fn_perfil_da_missao`).
 */
export const PERFIS_DA_MISSAO = Object.entries(PROFILE_LABEL).map(([chave, rotulo]) => ({
  chave: chave as BrainHexProfileKey,
  rotulo,
}));

export function rotuloDoPerfil(perfil: string | null | undefined): string {
  if (!perfil) return "Todos os perfis";
  return PROFILE_LABEL[perfil.toLowerCase() as BrainHexProfileKey] ?? perfil;
}

export type FormularioDeMissao = {
  /** Id da turma em texto (vem de um select). A missão é dela, e o tópico também. */
  turmaId: string;
  /** Chave do perfil BrainHex, ou vazio para todos. */
  perfil: string;
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
  turmaId: "",
  perfil: "",
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
  classe_id: number;
  /** `null` = todos os perfis. */
  perfil_alvo: string | null;
  escopo: EscopoDaMissao;
  origem: "professor";
  titulo: string;
  descricao: string;
  recompensa_tipo: string;
  janela_fim: string | null;
  criterio: Record<string, unknown> | null;
};

export type ErrosDaMissao = Partial<
  Record<"turmaId" | "perfil" | "escopo" | "caminho" | "titulo" | "objetivo" | "topicoId" | "prazo" | "pontos" | "moedas" | "metrica" | "alvo", string>
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

  const turma = inteiro(form.turmaId);
  if (!form.turmaId.trim() || !Number.isInteger(turma) || turma <= 0) erros.turmaId = "Escolha a turma da missão.";

  const perfil = form.perfil.trim().toLowerCase();
  if (perfil && !PERFIS_DA_MISSAO.some((p) => p.chave === perfil)) erros.perfil = "Escolha um perfil da lista.";

  const escopo = form.escopo ?? "turma";
  if (escopo !== "turma" && escopo !== "guilda" && escopo !== "aluno") erros.escopo = "Escolha quem cumpre.";
  // Guilda soma o progresso dos membros: entrega não é número, e o banco recusaria (22023).
  if (escopo === "guilda" && entrega) erros.caminho = "Missão de guilda é uma meta: a guilda soma o que os membros fazem.";
  // O laço da guilda soma todos os membros e ignora o perfil; o banco recusa (22023).
  if (escopo === "guilda" && perfil) erros.perfil = "Missão de guilda vale para a guilda inteira, sem perfil.";

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
    classe_id: turma,
    perfil_alvo: perfil || null,
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

// --- Missão-desafio (#1149) -----------------------------------------------------------------
//
// `missao_desafio_criar` grava o mesmo quebra-cabeça numa linha por perfil, todas com o mesmo
// `desafio_grupo` (índice único `(desafio_grupo, perfil_alvo)`). Para o professor é um desafio
// só, então a aba Missões mostra um cartão por grupo, com os perfis das linhas.

/**
 * O banco ainda não tem as colunas do desafio (#1149 não aplicada): a leitura repete sem elas.
 * 42703 é a coluna que o Postgres não conhece (no `select` e no `.is("desafio", null)`), e PGRST204
 * a que o cache de schema do PostgREST não tem. PGRST100 (erro de sintaxe da consulta) fica de fora:
 * a coluna desconhecida não o produz, e repetir sem o filtro esconderia um erro de verdade.
 */
export function faltaColunaDoDesafio(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === "42703" || erro?.code === "PGRST204";
}

const ORDEM_DOS_PERFIS = PERFIS_DA_MISSAO.map((p) => p.chave as string);
const posicaoDoPerfil = (perfil: string) => {
  const i = ORDEM_DOS_PERFIS.indexOf(perfil);
  return i < 0 ? ORDEM_DOS_PERFIS.length : i;
};

/**
 * Uma entrada por `desafio_grupo`, no lugar da primeira linha do grupo; as missões comuns passam
 * como vieram. O grupo está ativo enquanto alguma linha estiver: "Desativar" desliga todas, e
 * só então o cartão diz "Desativada".
 */
export function agruparDesafios(missoes: Missao[]): Missao[] {
  const grupos = new Map<string, Missao[]>();
  for (const m of missoes) {
    if (m.desafio == null || !m.desafioGrupo) continue;
    const lista = grupos.get(m.desafioGrupo) ?? [];
    lista.push(m);
    grupos.set(m.desafioGrupo, lista);
  }
  if (grupos.size === 0) return missoes;

  const saida: Missao[] = [];
  for (const m of missoes) {
    if (m.desafio == null || !m.desafioGrupo) {
      saida.push(m);
      continue;
    }
    const linhasDoGrupo = grupos.get(m.desafioGrupo);
    if (!linhasDoGrupo || linhasDoGrupo[0] !== m) continue;
    const linhas: LinhaDoDesafio[] = linhasDoGrupo
      .flatMap((l) => l.linhasDoDesafio)
      .sort((a, b) => posicaoDoPerfil(a.perfilAlvo) - posicaoDoPerfil(b.perfilAlvo));
    saida.push({
      ...m,
      ativa: linhas.some((l) => l.ativa),
      perfis: linhas.map((l) => l.perfilAlvo),
      linhasDoDesafio: linhas,
    });
  }
  return saida;
}

/** "Lógica · múltipla escolha", "Lógica · resposta curta" ou "Cruzadinha". */
export function rotuloDoTipoDoDesafio(desafio: unknown): string {
  const d = desafio && typeof desafio === "object" ? (desafio as Record<string, unknown>) : null;
  if (d?.tipo === "cruzadinha") return "Cruzadinha";
  if (d?.tipo === "logica") {
    if (d.formato === "multipla") return "Lógica · múltipla escolha";
    if (d.formato === "curta") return "Lógica · resposta curta";
    return "Lógica";
  }
  return "Desafio";
}

/** Quantas pistas da cruzadinha entram no resumo do cartão. */
const PISTAS_NO_RESUMO = 3;

/**
 * O que distingue dois desafios do mesmo tipo no mesmo conteúdo, que têm o mesmo título (a RPC o
 * monta com o do conteúdo): o enunciado da lógica, ou as primeiras pistas da cruzadinha pela
 * numeração da grade. Lê só esses campos de `missoes.desafio`, o formato público que o aluno vê:
 * nem as alternativas nem campo a mais entram, e o gabarito nem chega ao console por aqui.
 */
export function resumoDoDesafio(desafio: unknown): string {
  const d = desafio && typeof desafio === "object" && !Array.isArray(desafio) ? (desafio as Record<string, unknown>) : null;
  const umaLinha = (valor: unknown) => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");
  if (d?.tipo === "logica") return umaLinha(d.enunciado);
  if (d?.tipo !== "cruzadinha" || !Array.isArray(d.palavras)) return "";
  const pistas = d.palavras
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({ numero: typeof p.numero === "number" ? p.numero : Number.MAX_SAFE_INTEGER, direcao: String(p.direcao ?? ""), pista: umaLinha(p.pista) }))
    .filter((p) => p.pista)
    .sort((a, b) => a.numero - b.numero || a.direcao.localeCompare(b.direcao))
    .slice(0, PISTAS_NO_RESUMO)
    .map((p) => p.pista);
  return pistas.length > 0 ? `Pistas: ${pistas.join(" · ")}` : "";
}

/**
 * Perfis que a linha pode receber: o dela e os que nenhuma outra linha do grupo tem, nem salvo nem
 * no rascunho. Excluir também o salvo das outras é o que deixa os UPDATEs em qualquer ordem: o
 * índice único `(desafio_grupo, perfil_alvo)` nunca vê dois iguais no meio do caminho.
 */
export function opcoesDePerfilDaLinha(linhas: LinhaDoDesafio[], rascunho: Record<number, string>, linhaId: number): string[] {
  const ocupados = new Set<string>();
  for (const l of linhas) {
    if (l.id === linhaId) continue;
    ocupados.add(l.perfilAlvo);
    if (rascunho[l.id]) ocupados.add(rascunho[l.id]);
  }
  return ORDEM_DOS_PERFIS.filter((p) => !ocupados.has(p));
}

/**
 * O que o rascunho muda: um UPDATE de `perfil_alvo` por linha que mudou, sem inserir nem apagar
 * linha. Lança com a mensagem para a tela quando o banco recusaria (23505).
 */
export function trocasDePerfil(linhas: LinhaDoDesafio[], rascunho: Record<number, string>): { id: number; perfil: string }[] {
  const final = linhas.map((l) => ({ id: l.id, antes: l.perfilAlvo, depois: (rascunho[l.id] ?? l.perfilAlvo).trim().toLowerCase() }));
  for (const f of final) {
    if (!ORDEM_DOS_PERFIS.includes(f.depois)) throw new Error("Escolha um perfil da lista.");
  }
  const vistos = new Set<string>();
  for (const f of final) {
    if (vistos.has(f.depois)) throw new Error("Duas linhas do desafio ficariam com o mesmo perfil.");
    vistos.add(f.depois);
  }
  const mudancas = final.filter((f) => f.depois !== f.antes);
  for (const f of mudancas) {
    if (final.some((o) => o.id !== f.id && o.antes === f.depois)) {
      throw new Error("Para trocar dois perfis entre si, troque um de cada vez: primeiro para um perfil livre.");
    }
  }
  return mudancas.map((f) => ({ id: f.id, perfil: f.depois }));
}
