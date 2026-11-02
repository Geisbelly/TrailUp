import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  caminhoDaNotificacao,
  naoLida,
  rotuloDaContagem,
  rotuloDoSelo,
  tempoRelativo,
  type NotificacaoDoProfessor,
} from "./notificacoesProfessor";
import { useNotificacoesDoProfessor } from "./useNotificacoesDoProfessor";

function ItemDaNotificacao({ n, agora, onAbrir }: { n: NotificacaoDoProfessor; agora: Date; onAbrir: (n: NotificacaoDoProfessor) => void }) {
  const lida = !naoLida(n);
  const repeticoes = rotuloDaContagem(n.contagem);
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(n)}
        className={cn(
          "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
          !lida && "bg-[hsl(var(--console-violet)/.08)]",
        )}
      >
        <span className="flex items-center gap-2">
          {!lida && <span className="h-2 w-2 flex-none rounded-full bg-[hsl(var(--console-violet-text))]" aria-label="Não lida" />}
          <span className={cn("text-[13px] leading-snug text-foreground", !lida ? "font-bold" : "font-medium")}>{n.titulo}</span>
        </span>
        {n.corpo && <span className="text-[12px] leading-snug text-muted-foreground">{n.corpo}</span>}
        <span className="text-[11px] text-muted-foreground">
          {tempoRelativo(n.atualizado_em, agora)}
          {repeticoes ? ` · ${repeticoes}` : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * Sino do cabeçalho do console: o que pede a atenção do professor, avisado pelo banco. Clicar leva à
 * aba que resolve o assunto e marca como lida. Some quando a tabela ainda não existe no banco.
 */
export default function SinoDeNotificacoes() {
  const navigate = useNavigate();
  const { lista, naoLidas, disponivel, carregando, marcarComoLida, marcarTodasComoLidas } = useNotificacoesDoProfessor();
  const [aberto, setAberto] = useState(false);
  if (!disponivel) return null;

  const selo = rotuloDoSelo(naoLidas);
  const agora = new Date();

  const abrir = (n: NotificacaoDoProfessor) => {
    setAberto(false);
    navigate(caminhoDaNotificacao(n));
    marcarComoLida(n.id).catch(() => toast.error("Não foi possível marcar como lida."));
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="console-icon-button relative"
          aria-label={selo ? `Notificações, ${naoLidas} não lida${naoLidas === 1 ? "" : "s"}` : "Notificações"}
          title="Notificações"
        >
          <Bell size={18} />
          {selo && (
            <span className="console-bell-badge" aria-hidden="true">
              {selo}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">Notificações</h2>
          <button
            type="button"
            disabled={naoLidas === 0}
            onClick={() => marcarTodasComoLidas().catch(() => toast.error("Não foi possível marcar como lidas."))}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Marcar todas como lidas
          </button>
        </div>
        {carregando ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 p-4">
            <div className="console-skeleton h-[52px]" />
            <div className="console-skeleton h-[52px]" />
          </div>
        ) : lista.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nada por aqui. Avisamos quando chegar uma entrega para avaliar, uma recomendação da IA, uma falha de geração ou um evento encerrado.
          </p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto" aria-label="Notificações">
            {lista.map((n) => (
              <ItemDaNotificacao key={n.id} n={n} agora={agora} onAbrir={abrir} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
