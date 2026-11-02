import { AlertTriangle } from "lucide-react";
import { TEXTO_DO_ESTADO } from "./disponibilidade";
import {
  comProblema,
  duracao,
  inicioDaSequenciaDeFalhas,
  percentual,
  rotuloDoBalde,
  rotuloDoFormato,
  rotuloDoTipo,
  textoDoGatilho,
} from "./kpisOperacionais";
import type { EstadoDosKpisOperacionais } from "./useKpisOperacionais";

const TH = "px-3 py-2 font-semibold";
const TD = "px-3 py-2.5 text-foreground";

/** p95 com a meta ao lado; acima da meta vai com ícone e texto, nunca só por cor. */
function P95ComMeta({ p95, meta, violado }: { p95: number | null; meta: number | null; violado: boolean | null }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${violado ? "font-bold" : ""}`}>
      {violado && <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden="true" />}
      {duracao(p95)}
      <span className="font-normal text-muted-foreground">
        {meta === null ? "" : ` / meta ${duracao(meta)}`}
        {violado ? " (acima)" : ""}
      </span>
    </span>
  );
}

/**
 * KPIs operacionais da fila de personalização (#14): quantos pedidos de geração a turma teve na
 * janela, quanto demoraram até terminar, onde falham e quanto precisou ser refeito, com a meta (SLO)
 * ao lado e os sinais de alerta do cap. 10 do TCC (§11) já decididos pelo banco.
 */
export default function FilaDePersonalizacao({
  turmaUnica,
  estado,
}: {
  /** null quando o escopo é "todas as turmas": a RPC é por turma. */
  turmaUnica: number | null;
  estado: EstadoDosKpisOperacionais;
}) {
  const { kpis, carregando, erro } = estado;
  const alertas = kpis?.gatilhos.filter((g) => g.ativo) ?? [];
  const desdeQuando = kpis ? inicioDaSequenciaDeFalhas(kpis.serie) : null;
  const baldesComJob = kpis ? kpis.serie.filter((b) => b.total > 0).reverse().slice(0, 14) : [];
  const semTempoPorFormato = kpis ? kpis.por_formato.every((f) => f.geracoes_medidas === 0) : false;

  return (
    <section aria-labelledby="fila-de-personalizacao" className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
      <h3 id="fila-de-personalizacao" className="text-lg text-foreground">Fila de personalização</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Pedidos de geração criados na janela escolhida no topo: quanto demoraram para terminar, onde falharam e quanto
        precisou ser refeito. O tempo conta de quando o pedido entrou na fila até terminar; pedido ainda aberto fica fora
        da média.
      </p>

      {turmaUnica === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Escolha uma turma no topo para ver a fila de personalização.</p>
      ) : carregando ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : erro || !kpis ? (
        <p className="mt-4 text-sm text-muted-foreground" role="alert">
          {TEXTO_DO_ESTADO.erro}
        </p>
      ) : kpis.jobs.total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum pedido de geração nesta turma na janela escolhida.</p>
      ) : (
        <>
          {alertas.length > 0 ? (
            <ul className="mt-4 space-y-1.5" aria-label="Sinais de alerta">
              {alertas.map((g) => (
                <li key={g.chave} className="flex items-start gap-2 text-sm font-semibold text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                  {textoDoGatilho(g)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-semibold text-foreground">Nenhum sinal de alerta na janela.</p>
          )}
          {desdeQuando && (
            <p className="mt-1.5 text-sm text-foreground">
              Falhas seguidas desde {rotuloDoBalde(desdeQuando.inicio, kpis.granularidade)}.
            </p>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="text-xs text-muted-foreground">Pedidos</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{kpis.jobs.total}</dd>
              <dd className="text-xs text-muted-foreground">
                {kpis.jobs.por_status.completed} concluídos · {comProblema(kpis.jobs.por_status)} com falha ·{" "}
                {kpis.jobs.em_aberto} abertos
              </dd>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="text-xs text-muted-foreground">Tempo até terminar</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{duracao(kpis.jobs.latencia_media_seg)}</dd>
              <dd className="text-xs text-muted-foreground">
                média de {kpis.jobs.terminados} terminados · 95% em até {duracao(kpis.jobs.latencia_p95_seg)}
              </dd>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="text-xs text-muted-foreground">Espera na fila</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{duracao(kpis.jobs.espera_media_seg)}</dd>
              <dd className="text-xs text-muted-foreground">
                {kpis.jobs.pedidos_de_reprocessamento} {kpis.jobs.pedidos_de_reprocessamento === 1 ? "pedido" : "pedidos"} de
                reprocessamento
              </dd>
            </div>
          </dl>

          <h4 className="mt-5 text-sm font-semibold text-foreground">Por tipo de pedido</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className={TH}>Tipo</th>
                  <th scope="col" className={TH}>Pedidos</th>
                  <th scope="col" className={TH}>Concluídos</th>
                  <th scope="col" className={TH}>Com falha</th>
                  <th scope="col" className={TH}>Abertos</th>
                  <th scope="col" className={TH}>Tempo médio</th>
                  <th scope="col" className={TH}>95% em até</th>
                </tr>
              </thead>
              <tbody>
                {kpis.por_tipo.map((t) => (
                  <tr key={t.kind} className="border-t border-border">
                    <th scope="row" className={`${TD} font-semibold`}>{rotuloDoTipo(t.kind)}</th>
                    <td className={TD}>{t.total}</td>
                    <td className={TD}>{t.por_status.completed}</td>
                    <td className={`${TD} ${comProblema(t.por_status) > 0 ? "font-bold" : ""}`}>{comProblema(t.por_status)}</td>
                    <td className={TD}>{t.em_aberto}</td>
                    <td className={TD}>{duracao(t.latencia_media_seg)}</td>
                    <td className={TD}>
                      <P95ComMeta p95={t.latencia_p95_seg} meta={t.slo_latencia_p95_seg} violado={t.slo_violado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mt-5 text-sm font-semibold text-foreground">Por formato</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className={TH}>Formato</th>
                  <th scope="col" className={TH}>Partes</th>
                  <th scope="col" className={TH}>Prontas</th>
                  <th scope="col" className={TH}>Falharam</th>
                  <th scope="col" className={TH}>Na fila</th>
                  <th scope="col" className={TH}>Geração (95% em até)</th>
                  <th scope="col" className={TH}>Refeitas</th>
                </tr>
              </thead>
              <tbody>
                {kpis.por_formato.map((f) => (
                  <tr key={f.formato} className="border-t border-border">
                    <th scope="row" className={`${TD} font-semibold`}>{rotuloDoFormato(f.formato)}</th>
                    <td className={TD}>{f.total}</td>
                    <td className={TD}>{f.por_status.completed}</td>
                    <td className={`${TD} ${f.por_status.failed > 0 ? "font-bold" : ""}`}>{f.por_status.failed}</td>
                    <td className={TD}>{f.por_status.pending + f.por_status.processing}</td>
                    <td className={TD}>
                      <P95ComMeta p95={f.tempo_geracao_p95_seg} meta={f.slo_geracao_p95_seg} violado={f.slo_violado} />
                    </td>
                    <td className={TD}>
                      {f.taxa_reprocessamento_pct === null
                        ? "—"
                        : `${percentual(f.taxa_reprocessamento_pct)} (${f.reprocessados} de ${f.base_reprocessamento})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {semTempoPorFormato && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              O tempo de geração por formato só é medido nos pedidos feitos depois desta atualização; os anteriores ficam
              sem tempo.
            </p>
          )}

          <h4 className="mt-5 text-sm font-semibold text-foreground">Ao longo da janela</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left text-[13.5px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className={TH}>Período</th>
                  <th scope="col" className={TH}>Pedidos</th>
                  <th scope="col" className={TH}>Com falha</th>
                  <th scope="col" className={TH}>Abertos</th>
                  <th scope="col" className={TH}>Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {baldesComJob.map((b) => (
                  <tr key={b.inicio} className="border-t border-border">
                    <th scope="row" className={`${TD} font-semibold`}>{rotuloDoBalde(b.inicio, kpis.granularidade)}</th>
                    <td className={TD}>{b.total}</td>
                    <td className={`${TD} ${comProblema(b) > 0 ? "font-bold" : ""}`}>
                      {comProblema(b) > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {comProblema(b)}
                        </span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className={TD}>{b.pending + b.processing}</td>
                    <td className={TD}>{duracao(b.latencia_media_seg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Só os períodos com pedido, do mais recente para o mais antigo. O status é o de agora dos pedidos criados em cada
            período.
          </p>
        </>
      )}
    </section>
  );
}
