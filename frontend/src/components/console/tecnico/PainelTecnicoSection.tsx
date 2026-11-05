import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CircleHelp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import SegmentedPills from "../dashboard/SegmentedPills";
import {
  JANELAS,
  contarAlertas,
  formatarDuracao,
  formatarMinutos,
  formatarPercentual,
  formatarTokens,
  haQuanto,
  ordenarFormatos,
  rotuloDoEstado,
  rotuloDoFormato,
  type EstadoDoGatilho,
  type Gatilho,
  type PainelTecnico,
} from "./painelTecnico";
import DisponibilidadeSection from "./DisponibilidadeSection";
import { Numero } from "./pecasDoPainel";
import SaudeDosClientesSection from "./SaudeDosClientesSection";
import { useDisponibilidade } from "./useDisponibilidade";
import { usePainelTecnico } from "./usePainelTecnico";
import VisaoGeralSection from "./VisaoGeralSection";
import type { AbaDeDetalhe } from "./visaoGeral";

type Aba = "geral" | AbaDeDetalhe;

const ABAS: { value: AbaDeDetalhe; label: string }[] = [
  { value: "disponibilidade", label: "Disponibilidade" },
  { value: "clientes", label: "Clientes" },
  { value: "acessos", label: "Acessos" },
  { value: "geracao", label: "Geração e fila" },
];

const COR: Record<EstadoDoGatilho, string> = {
  alerta: "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/.12)]",
  ok: "border-[hsl(var(--success)/.5)] bg-[hsl(var(--success)/.08)]",
  sem_dado: "border-border bg-card",
};

