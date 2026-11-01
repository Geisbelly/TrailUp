import { resumirRisco } from "./riscoReprovacao";
import type { EstadoDoRisco } from "./useRiscoDeReprovacao";

type AlunoDaTurma = { id: string; nome: string };

/**
 * Risco de reprovação (#135): quem junta sinais de reprovar mesmo continuando na turma, com o fato
 * de cada sinal. Não é o abandono (que estima quem vai sumir). Só o professor vê; o texto convida a
 * apoiar, não a rotular.
 */
export default function RiscoDeReprovacao<T extends AlunoDaTurma>({
  turmaUnica,
  estado,
  alunos,
  onAbrir,
}: {
  /** null quando o escopo é "todas as turmas": a função é por turma. */
  turmaUnica: number | null;
  estado: EstadoDoRisco;
  alunos: T[];
  onAbrir: (aluno: T) => void;
}) {
  const resumo = estado.linhas ? resumirRisco(estado.linhas) : null;
  const alunoPorId = new Map(alunos.map((a) => [a.id, a]));

  return (
    <section aria-labelledby="risco-de-reprovacao" className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
      <h3 id="risco-de-reprovacao" className="text-lg text-foreground">Risco de reprovação</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Alunos que juntam dois ou mais sinais: queda de uso, acerto baixo, faltas, prazos perdidos ou o mesmo estado
        difícil em vários ciclos. Só você vê. É um ponto de partida para uma conversa de apoio, não um rótulo.
      </p>

      {turmaUnica === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Escolha uma turma no topo para ver o risco de reprovação.</p>
      ) : estado.carregando ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : estado.indisponivel ? (
        <p className="mt-4 text-sm text-muted-foreground">Ainda não disponível neste ambiente.</p>
      ) : estado.erro || !resumo ? (
        <p className="mt-4 text-sm text-muted-foreground" role="alert">
          Não foi possível carregar
        </p>
      ) : resumo.sinalizados.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhum aluno com dois ou mais sinais agora.
          {resumo.emObservacao > 0 &&
            ` ${resumo.emObservacao} ${resumo.emObservacao === 1 ? "tem" : "têm"} um sinal só, abaixo do corte.`}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {resumo.sinalizados.map((r) => {
              const aluno = alunoPorId.get(r.aluno_id);
              return (
                <li key={r.aluno_id} className="rounded-2xl border border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {aluno ? (
                      <button
                        type="button"
                        onClick={() => onAbrir(aluno)}
                        className="text-left text-sm font-bold text-foreground underline-offset-2 hover:underline"
                      >
                        {aluno.nome}
                      </button>
                    ) : (
                      <span className="text-sm font-bold text-foreground">Aluno</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {r.fatores.length} {r.fatores.length === 1 ? "sinal" : "sinais"}
                    </span>
                  </div>
                  <ul className="mt-1.5 list-disc pl-5 text-[13px] text-foreground">
                    {r.fatores.map((f) => (
                      <li key={f.fator}>{f.texto}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {resumo.emObservacao > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {resumo.emObservacao} {resumo.emObservacao === 1 ? "aluno tem" : "alunos têm"} um sinal só, abaixo do corte.
            </p>
          )}
        </>
      )}
    </section>
  );
}
