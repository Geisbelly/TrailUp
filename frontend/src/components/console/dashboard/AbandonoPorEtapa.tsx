import { CHAVE, estadoDoCard, TEXTO_DO_ESTADO, type Disponibilidade } from "./disponibilidade";
import type { KpisPorTopico } from "./useKpisPorTopico";

const minutos = (seg: number | null) => (seg === null ? "—" : `${Math.round(seg / 60)} min`);

/**
 * Abandono por etapa (#12): por tópico da trilha, quantos alunos iniciaram, concluíram e estão
 * parados (14 dias sem avançar, abaixo da mediana da turma no tópico), mais o tempo ativo na janela.
 * Substitui a "taxa de abandono" por aluno, que media "ainda não terminou".
 */
export default function AbandonoPorEtapa({
  turmaUnica,
  kpis,
  disponibilidade,
}: {
  /** null quando o escopo é "todas as turmas": a RPC é por turma. */
  turmaUnica: number | null;
  kpis: KpisPorTopico;
  disponibilidade: Map<string, Disponibilidade>;
}) {
  const vazio = kpis.topicos !== null && kpis.topicos.length === 0;
  const estado = estadoDoCard({
    valor: kpis.topicos === null || vazio ? null : 1,
    erro: kpis.erro,
    chave: CHAVE.abandonoPorEtapa,
    disponibilidade,
  });

  return (
    <section aria-labelledby="abandono-por-etapa" className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
      <h3 id="abandono-por-etapa" className="text-lg text-foreground">Abandono por etapa</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Por tópico: quem iniciou, quem concluiu e quem está parado há 14 dias abaixo da mediana da turma. Tempo ativo na
        janela escolhida no topo.
      </p>

      {turmaUnica === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Escolha uma turma no topo para ver os números por tópico.</p>
      ) : kpis.carregando ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : estado !== "valor" ? (
        <p className="mt-4 text-sm text-muted-foreground" role={estado === "erro" ? "alert" : undefined}>
          {estado === "sem_dado" && vazio ? "Esta turma ainda não tem tópicos." : TEXTO_DO_ESTADO[estado]}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[13.5px]">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Tópico</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tempo ativo por aluno</th>
                <th scope="col" className="px-3 py-2 font-semibold">Alunos ativos</th>
                <th scope="col" className="px-3 py-2 font-semibold">Iniciaram</th>
                <th scope="col" className="px-3 py-2 font-semibold">Concluíram</th>
                <th scope="col" className="px-3 py-2 font-semibold">Parados</th>
              </tr>
            </thead>
            <tbody>
              {kpis.topicos!.map((t) => (
                <tr key={t.topico_id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2.5 font-semibold text-foreground">{t.nome}</th>
                  <td className="px-3 py-2.5 text-foreground">{minutos(t.tempo_ativo_medio_por_aluno_ativo_seg)}</td>
                  <td className="px-3 py-2.5 text-foreground">{t.alunos_ativos}</td>
                  <td className="px-3 py-2.5 text-foreground">{t.iniciaram}</td>
                  <td className="px-3 py-2.5 text-foreground">{t.concluiram}</td>
                  <td className={`px-3 py-2.5 ${t.estagnados > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                    {t.estagnados}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
