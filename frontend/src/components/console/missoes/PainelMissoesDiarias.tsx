import { Flag, Loader2 } from "lucide-react";
import { percentualCumprido, type ResumoDasMissoesDiarias } from "./missoesDiariasApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function dataCurta(iso: string) {
  if (!iso) return "hoje";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/** Bloco do painel do professor: missões do dia por coorte e quantos já cumpriram. */
export function PainelMissoesDiarias({
  dados,
  carregando,
  erro,
  onTentar,
}: {
  dados: ResumoDasMissoesDiarias | null;
  carregando: boolean;
  erro: string | null;
  onTentar: () => void;
}) {
  return (
    <section aria-label="Missões do dia" className="rounded-[20px] border bg-card p-5">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-[15px] font-bold">Missões do dia</h2>
        {dados?.dia && <span className="text-[12px] text-muted-foreground">· {dataCurta(dados.dia)}</span>}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Geradas à meia-noite por coorte (perfil BrainHex). O texto pode ser reescrito pelo Gemini; o que elas medem não muda.
      </p>

      {carregando && (
        <div role="status" aria-label="Carregando missões do dia" className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {!carregando && erro && (
        <div className="mt-4 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-semibold text-destructive">Não foi possível carregar as missões do dia</p>
          <p className="mt-1 text-muted-foreground">{erro}</p>
          <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={onTentar}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erro && dados && dados.missoes.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhuma missão do dia ainda. Elas nascem à meia-noite de Brasília, depois que a cadeia da fase 5b estiver aplicada.
        </p>
      )}

      {!carregando && !erro && dados && dados.missoes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {dados.missoes.map((m) => {
            const pct = percentualCumprido(m.cumpriram, m.alunosDoPerfil);
            return (
              <li key={m.id} className="rounded-[14px] border bg-background/60 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{m.titulo}</h3>
                  <span className={rotulo}>{m.perfilAlvo ?? "todos"} · slot {m.slot}</span>
                </div>
                {m.descricao && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{m.descricao}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
                  <span className="font-semibold">
                    {m.cumpriram}/{m.alunosDoPerfil} cumpriram · {pct}%
                  </span>
                  <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
