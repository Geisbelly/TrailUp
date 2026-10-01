import { AlertTriangle } from "lucide-react";
import { ChipDeRisco } from "../PrecisamDeAtencao";
import type { Risco } from "../risco";

export default function SinalDeAtencao({ risco, primeiroNome, onVerTrilha }: { risco: Risco; primeiroNome: string; onVerTrilha: () => void }) {
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
      <ul className="mt-3 flex flex-col gap-2">
        {risco.fatores.map((fator) => (
          <li key={fator.criterio} className="flex items-start gap-2 text-[12.5px] text-foreground">
            <span aria-hidden="true" className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full bg-destructive" />
            <span>
              {fator.motivo}
              {fator.comparacao && <span className="text-muted-foreground"> · {fator.comparacao}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="my-3.5 h-px bg-border" />
      <button type="button" onClick={onVerTrilha} className="text-xs font-semibold text-[hsl(var(--console-violet-text))] hover:underline">
        Ver a trilha do aluno →
      </button>
    </section>
  );
}
