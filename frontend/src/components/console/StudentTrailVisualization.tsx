import { Check, ChevronRight, Gift, Lock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { chaveDoPerfil, COR_DO_PERFIL, corDoIconeSobre } from "./dashboard/perfilCores";
import { PerfilChip } from "./dashboard/PerfilVisual";

interface TopicoStatus {
  id: number;
  nome: string;
  status: "concluido" | "disponivel" | "bloqueado";
  percentual: number;
}

interface StudentTrailVisualizationProps {
  studentName: string;
  classeName: string;
  topicos: TopicoStatus[];
  perfilDominante: string;
  viewMode?: "hexagon" | "list";
}

type Cores = { marca: string; texto: string; icone: string };

const HEXAGONO = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const ROTULO_DO_STATUS: Record<TopicoStatus["status"], string> = {
  concluido: "Concluído",
  disponivel: "Disponível",
  bloqueado: "Bloqueado",
};

function IconeDoStatus({ status, className, color }: { status: TopicoStatus["status"]; className: string; color: string }) {
  const Icone = status === "concluido" ? Check : status === "disponivel" ? Star : Lock;
  return <Icone className={className} style={{ color }} aria-hidden="true" />;
}

function corDoRotulo(status: TopicoStatus["status"], cores: Cores) {
  if (status === "concluido") return "hsl(var(--success))";
  if (status === "disponivel") return cores.texto;
  return "hsl(var(--muted-foreground))";
}

function HexagonNode({ topico, cores, isLast }: { topico: TopicoStatus; cores: Cores; isLast: boolean }) {
  const bloqueado = topico.status === "bloqueado";
  const concluido = topico.status === "concluido";
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn("flex h-24 w-24 items-center justify-center", bloqueado && "opacity-60")}
        style={{
          clipPath: HEXAGONO,
          background: bloqueado ? "hsl(var(--muted))" : concluido ? cores.marca : `${cores.marca}33`,
        }}
      >
        {/* Ícone pede 3:1: sobre a marca sólida decide pela luminância; nos
            outros casos o fundo é escuro e a variante de texto passa. */}
        <IconeDoStatus
          status={topico.status}
          className="h-8 w-8"
          color={bloqueado ? "hsl(var(--muted-foreground))" : concluido ? cores.icone : cores.texto}
        />
      </div>
      <div
        className={cn(
          "mt-2 max-w-[160px] rounded-full px-4 py-1.5 text-center text-sm font-semibold",
          bloqueado && "bg-muted text-muted-foreground",
        )}
        style={bloqueado ? undefined : { background: `${cores.marca}22`, color: cores.texto }}
      >
        {topico.nome}
      </div>
      <span className="mt-1 text-xs font-semibold" style={{ color: corDoRotulo(topico.status, cores) }}>
        {ROTULO_DO_STATUS[topico.status]}
      </span>
      {!isLast && (
        <div aria-hidden="true" className="mt-2 flex flex-col items-center">
          <div className="h-6 w-0.5" style={{ background: bloqueado ? "hsl(var(--border))" : cores.marca }} />
          <div className="h-2 w-2 rounded-full" style={{ background: bloqueado ? "hsl(var(--border))" : cores.marca }} />
        </div>
      )}
    </div>
  );
}

function ListNode({ topico, cores }: { topico: TopicoStatus; cores: Cores }) {
  const bloqueado = topico.status === "bloqueado";
  const Icone = topico.status === "concluido" ? Check : topico.status === "disponivel" ? Gift : Lock;
  return (
    <div
      className={cn("flex items-center gap-4 rounded-2xl border p-4", bloqueado ? "border-border bg-muted/40" : "bg-muted")}
      style={bloqueado ? undefined : { borderColor: cores.marca }}
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center"
        style={{ clipPath: HEXAGONO, background: bloqueado ? "hsl(var(--border))" : cores.marca }}
      >
        <Icone className="h-5 w-5" aria-hidden="true" style={{ color: bloqueado ? "hsl(var(--muted-foreground))" : cores.icone }} />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className={cn("truncate font-sans text-base font-semibold", bloqueado ? "text-muted-foreground" : "text-foreground")}>
          {topico.nome}
        </h4>
        <p className="text-sm font-semibold" style={{ color: corDoRotulo(topico.status, cores) }}>
          {ROTULO_DO_STATUS[topico.status]}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export default function StudentTrailVisualization({
  studentName,
  classeName,
  topicos,
  perfilDominante,
  viewMode = "hexagon",
}: StudentTrailVisualizationProps) {
  const chave = chaveDoPerfil(perfilDominante) ?? "mastermind";
  const { marca, texto } = COR_DO_PERFIL[chave];
  const cores: Cores = { marca, texto, icone: corDoIconeSobre(marca) };

  return (
    <div className="rounded-[20px] border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[26px] py-5">
        <div className="min-w-0">
          <div className="console-label">Trilha</div>
          <h3 className="mt-1 truncate text-xl text-foreground">{classeName}</h3>
        </div>
        <PerfilChip perfil={perfilDominante} />
      </div>
      <div className="p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Visualizando trilha de <strong className="text-foreground">{studentName}</strong>
        </p>
        {topicos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum tópico registrado para este aluno nesta turma.</p>
        ) : viewMode === "hexagon" ? (
          <div className="flex flex-col items-center gap-2 py-6">
            {topicos.map((topico, index) => (
              <HexagonNode key={topico.id} topico={topico} cores={cores} isLast={index === topicos.length - 1} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {topicos.map((topico) => (
              <ListNode key={topico.id} topico={topico} cores={cores} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
