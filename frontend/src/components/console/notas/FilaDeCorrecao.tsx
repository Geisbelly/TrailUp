import { SeloDeStatus, type TomDoSelo } from "../comum/PaginaDoConsole";
import { estadoDaEntrega, rotuloDeEspera, type LinhaDaFila } from "./fila";
import { formatar, iniciais } from "./nota";

const SELO: Record<ReturnType<typeof estadoDaEntrega>, { tom: TomDoSelo; texto: (l: LinhaDaFila) => string }> = {
  revisar: { tom: "alerta", texto: (l) => `Revisar nota da IA · ${formatar(l.pontuacaoObtida)}` },
  sem_nota: { tom: "perigo", texto: () => "A IA não corrigiu" },
  sem_entrega: { tom: "perigo", texto: () => "Não entregou" },
  corrigida: { tom: "ativo", texto: (l) => (l.pontuacaoObtida !== null ? `Corrigida · ${formatar(l.pontuacaoObtida)}` : "Corrigida") },
};

/** Fila de correção: uma linha por entrega, a que espera há mais tempo primeiro (a ordem vem pronta de `filtrarFila`). */
export function FilaDeCorrecao({ linhas, onAbrir }: { linhas: LinhaDaFila[]; onAbrir: (l: LinhaDaFila) => void }) {
  const agora = new Date();
  return (
    <ul className="space-y-3" aria-label="Fila de correção">
      {linhas.map((l) => {
        const estado = estadoDaEntrega(l);
        const selo = SELO[estado];
        return (
          <li key={`${l.alunoId}-${l.atividadeId}`}>
            <button
              type="button"
              onClick={() => onAbrir(l)}
              className="flex w-full flex-wrap items-center gap-4 rounded-[20px] border bg-card p-4 text-left transition-colors hover:border-primary"
            >
              <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-muted text-[13px] font-extrabold">
                {iniciais(l.alunoNome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold">{l.alunoNome}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{l.titulo} · Dissertativa</span>
              </span>
              <span className="text-[12px] text-muted-foreground">{rotuloDeEspera(l, agora)}</span>
              <SeloDeStatus tom={selo.tom}>{selo.texto(l)}</SeloDeStatus>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
