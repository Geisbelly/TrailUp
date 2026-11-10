import { AlertTriangle } from "lucide-react";
import CartaoDeInsight from "../CartaoDeInsight";
import { ChipDeRisco } from "../PrecisamDeAtencao";
import type { Risco } from "../risco";
import { sugestaoDoFator } from "../sugestaoDoRisco";
import { useSugestoesDaIAParaAluno } from "./useSugestoesDaIAParaAluno";

export default function SinalDeAtencao({
  risco,
  alunoId,
  classeId,
  primeiroNome,
  onVerTrilha,
}: {
  risco: Risco;
  alunoId: string;
  classeId: number;
  primeiroNome: string;
  onVerTrilha: () => void;
}) {
  const { linhas: daIA, decidir } = useSugestoesDaIAParaAluno(alunoId, classeId);

  return (
    <section aria-labelledby="sinal-de-atencao" className="rounded-2xl border border-destructive/50 bg-card px-[22px] py-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <AlertTriangle className="h-[15px] w-[15px] text-destructive" aria-hidden="true" />
        <h3 id="sinal-de-atencao" className="font-sans text-[13.5px] font-bold text-foreground">
          Sinal de atenção
        </h3>
        <ChipDeRisco nivel={risco.nivel} />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        Visível só para você — nunca aparece para {primeiroNome} ou para os colegas.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {risco.fatores.map((fator) => (
          <li key={fator.criterio} className="flex items-start gap-2 text-[12.5px] text-foreground">
            <span aria-hidden="true" className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full bg-destructive" />
            <span>
              {fator.motivo}
              {fator.comparacao && <span className="text-muted-foreground"> · {fator.comparacao}</span>}
              <span className="mt-1 block">
                <span className="font-semibold text-[hsl(var(--console-violet-text))]">O que fazer: </span>
                {sugestaoDoFator(fator, primeiroNome)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] text-muted-foreground">Sugestões pela regra de cada sinal, não escritas pela IA.</p>

      {daIA.length > 0 && (
        <div className="mt-4">
          <h4 className="font-sans text-xs font-bold text-foreground">Sugestão da IA para {primeiroNome}</h4>
          <ul className="mt-2 flex flex-col gap-2.5">
            {daIA.map((insight) => (
              <CartaoDeInsight
                key={insight.id}
                insight={insight}
                alvo={primeiroNome}
                aluno={null}
                onAbrirAluno={() => undefined}
                onDecidir={(status, motivo) => decidir(insight.id, status, motivo)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="my-3.5 h-px bg-border" />
      <button type="button" onClick={onVerTrilha} className="text-xs font-semibold text-[hsl(var(--console-violet-text))] hover:underline">
        Ver a trilha do aluno →
      </button>
    </section>
  );
}
