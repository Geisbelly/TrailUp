import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { NOME_DO_PERFIL } from "../dashboard/perfilCores";
import { COR_PADRAO, corDaConquista, ICONE_PADRAO, iconeValido } from "./aparencia";
import { metricaPorChave, montarCriterio, validarLimiar, type MetricaChave } from "./criterio";

// O formulário "Nova conquista" vira LINHAS de `conquistas`. Regra da #158: limiar
// diferente por perfil é uma conquista por perfil (uma linha cada), nunca um mapa
// numa coluna — `conquistas_aluno` referencia `conquista_id`, então um limiar
// resolvido na hora da avaliação não teria a que linha se prender.

export type EscopoDoFormulario = "geral" | "perfil";
export type ModoDoLimiar = "igual" | "por_perfil";

export type FormularioDeConquista = {
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  metrica: MetricaChave | "";
  limiar: string;
  escopo: EscopoDoFormulario;
  perfis: BrainHexProfileKey[];
  modoLimiar: ModoDoLimiar;
  limiaresPorPerfil: Partial<Record<BrainHexProfileKey, string>>;
  pontos: string;
};

export const FORMULARIO_VAZIO: FormularioDeConquista = {
  nome: "",
  descricao: "",
  icone: ICONE_PADRAO,
  cor: COR_PADRAO,
  metrica: "",
  limiar: "",
  escopo: "geral",
  perfis: [],
  modoLimiar: "igual",
  limiaresPorPerfil: {},
  pontos: "",
};

export type LinhaDeConquista = {
  nome: string;
  descricao: string;
  escopo: "comum" | "perfil";
  /** Chave minúscula do perfil BrainHex (`seeker`…); null na conquista geral. */
  perfil_alvo: BrainHexProfileKey | null;
  criterio: Record<string, unknown>;
  pontos_recompensa: number;
};

export type CampoComErro = "nome" | "descricao" | "metrica" | "limiar" | "perfis" | "pontos";
export type ErrosDoFormulario = Partial<Record<CampoComErro | `limiar:${BrainHexProfileKey}`, string>>;

export const NOME_MAX = 60;
export const DESCRICAO_MAX = 140;
/** Teto de pontos que o formulário aceita sem consultar o banco; quem decide de verdade é o servidor. */
export const PONTOS_MAX_PADRAO = 100;

// Duas chaves exclusivas (ver criterio.ts): strictNullChecks desligado.
export type ResultadoDoFormulario = { ok: boolean; linhas: LinhaDeConquista[] | null; erros: ErrosDoFormulario | null };

export function expandirEmLinhas(form: FormularioDeConquista, opcoes: { pontosMax?: number } = {}): ResultadoDoFormulario {
  const erros: ErrosDoFormulario = {};
  const pontosMax = opcoes.pontosMax ?? PONTOS_MAX_PADRAO;

  const nome = form.nome.trim();
  if (nome.length < 3) erros.nome = "Dê um nome de pelo menos 3 letras.";
  else if (nome.length > NOME_MAX) erros.nome = `No máximo ${NOME_MAX} caracteres.`;

  const descricao = form.descricao.trim();
  if (descricao.length > DESCRICAO_MAX) erros.descricao = `No máximo ${DESCRICAO_MAX} caracteres.`;

  const metrica = metricaPorChave(form.metrica);
  if (!metrica) erros.metrica = "Escolha o que será medido.";

  const pontos = Number(form.pontos.trim().replace(",", "."));
  if (!form.pontos.trim() || !Number.isInteger(pontos) || pontos < 0 || pontos > pontosMax) {
    erros.pontos = `Informe os pontos (inteiro de 0 a ${pontosMax}).`;
  }

  if (form.escopo === "perfil" && form.perfis.length === 0) erros.perfis = "Escolha ao menos um perfil.";

  // Limiar: um só (geral, ou perfis com o mesmo valor) ou um por perfil.
  const limiarPorPerfil = form.escopo === "perfil" && form.modoLimiar === "por_perfil";
  const limiares = new Map<string, number | "todos">();
  if (metrica) {
    if (limiarPorPerfil) {
      for (const p of form.perfis) {
        const r = validarLimiar(metrica, form.limiaresPorPerfil[p] ?? "");
        if (r.ok) limiares.set(p, r.valor);
        else erros[`limiar:${p}`] = r.erro;
      }
    } else {
      const r = validarLimiar(metrica, form.limiar);
      if (r.ok) limiares.set("*", r.valor);
      else erros.limiar = r.erro;
    }
  }

  if (Object.keys(erros).length > 0 || !metrica) return { ok: false, linhas: null, erros };

  const icone = iconeValido(form.icone) ? form.icone : ICONE_PADRAO;
  const montar = (perfil: BrainHexProfileKey | null, limiar: number | "todos"): LinhaDeConquista => ({
    nome: perfil && form.perfis.length > 1 ? `${nome} · ${NOME_DO_PERFIL[perfil]}` : nome,
    descricao,
    escopo: perfil ? "perfil" : "comum",
    perfil_alvo: perfil,
    criterio: montarCriterio(metrica, limiar, { icone, cor: corDaConquista(form.cor, perfil) }),
    pontos_recompensa: pontos,
  });

  if (form.escopo === "geral") return { ok: true, linhas: [montar(null, limiares.get("*")!)], erros: null };
  return { ok: true, linhas: form.perfis.map((p) => montar(p, limiarPorPerfil ? limiares.get(p)! : limiares.get("*")!)), erros: null };
}
