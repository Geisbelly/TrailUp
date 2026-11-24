import fotoDaLumi from "@/assets/design/lumi.webp";
import { textoDoRespondendo } from "./conversa";

/**
 * "Lumi está respondendo": balão com o rosto da Lumi e três pontos, logo depois do envio, até a
 * resposta chegar ou falhar (quem o tira é o `finally` do envio). O "Pensando…" de antes era uma
 * linha de texto cinza com pontos de 6 px que só piscavam, e a autora relatou não ver indicação
 * nenhuma depois de enviar (24/11).
 *
 * `role="status"` é região viva educada: o leitor de tela anuncia o texto, sem ler os pontos.
 * Com "Reduzir movimento", os pontos ficam parados (`motion-reduce`).
 */
export default function Respondendo({ demorando }: { demorando: boolean }) {
  const texto = textoDoRespondendo(demorando);
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-2">
      <img src={fotoDaLumi} alt="" aria-hidden="true" className="mt-0.5 h-6 w-6 flex-none rounded-full bg-muted object-cover" />
      <div className="min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 rounded-[14px] rounded-tl-sm border border-border bg-muted/40 px-3 py-2.5"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-[hsl(var(--console-bronze-text))] motion-reduce:animate-none"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {texto}
        </p>
      </div>
    </div>
  );
}
