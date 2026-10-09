/**
 * Indicadores comportamentais: do que o app JA' coleta para evidencia sobre o
 * perfil.
 *
 * Cada funcao e' pura e recebe linhas ja' buscadas. Isso separa tres coisas que
 * costumam virar uma so': de onde o dado vem (consulta), o que ele significa
 * (aqui) e quanto ele move o perfil (`atualizacaoDoPerfil.ts`).
 *
 * NENHUMA depende de volume para funcionar. Com uma linha, devolve uma
 * observacao com `n = 1` — que a atualizacao vai pesar como quase nada. Com
 * mil, `n = 1000`. A quantidade e' ENTRADA do calculo, nao pre-requisito dele.
 *
 * O QUE AINDA NAO ESTA' VALIDADO: que estes indicadores de fato discriminem os
 * perfis. Isso exige dado e comparacao com o prior — e' calibrar
 * `pesoPorUnidade`, nao poder implementar. Ate la' todos valem o mesmo, de
 * forma explicita, em vez de carregarem pesos inventados com ar de ciencia.
 */

import type { BrainHexProfileKey } from "./brainhex";
import type { Observacao } from "./atualizacaoDoPerfil";

/** Tentativas por questao: fonte de `telemetria_eventos_app`. */
export type LinhaTentativa = {
  questao_id: number | string | null;
  attempt_number: number | null;
  is_correct: boolean | null;
};

/**
 * Survivor: persistir depois de errar.
 *
 * Mede a fracao de questoes em que o aluno VOLTOU depois de um erro. Quem
 * desiste na primeira tentativa errada pontua baixo; quem insiste, alto.
 *
 * Centrado em 0.5 para ficar na mesma unidade do prior (positivo = acima do
 * tipico), e escalado por 2 para a faixa ser -1..1.
 */
export function persistenciaAposErro(linhas: readonly LinhaTentativa[]): Observacao | null {
  const porQuestao = new Map<string, LinhaTentativa[]>();
  for (const l of linhas) {
    if (l.questao_id == null) continue;
    const k = String(l.questao_id);
    porQuestao.set(k, [...(porQuestao.get(k) ?? []), l]);
  }

  let comErro = 0;
  let insistiu = 0;
  for (const tentativas of porQuestao.values()) {
    const errou = tentativas.some((t) => t.is_correct === false);
    if (!errou) continue;
    comErro += 1;
    const maxTentativa = Math.max(...tentativas.map((t) => Number(t.attempt_number ?? 1)));
    if (maxTentativa > 1) insistiu += 1;
  }

  // Sem questao errada nao ha' o que medir: devolver 0 seria afirmar "nao
  // persiste", que e' diferente de "nao houve ocasiao".
  if (comErro === 0) return null;

  return {
    perfil: "survivor",
    valor: (insistiu / comErro - 0.5) * 2,
    n: comErro,
    indicador: "persistencia_apos_erro",
  };
}

/** Progresso por item: fonte de `personalizacao_item_progresso`. */
export type LinhaProgresso = {
  obrigatorio: boolean | null;
  percentual_concluido: number | null;
};

/**
 * Achiever: fechar o que nao precisava fechar.
 *
 * Fracao do material OPCIONAL concluido. Material obrigatorio nao discrimina
 * nada — todo mundo precisa fazer.
 */
export function conclusaoDeOpcional(linhas: readonly LinhaProgresso[]): Observacao | null {
  const opcionais = linhas.filter((l) => l.obrigatorio === false);
  if (opcionais.length === 0) return null;

  const concluidos = opcionais.filter(
    (l) => Number(l.percentual_concluido ?? 0) >= 100,
  ).length;

  return {
    perfil: "achiever",
    valor: (concluidos / opcionais.length - 0.5) * 2,
    n: opcionais.length,
    indicador: "conclusao_de_opcional",
  };
}

/** Tempo por escopo: fonte de `vw_telemetria_tempo_conteudo_aluno`. */
export type LinhaTempo = {
  tipo: "teoria" | "atividade";
  tempo_ativo_seg: number | null;
};

/**
 * Mastermind: estudar a teoria antes de executar.
 *
 * Razao entre tempo em teoria e tempo total. Centrada em 0.5: quem divide
 * meio a meio fica em zero; quem so' faz exercicio fica negativo.
 */
export function proporcaoDeTeoria(linhas: readonly LinhaTempo[]): Observacao | null {
  let teoria = 0;
  let total = 0;
  for (const l of linhas) {
    const seg = Math.max(0, Number(l.tempo_ativo_seg ?? 0));
    total += seg;
    if (l.tipo === "teoria") teoria += seg;
  }
  if (total <= 0) return null;

  return {
    perfil: "mastermind",
    valor: (teoria / total - 0.5) * 2,
    // `n` em MINUTOS, nao em linhas: dez minutos de leitura sustentam mais do
    // que dez linhas de meio segundo cada.
    n: Math.max(1, Math.round(total / 60)),
    indicador: "proporcao_de_teoria",
  };
}

/** Junta os indicadores disponiveis, ignorando os que nao tiveram ocasiao. */
export function coletarObservacoes(fontes: {
  tentativas?: readonly LinhaTentativa[];
  progresso?: readonly LinhaProgresso[];
  tempo?: readonly LinhaTempo[];
}): Observacao[] {
  return [
    fontes.tentativas ? persistenciaAposErro(fontes.tentativas) : null,
    fontes.progresso ? conclusaoDeOpcional(fontes.progresso) : null,
    fontes.tempo ? proporcaoDeTeoria(fontes.tempo) : null,
  ].filter((o): o is Observacao => o !== null);
}

export type { BrainHexProfileKey };
