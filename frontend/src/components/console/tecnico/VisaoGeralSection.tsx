import { useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { contagem, formatarDisponibilidade, rotuloDoAlvo, type Alvo, type EstadoDoAlvo } from "./disponibilidade";
import { FaixaDe30Dias } from "./DisponibilidadeSection";
import { formatarMinutos, haQuanto, type PainelTecnico } from "./painelTecnico";
import { Secao } from "./pecasDoPainel";
import { useSaudeDosClientes, type useDisponibilidade } from "./useDisponibilidade";
import { dadoVelho, montarVisaoGeral, totaisDosClientes, type AbaDeDetalhe, type NivelDaPendencia, type Pendencia, type Veredito } from "./visaoGeral";

const ROTULO_DA_ABA: Record<AbaDeDetalhe, string> = { disponibilidade: "Disponibilidade", clientes: "Clientes", acessos: "Acessos", geracao: "Geração e fila" };

const VEREDITO: Record<Veredito, { caixa: string; icone: JSX.Element }> = {
  fora_do_ar: { caixa: "border-destructive bg-destructive/15", icone: <XOctagon className="h-6 w-6 text-[hsl(var(--destructive))]" aria-hidden="true" /> },
  atencao: { caixa: "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/.12)]", icone: <AlertTriangle className="h-6 w-6 text-[hsl(var(--warning))]" aria-hidden="true" /> },
  sem_certeza: { caixa: "border-border bg-card", icone: <CircleHelp className="h-6 w-6 text-muted-foreground" aria-hidden="true" /> },
  ok: { caixa: "border-[hsl(var(--success)/.5)] bg-[hsl(var(--success)/.08)]", icone: <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" aria-hidden="true" /> },
};

// O texto repete o nível: a cor sozinha não pode ser a informação.
const NIVEL: Record<NivelDaPendencia, { rotulo: string; texto: string }> = {
  critico: { rotulo: "Grave", texto: "text-[hsl(var(--destructive))]" },
  atencao: { rotulo: "Atenção", texto: "text-[hsl(var(--console-warning-text))]" },
  lacuna: { rotulo: "Sem dado", texto: "text-muted-foreground" },
};

function LinhaDaPendencia({ p, onAbrir }: { p: Pendencia; onAbrir: (aba: AbaDeDetalhe) => void }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button type="button" onClick={() => onAbrir(p.aba)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className={cn("w-[62px] flex-none text-[11.5px] font-bold", NIVEL[p.nivel].texto)}>{NIVEL[p.nivel].rotulo}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-foreground">{p.titulo}</span>
          <span className="block text-[12px] leading-snug text-muted-foreground">{p.detalhe}</span>
        </span>
        <span className="hidden flex-none text-[11.5px] text-muted-foreground sm:inline">{ROTULO_DA_ABA[p.aba]}</span>
        <ChevronRight className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

const ICONE_DO_ALVO: Record<EstadoDoAlvo, JSX.Element> = {
  queda: <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" aria-hidden="true" />,
  ok: <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />,
  sem_dado: <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />,
};

function ServicoResumido({ a, onAbrir }: { a: Alvo; onAbrir: () => void }) {
  return (
    <li>
      <button type="button" onClick={onAbrir} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-[hsl(var(--console-violet)/.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          {ICONE_DO_ALVO[a.estado]}
          <span className="min-w-0 truncate text-[13px] font-bold text-foreground">{a.nome}</span>
          <span className="ml-auto flex-none text-[11px] font-semibold text-muted-foreground">{rotuloDoAlvo(a.estado)}</span>
        </span>
        <FaixaDe30Dias a={a} />
        <span className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11.5px] text-muted-foreground">
          <span>
            <strong className="font-semibold tabular-nums text-foreground">{formatarDisponibilidade(a.disponibilidade_pct)}</strong> na janela
          </span>
          <span>p95 {a.latencia_p95_ms ?? "—"} ms</span>
        </span>
      </button>
    </li>
  );
}

/** Um número que leva ao detalhe. Sem amostra, mostra traço. */
function Sinal({ rotulo, valor, nota, destaque = false, onAbrir }: { rotulo: string; valor: string | number; nota?: string; destaque?: boolean; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-[hsl(var(--console-violet)/.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{rotulo}</span>
      <span className={cn("mt-1 block text-xl font-bold tabular-nums", destaque ? "text-[hsl(var(--console-warning-text))]" : "text-foreground")}>{valor}</span>
      {nota && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{nota}</span>}
    </button>
  );
}

/**
 * A abertura do painel: está tudo bem? Se não, o que está quebrado e onde ver. Só junta o que o banco já
 * mediu e julgou; cada item leva à aba com o detalhe.
 */
export default function VisaoGeralSection({
  painel,
  horas,
  disponibilidade,
  onAbrir,
  onContagem,
}: {
  painel: PainelTecnico;
  horas: number;
  disponibilidade: ReturnType<typeof useDisponibilidade>;
  onAbrir: (aba: AbaDeDetalhe) => void;
  onContagem: (porAba: Record<AbaDeDetalhe, number>) => void;
}) {
  const clientes = useSaudeDosClientes(horas);
  const d = disponibilidade.dados;
  const c = clientes.dados;
  const agora = new Date();
  const visao = useMemo(
    () =>
      montarVisaoGeral({
        painel,
        disponibilidade: d,
        clientes: c,
        disponibilidadeLida: disponibilidade.estado.tipo !== "carregando",
        clientesLidos: clientes.estado.tipo !== "carregando",
        agora: new Date(),
      }),
    [painel, d, c, disponibilidade.estado.tipo, clientes.estado.tipo],
  );
  useEffect(() => onContagem(visao.porAba), [visao.porAba, onContagem]);

  const { caixa, icone } = VEREDITO[visao.veredito];
  const velho = painel.gerado_em ? dadoVelho(painel.gerado_em, agora) : false;
  const totais = c ? totaisDosClientes(c) : null;
  const f = painel.fila;

  return (
    <div className="flex flex-col gap-[22px]">
      <section aria-labelledby="geral-estado" className={cn("flex flex-wrap items-center gap-3.5 rounded-[20px] border px-5 py-4", caixa)}>
        {icone}
        <div className="min-w-0 flex-1">
          <h2 id="geral-estado" className="text-lg font-bold text-foreground">{visao.titulo}</h2>
          <p role="status" className={cn("text-[12.5px]", velho ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {painel.gerado_em ? `Atualizado ${haQuanto(painel.gerado_em, agora)}.` : "Horário da leitura desconhecido."}
          </p>
        </div>
      </section>

      {visao.pendencias.length > 0 && (
        <Secao id="geral-pendencias" titulo="O que pede atenção">
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {visao.pendencias.map((p) => (
              <LinhaDaPendencia key={p.id} p={p} onAbrir={onAbrir} />
            ))}
          </ul>
        </Secao>
      )}

      {d && d.alvos.length > 0 && (
        <Secao id="geral-servicos" titulo="Serviços">
          <ul className="grid gap-3 md:grid-cols-3">
            {d.alvos.map((a) => (
              <ServicoResumido key={a.id} a={a} onAbrir={() => onAbrir("disponibilidade")} />
            ))}
          </ul>
        </Secao>
      )}

      <Secao id="geral-sinais" titulo="Sinais principais">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Sinal rotulo="Fila esperando" valor={f.jobs_pending} nota={f.pending_mais_antigo_min === null ? "nenhum pedido antigo" : `o mais antigo há ${formatarMinutos(f.pending_mais_antigo_min)}`} onAbrir={() => onAbrir("geracao")} />
          <Sinal rotulo="Jobs travados" valor={f.processing_travados} nota="mais de 1 h em andamento" destaque={f.processing_travados > 0} onAbrir={() => onAbrir("geracao")} />
          <Sinal rotulo="Sessões com erro" valor={totais ? contagem(totais.comErro, totais.sessoes) : "—"} nota="app, web e console" onAbrir={() => onAbrir("clientes")} />
          <Sinal rotulo="Chamadas ao modelo com erro" valor={d ? contagem(d.ia.erros, d.ia.chamadas) : "—"} onAbrir={() => onAbrir("disponibilidade")} />
          <Sinal rotulo="Espaço do banco" valor={d?.banco.tamanho_mb == null ? "—" : `${d.banco.tamanho_mb} MB`} nota={d?.banco.limite_mb == null ? undefined : `de ${d.banco.limite_mb} MB`} onAbrir={() => onAbrir("disponibilidade")} />
          <Sinal rotulo="Conexões do banco" valor={d?.banco.conexoes ?? "—"} nota={d?.banco.conexoes_max == null ? undefined : `de ${d.banco.conexoes_max}`} onAbrir={() => onAbrir("disponibilidade")} />
          <Sinal rotulo="Alunos ativos hoje" valor={d ? contagem(d.acessos.ativos_hoje, d.acessos.matriculados) : "—"} nota={d ? `${d.acessos.ativos_7d} em 7 dias` : undefined} onAbrir={() => onAbrir("acessos")} />
          <Sinal rotulo="Último lote de telemetria" valor={haQuanto(painel.atividade.ultimo_lote_em, agora)} onAbrir={() => onAbrir("geracao")} />
        </div>
      </Secao>
    </div>
  );
}
