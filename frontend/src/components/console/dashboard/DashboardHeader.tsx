import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarAtualizadoHa } from "./atualizadoHa";
import SegmentedPills from "./SegmentedPills";

export type JanelaTemporal = "7d" | "30d" | "mes_atual" | "tudo";

const JANELAS: { value: JanelaTemporal; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes_atual", label: "Este mês" },
  { value: "tudo", label: "Todo o período" },
];

const contagem = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

function useAgora(intervaloMs: number) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

export default function DashboardHeader({
  classes,
  turmaSelecionada,
  onTurmaChange,
  totalAlunos,
  janela,
  onJanelaChange,
  ultimaCarga,
}: {
  classes: { id: number; descricao: string | null }[];
  turmaSelecionada: string;
  onTurmaChange: (value: string) => void;
  totalAlunos: number;
  janela: JanelaTemporal;
  onJanelaChange: (value: JanelaTemporal) => void;
  ultimaCarga: Date | null;
}) {
  const agora = useAgora(60_000);
  const todas = turmaSelecionada === "all";
  const resumo = todas
    ? `${contagem(classes.length, "turma", "turmas")} · ${contagem(totalAlunos, "aluno", "alunos")}`
    : contagem(totalAlunos, "aluno", "alunos");

  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <div className="console-eyebrow mb-2.5">Turma selecionada</div>
        <Select value={turmaSelecionada} onValueChange={onTurmaChange}>
          <SelectTrigger
            aria-label="Turma selecionada"
            className="h-auto w-fit max-w-full gap-3.5 rounded-2xl border-border bg-card py-2.5 pl-3.5 pr-4 text-left [&>span]:line-clamp-none"
          >
            <LayoutGrid className="h-[18px] w-[18px] shrink-0 text-[hsl(var(--console-violet-text))]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl font-bold leading-tight text-foreground">
                <SelectValue />
              </span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{resumo}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as turmas</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.descricao || "Turma sem nome"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* So a UI por enquanto — nao filtra nada ainda. Os KPIs agregados (turma,
            perfil, distribuicao) vem de views que nao tem coluna de data por
            evento, entao janela temporal real depende do endpoint de KPIs da #12. */}
        <SegmentedPills ariaLabel="Janela temporal" opcoes={JANELAS} valor={janela} onChange={onJanelaChange} />
        {ultimaCarga && <span className="text-xs text-muted-foreground">{formatarAtualizadoHa(ultimaCarga, agora)}</span>}
      </div>
    </div>
  );
}
