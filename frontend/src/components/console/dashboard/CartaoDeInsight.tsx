import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  fontesRagDoInsight,
  MOTIVOS_DE_DESCARTE,
  rotuloDoMotivo,
  type Insight,
  type MotivoDescarte,
} from "./insights";
import type { Aluno } from "./aluno/tipos";

export const botaoDoInsight = "rounded-full px-[15px] py-2 text-xs font-semibold transition-colors disabled:opacity-60";

export default function CartaoDeInsight({
  insight,
  alvo,
  aluno,
  onAbrirAluno,
  onDecidir,
}: {
  insight: Insight;
  alvo: string;
  aluno: Aluno | null;
  onAbrirAluno: (aluno: Aluno) => void;
  onDecidir: (status: "applied" | "dismissed", motivo: MotivoDescarte | null) => Promise<void>;
}) {
  const [ignorando, setIgnorando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const sugestao = insight.natureza === "sugestao";
  const fontesRag = fontesRagDoInsight(insight);

  const decidir = async (status: "applied" | "dismissed") => {
    setSalvando(true);
    setErro(null);
    try {
      await onDecidir(status, status === "dismissed" ? motivo : null);
      setIgnorando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <li
      className={cn(
        "rounded-[18px] border bg-card px-[22px] py-[18px]",
        sugestao && insight.status === "pending" ? "border-[hsl(var(--console-violet))]" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em]",
            sugestao ? "bg-[hsl(var(--console-violet)/.16)] text-[hsl(var(--console-violet-text))]" : "bg-muted text-muted-foreground",
          )}
        >
          {sugestao ? "Sugestão" : "Observação"}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">{alvo}</span>
      </div>
      <p className="mt-2.5 text-[14.5px] font-semibold leading-normal text-foreground">{insight.texto}</p>
      {insight.base && <p className="mt-2 text-[11px] text-muted-foreground">com base em: {insight.base}</p>}
      {fontesRag.length > 0 && (
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Fontes citadas pelo modelo ({fontesRag.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 pl-5">
            {fontesRag.map((fonte) => (
              <li key={fonte}>{fonte}</li>
            ))}
          </ul>
        </details>
      )}

      {sugestao && insight.status === "applied" && (
        <p className="mt-3 text-xs font-semibold text-[hsl(var(--success))]">Aceita</p>
      )}
      {sugestao && insight.status === "dismissed" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ignorada{rotuloDoMotivo(insight.motivo_descarte) ? ` · ${rotuloDoMotivo(insight.motivo_descarte)}` : ""}
        </p>
      )}

      {sugestao && insight.status === "pending" && !ignorando && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={() => void decidir("applied")}
            className={cn(botaoDoInsight, "border border-[hsl(var(--success))] bg-[hsl(var(--success)/.16)] text-foreground hover:bg-[hsl(var(--success)/.26)]")}
          >
            Aceitar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => setIgnorando(true)}
            className={cn(botaoDoInsight, "border border-border text-muted-foreground hover:text-foreground")}
          >
            Ignorar
          </button>
        </div>
      )}

      {sugestao && insight.status === "pending" && ignorando && (
        <div className="mt-3">
          <div id={`motivo-${insight.id}`} className="mb-[7px] text-[11.5px] text-muted-foreground">
            Motivo (opcional):
          </div>
          <div role="group" aria-labelledby={`motivo-${insight.id}`} className="flex flex-wrap gap-1.5">
            {MOTIVOS_DE_DESCARTE.map((m) => (
              <button
                key={m.valor}
                type="button"
                aria-pressed={motivo === m.valor}
                onClick={() => setMotivo(motivo === m.valor ? null : m.valor)}
                className={cn(
                  "rounded-full border px-[11px] py-1.5 text-[11px]",
                  motivo === m.valor ? "border-foreground bg-muted font-semibold text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={() => {
                setIgnorando(false);
                setMotivo(null);
              }}
              className={cn(botaoDoInsight, "border border-border text-muted-foreground hover:text-foreground")}
            >
              Cancelar
            </button>
            <button type="button" disabled={salvando} onClick={() => void decidir("dismissed")} className={cn(botaoDoInsight, "bg-muted text-foreground")}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* "Ver detalhe" só onde há destino real: a página do aluno. */}
      {!sugestao && aluno && (
        <button
          type="button"
          onClick={() => onAbrirAluno(aluno)}
          aria-label={`Ver detalhe de ${aluno.nome}`}
          className={cn(botaoDoInsight, "mt-3 border border-border text-muted-foreground hover:text-foreground")}
        >
          Ver detalhe
        </button>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
          Não foi possível salvar: {erro}
        </p>
      )}
    </li>
  );
}
