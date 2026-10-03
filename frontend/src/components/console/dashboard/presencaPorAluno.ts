/**
 * Presenca (tempo com o material aberto) por aluno e classe.
 *
 * Separado de `DashboardSection` para poder ser testado: a conta parece
 * trivial, mas tem tres armadilhas que ja' custaram caro neste repositorio.
 *
 * 1. ESCOPO. `telemetria_time_metric_entries` guarda o MESMO intervalo em
 *    varios escopos aninhados (`topic` contem `content` contem `material`).
 *    Somar escopos diferentes multiplica o tempo por tres. Quem filtra aqui e'
 *    a view `vw_telemetria_tempo_topico_aluno` (`WHERE scope = 'topic'`); esta
 *    funcao assume linhas JA filtradas e soma apenas entre topicos distintos,
 *    que nao se sobrepoem.
 *
 * 2. AUSENCIA NAO E ZERO. Aluno sem nenhuma linha de telemetria nao aparece no
 *    mapa, e a tela mostra o campo vazio em vez de "0 min". Zero seria "abriu e
 *    saiu na hora", que e' uma afirmacao diferente — e falsa.
 *
 * 3. PRESENCA != TEMPO ATIVO. `classe_aluno.tempoGastoMin` soma `active_sec`;
 *    esta funcao soma `dwell_sec`. Num topico medido em producao, 6,40 min
 *    ativos contra 35,38 de presenca. Os dois numeros sao verdadeiros e
 *    respondem perguntas diferentes.
 */

export type LinhaPresenca = {
  aluno_id: string | null;
  classe_id: number | null;
  tempo_total_seg: number | null;
};

/** Chave do mapa: `${classe_id}:${aluno_id}`. */
export function chavePresenca(classeId: number | string, alunoId: string): string {
  return `${classeId}:${alunoId}`;
}

/** Minutos de presenca por (classe, aluno). Ausente = sem telemetria. */
export function somarPresencaPorAluno(
  linhas: readonly LinhaPresenca[],
): Map<string, number> {
  const segundos = new Map<string, number>();

  for (const linha of linhas) {
    if (!linha.aluno_id || linha.classe_id == null) continue;
    const bruto = Number(linha.tempo_total_seg ?? 0);
    if (!Number.isFinite(bruto) || bruto < 0) continue;
    const chave = chavePresenca(linha.classe_id, linha.aluno_id);
    segundos.set(chave, (segundos.get(chave) ?? 0) + bruto);
  }

  const minutos = new Map<string, number>();
  for (const [chave, total] of segundos) minutos.set(chave, total / 60);
  return minutos;
}