function IconeDoEstado({ estado }: { estado: EstadoDoGatilho }) {
  if (estado === "alerta") return <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" aria-hidden="true" />;
  if (estado === "ok") return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden="true" />;
  return <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function CartaoDoGatilho({ g }: { g: Gatilho }) {
  return (
    <li className={cn("rounded-2xl border px-4 py-3.5", COR[g.estado])}>
      <div className="flex items-center gap-2">
        <IconeDoEstado estado={g.estado} />
        <h3 className="text-[13.5px] font-bold text-foreground">{g.titulo}</h3>
        {/* O texto repete o estado: a cor sozinha não pode ser a informação. */}
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{rotuloDoEstado(g.estado)}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{g.detalhe}</p>
    </li>
  );
}

function Fila({ p }: { p: PainelTecnico }) {
  const f = p.fila;
  return (
    <section aria-labelledby="tec-fila" className="flex flex-col gap-3">
      <h2 id="tec-fila" className="text-base font-bold text-foreground">
        Fila de personalização, agora
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Jobs esperando" valor={f.jobs_pending} />
        <Numero rotulo="Jobs em andamento" valor={f.jobs_processing} />
        <Numero rotulo="Pedido mais antigo esperando" valor={formatarMinutos(f.pending_mais_antigo_min)} destaque={(f.pending_mais_antigo_min ?? 0) > 360} />
        <Numero rotulo="Travados (+1 h em andamento)" valor={f.processing_travados} destaque={f.processing_travados > 0} />
        <Numero rotulo="Alvos esperando" valor={f.alvos_pending} />
        <Numero rotulo="Alvos em andamento" valor={f.alvos_processing} />
      </div>
    </section>
  );
}

function Formatos({ p }: { p: PainelTecnico }) {
  const formatos = ordenarFormatos(p.formatos);
  return (
    <section aria-labelledby="tec-formatos" className="flex flex-col gap-3">
      <h2 id="tec-formatos" className="text-base font-bold text-foreground">
        Erro e latência por formato
      </h2>
      {formatos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhum alvo de geração criado nesta janela.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <caption className="sr-only">Alvos de geração por formato na janela escolhida</caption>
            <thead className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Formato</th>
                <th scope="col" className="px-3 py-2.5">Alvos</th>
                <th scope="col" className="px-3 py-2.5">Concluídos</th>
                <th scope="col" className="px-3 py-2.5">Falharam</th>
                <th scope="col" className="px-3 py-2.5">Taxa de erro</th>
                <th scope="col" className="px-3 py-2.5">p95 de geração</th>
                <th scope="col" className="px-3 py-2.5">SLO</th>
                <th scope="col" className="px-3 py-2.5">Execuções por alvo</th>
              </tr>
            </thead>
            <tbody>
              {formatos.map((f) => (
                <tr key={f.formato} className="border-t border-border">
                  <th scope="row" className="px-4 py-2.5 font-semibold text-foreground">{rotuloDoFormato(f.formato)}</th>
                  <td className="px-3 py-2.5">{f.total}</td>
                  <td className="px-3 py-2.5">{f.completed}</td>
                  <td className="px-3 py-2.5">{f.failed}</td>
                  <td className="px-3 py-2.5">{formatarPercentual(f.falha_pct)}</td>
                  <td className={cn("px-3 py-2.5", f.slo_violado && "font-bold text-[hsl(var(--warning))]")}>{formatarDuracao(f.tempo_p95_seg)}</td>
                  <td className="px-3 py-2.5">
                    {f.slo_p95_seg === null ? "sem SLO" : `${formatarDuracao(f.slo_p95_seg)}${f.slo_violado ? " · acima" : f.slo_violado === false ? " · dentro" : ""}`}
                  </td>
                  <td className="px-3 py-2.5">
                    {f.execucoes_medias ?? "—"}
                    {f.execucoes_medias_anterior !== null && <span className="text-muted-foreground"> (antes: {f.execucoes_medias_anterior})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11.5px] text-muted-foreground">
        Taxa de erro = falharam ÷ (concluídos + falharam). &ldquo;Execuções por alvo&rdquo; conta quantas vezes cada alvo foi executado: reprocessar é pagar de
        novo. O custo em tokens está na seção abaixo.
      </p>
    </section>
  );
}

function CustoEmTokens({ p }: { p: PainelTecnico }) {
  const c = p.custo;
  if (!c) return null;
  return (
    <section aria-labelledby="tec-custo" className="flex flex-col gap-3">
      <h2 id="tec-custo" className="text-base font-bold text-foreground">
        Custo em tokens
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">Tokens por alvo</dt>
          <dd className="text-xl font-bold text-foreground">
            {formatarTokens(c.tokens_por_alvo)}
            {c.tokens_por_alvo_anterior !== null && (
              <span className="ml-1 text-[12px] font-normal text-muted-foreground">(antes: {formatarTokens(c.tokens_por_alvo_anterior)})</span>
            )}
          </dd>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">Alvos com tokens gravados</dt>
          <dd className="text-xl font-bold text-foreground">
            {c.alvos_medidos}
            <span className="ml-1 text-[12px] font-normal text-muted-foreground">(antes: {c.alvos_medidos_anterior})</span>
          </dd>
        </div>
      </dl>
      {c.por_modelo.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <caption className="sr-only">Uso de cada modelo na janela escolhida</caption>
            <thead className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Modelo</th>
                <th scope="col" className="px-3 py-2.5">Chamadas</th>
                <th scope="col" className="px-3 py-2.5">Tokens de entrada</th>
                <th scope="col" className="px-3 py-2.5">Tokens de saída</th>
                <th scope="col" className="px-3 py-2.5">Caracteres de voz</th>
              </tr>
            </thead>
            <tbody>
              {c.por_modelo.map((m) => (
                <tr key={m.modelo} className="border-t border-border">
                  <th scope="row" className="px-4 py-2.5 font-semibold text-foreground">{m.modelo}</th>
                  <td className="px-3 py-2.5">{m.chamadas.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2.5">{formatarTokens(m.tokens_entrada)}</td>
                  <td className="px-3 py-2.5">{formatarTokens(m.tokens_saida)}</td>
                  <td className="px-3 py-2.5">{m.caracteres > 0 ? formatarTokens(m.caracteres) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11.5px] text-muted-foreground">
        Somado entre tentativas: o que falhou também foi pago. Conta a geração de texto, áudio e apresentação; o enriquecimento do conteúdo, feito uma vez
        por job, fica de fora. Alvos anteriores à medição não têm tokens, e enquanto houver poucos alvos medidos o gatilho de custo usa execuções por alvo.
      </p>
    </section>
  );
}

function Jobs({ p }: { p: PainelTecnico }) {
  if (p.jobs.por_tipo.length === 0) return null;
  return (
    <section aria-labelledby="tec-jobs" className="flex flex-col gap-3">
      <h2 id="tec-jobs" className="text-base font-bold text-foreground">
        Jobs na janela, por tipo ({p.jobs.total})
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <caption className="sr-only">Jobs de personalização por tipo na janela escolhida</caption>
          <thead className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5">Tipo</th>
              <th scope="col" className="px-3 py-2.5">Total</th>
              <th scope="col" className="px-3 py-2.5">Concluídos</th>
              <th scope="col" className="px-3 py-2.5">Parciais</th>
              <th scope="col" className="px-3 py-2.5">Falharam</th>
              <th scope="col" className="px-3 py-2.5">p95 de latência</th>
              <th scope="col" className="px-3 py-2.5">SLO</th>
            </tr>
          </thead>
          <tbody>
            {p.jobs.por_tipo.map((t) => (
              <tr key={t.kind} className="border-t border-border">
                <th scope="row" className="px-4 py-2.5 font-semibold text-foreground">{t.kind}</th>
                <td className="px-3 py-2.5">{t.total}</td>
                <td className="px-3 py-2.5">{t.completed}</td>
                <td className="px-3 py-2.5">{t.partial}</td>
                <td className="px-3 py-2.5">{t.failed}</td>
                <td className={cn("px-3 py-2.5", t.slo_violado && "font-bold text-[hsl(var(--warning))]")}>{formatarDuracao(t.latencia_p95_seg)}</td>
                <td className="px-3 py-2.5">{t.slo_p95_seg === null ? "sem SLO" : `${formatarDuracao(t.slo_p95_seg)}${t.slo_violado ? " · acima" : t.slo_violado === false ? " · dentro" : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Invariantes({ p }: { p: PainelTecnico }) {
  if (p.invariantes.length === 0) return null;
  const agora = new Date();
  return (
    <section aria-labelledby="tec-inv" className="flex flex-col gap-3">
      <h2 id="tec-inv" className="text-base font-bold text-foreground">
        Invariantes do auditor de métricas
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {p.invariantes.map((i) => {
          const ruim = !i.ok || i.erro !== null;
          return (
            <li key={i.invariante} className={cn("rounded-xl border px-3.5 py-2.5 text-[12px]", ruim ? COR.alerta : COR.ok)}>
              <span className="font-bold text-foreground">{i.invariante}</span>
              <span className="ml-2 text-muted-foreground">
                {ruim ? (i.erro ? "erro ao rodar" : `${i.linhas} linha${i.linhas === 1 ? "" : "s"} fora da regra`) : "passou"} · {haQuanto(i.rodado_em, agora)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Atividade({ p }: { p: PainelTecnico }) {
  const agora = new Date();
  const a = p.atividade;
  return (
    <section aria-labelledby="tec-ativ" className="flex flex-col gap-3">
      <h2 id="tec-ativ" className="text-base font-bold text-foreground">
        Quando cada worker mexeu por último
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Último job iniciado" valor={haQuanto(a.ultimo_job_iniciado_em, agora)} />
        <Numero rotulo="Último lote de telemetria" valor={haQuanto(a.ultimo_lote_em, agora)} />
        <Numero rotulo="Última análise feita" valor={haQuanto(a.ultima_analise_em, agora)} />
        <Numero rotulo="Análises na fila (com erro)" valor={`${a.analise_na_fila} (${a.analise_com_erro})`} destaque={a.analise_com_erro > 0} />
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Quando cada worker mexeu por último. Um &ldquo;há dias&rdquo; aqui com jobs esperando é o sinal de que o worker parou, mesmo com a API no ar.
      </p>
    </section>
  );
}

/**
 * Painel técnico (#21): a fila, o erro e a latência por formato e os quatro gatilhos do §11, só para o dono do projeto.
 * O alerta também vai ao sino do dono (`fn_painel_tecnico_avisar_dono`, 20261102_23), sem ele precisar abrir a aba. Cada gatilho diz o motivo, e o que não foi medido aparece como "sem dado", nunca
 * como "dentro do esperado".
 */
export default function PainelTecnicoSection() {
  const [horas, setHoras] = useState(168);
  const [aba, setAba] = useState<Aba>("geral");
  const [alertasPorAba, setAlertasPorAba] = useState<Partial<Record<AbaDeDetalhe, number>>>({});
  const { painel, estado, desatualizado } = usePainelTecnico(horas);
  // Aqui em cima porque a visão geral e as duas abas de detalhe leem o mesmo dado: sem isso, seriam duas consultas por minuto.
  const disponibilidade = useDisponibilidade(horas);

  if (estado.tipo === "sem_permissao") {
    return (
      <div role="alert" className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h2 className="text-lg text-foreground">Só o dono do projeto vê este painel</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">Esta conta não tem acesso ao painel técnico.</p>
      </div>
    );
  }
  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h2 className="text-lg text-foreground">Painel técnico ainda não disponível</h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[13px] leading-relaxed text-muted-foreground">
          O banco deste ambiente ainda não tem a função do painel (migration 20261102_22). Assim que for aplicada, ele aparece aqui.
        </p>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar o painel técnico. Detalhe: {estado.detalhe}
      </div>
    );
  }
  if (estado.tipo === "carregando" || !painel) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="console-skeleton h-[62px]" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[110px]" />
        ))}
      </div>
    );
  }

  const alertas = contarAlertas(painel.gatilhos);
  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <Activity className="h-6 w-6 text-[hsl(var(--console-violet-text))]" aria-hidden="true" />
            Painel técnico
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
            Medido pelo banco e atualizado a cada minuto. Quando algo cai ou um gatilho dispara, o aviso chega por e-mail e ao sino do console. Só o dono do projeto vê esta aba.
          </p>
        </div>
        <SegmentedPills ariaLabel="Janela de tempo" opcoes={JANELAS.map((j) => ({ value: String(j.horas), label: j.rotulo }))} valor={String(horas)} onChange={(v) => setHoras(Number(v))} />
      </header>

      {desatualizado && (
        <p role="status" className="flex items-center gap-2 rounded-[14px] border border-border px-4 py-3 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Não consegui atualizar agora. O que aparece é de {haQuanto(painel.gerado_em, new Date())}.
        </p>
      )}

      <SegmentedPills<Aba>
        ariaLabel="O que ver"
        className="self-start"
        opcoes={[{ value: "geral" as Aba, label: "Visão geral" }, ...ABAS.map((a) => ({ value: a.value as Aba, label: alertasPorAba[a.value] ? `${a.label} (${alertasPorAba[a.value]})` : a.label }))]}
        valor={aba}
        onChange={setAba}
      />

      {aba === "geral" ? (
        <VisaoGeralSection painel={painel} horas={horas} disponibilidade={disponibilidade} onAbrir={setAba} onContagem={setAlertasPorAba} />
      ) : aba === "clientes" ? (
        <SaudeDosClientesSection horas={horas} />
      ) : aba !== "geracao" ? (
        <DisponibilidadeSection horas={horas} aba={aba} dados={disponibilidade.dados} estado={disponibilidade.estado} />
      ) : (
        <>
      <section aria-labelledby="tec-gatilhos" className="flex flex-col gap-3">
        <h2 id="tec-gatilhos" className="text-base font-bold text-foreground">
          Gatilhos de revisão arquitetural (§11){" "}
          <span className={cn("text-[13px] font-semibold", alertas > 0 ? "text-[hsl(var(--warning))]" : "text-muted-foreground")}>
            {alertas === 0 ? "· nenhum em alerta" : `· ${alertas} em alerta`}
          </span>
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {painel.gatilhos.map((g) => (
            <CartaoDoGatilho key={g.id} g={g} />
          ))}
        </ul>
      </section>

      <Fila p={painel} />
      <Formatos p={painel} />
      <CustoEmTokens p={painel} />
      <Jobs p={painel} />
      <Invariantes p={painel} />
      <Atividade p={painel} />
        </>
      )}
    </div>
  );
}
