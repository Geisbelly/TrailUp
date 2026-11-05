import { cn } from "@/lib/utils";
import { contagem, quando, ultimosDias } from "./disponibilidade";
import { Numero, Secao, Tabela } from "./pecasDoPainel";
import {
  formatarMs,
  lerVital,
  METAS,
  rotuloDaSuperficie,
  rotuloDoFormato,
  rotuloDoTipo,
  type ErroDoCliente,
  type LeituraDoVital,
  type SaudeDaSuperficie,
  type SaudeDosClientes,
  type VitaisDoFormato,
} from "./saudeDosClientes";
import { useSaudeDosClientes } from "./useDisponibilidade";

const NOTA: Record<LeituraDoVital, string> = { bom: "na meta", acima: "acima da meta", amostra_pequena: "amostra pequena", sem_dado: "sem dado" };

function celula(valor: string, bruto: number | null, n: number, meta: number): string {
  return bruto === null ? "—" : `${valor} · ${NOTA[lerVital(bruto, n, meta)]} (n=${n})`;
}

function linhaDeVitais(v: VitaisDoFormato): string[] {
  return [
    rotuloDoFormato(v.formato),
    celula(formatarMs(v.lcp_p75_ms), v.lcp_p75_ms, v.lcp_n, METAS.lcp_ms),
    celula(formatarMs(v.inp_p75_ms), v.inp_p75_ms, v.inp_n, METAS.inp_ms),
    celula(v.cls_p75 === null ? "—" : v.cls_p75.toLocaleString("pt-BR"), v.cls_p75, v.cls_n, METAS.cls),
  ];
}

function CartaoDaSuperficie({ s }: { s: SaudeDaSuperficie }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="text-[13.5px] font-bold text-foreground">{rotuloDaSuperficie(s.superficie)}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo={`Sessões · ${s.pessoas} ${s.pessoas === 1 ? "pessoa" : "pessoas"}`} valor={s.sessoes} />
        <Numero rotulo="Sessões com erro" valor={contagem(s.sessoes_com_erro, s.sessoes)} destaque={s.sessoes_com_erro > 0} />
        <Numero rotulo="Sem falha crítica" valor={contagem(s.sessoes_sem_falha, s.sessoes_com_critica)} destaque={s.sessoes_sem_falha < s.sessoes_com_critica} />
        <Numero rotulo="Falhas de servidor" valor={contagem(s.falhas_servidor, s.chamadas)} destaque={s.falhas_servidor > 0} />
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Sem resposta: {contagem(s.sem_resposta, s.chamadas)}, que pode ser a rede da escola e não o sistema. Críticas recusadas: {contagem(s.criticas_falha, s.criticas)}.
        {s.superficie === "console" ? ` Fallback da API: ${s.fallback_api}.` : ""}
        {s.superficie === "app" ? ` Abertura do app, P75: ${formatarMs(s.inicio_p75_ms)} (n=${s.inicio_n}).` : ""}
      </p>
      {s.superficie !== "app" && (
        <Tabela cabecalho={["Aparelho", "LCP (P75)", "INP (P75)", "CLS (P75)"]} vazio="Nenhum Web Vital recebido nesta janela." linhas={s.vitais.map(linhaDeVitais)} />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Tabela cabecalho={["Versão", "Sessões", "Com erro"]} vazio="Sem versão registrada." linhas={s.versoes.map((v) => [v.versao, v.sessoes, v.com_erro])} />
        <Tabela cabecalho={["Destino com 5xx", "Falhas"]} vazio="Nenhum 5xx nesta janela." linhas={s.destinos.map((d) => [d.destino, d.falhas])} />
      </div>
    </article>
  );
}

function ListaDeErros({ erros }: { erros: ErroDoCliente[] }) {
  if (erros.length === 0) return <p className="text-[12.5px] text-muted-foreground">Nenhum erro recebido nesta janela.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {erros.map((e) => (
        <li key={`${e.superficie}-${e.versao}-${e.assinatura}`} className={cn("rounded-2xl border bg-card px-4 py-3", e.tipo === "tela" || e.tipo === "fatal" ? "border-[hsl(var(--warning))]" : "border-border")}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-bold text-foreground">
            <span>{e.nome ?? "Erro sem nome"}</span>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {rotuloDoTipo(e.tipo)} · {rotuloDaSuperficie(e.superficie)}
              {e.nova ? " · nova" : ""}
            </span>
          </div>
          {e.mensagem && <p className="mt-1 break-words text-[12.5px] text-foreground">{e.mensagem}</p>}
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {e.vezes} {e.vezes === 1 ? "vez" : "vezes"}, {e.pessoas} {e.pessoas === 1 ? "pessoa" : "pessoas"}. Versão {e.versao ?? "sem dado"}
            {e.rota ? `, em ${e.rota}` : ""}. Última: {quando(e.ultima_em)}.
          </p>
        </li>
      ))}
    </ul>
  );
}

function Painel({ d }: { d: SaudeDosClientes }) {
  return (
    <div className="flex flex-col gap-[22px]">
      <Secao id="cli-superficies" titulo="Por superfície">
        {d.superficies.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">Nenhuma sessão recebida nesta janela. Cliente que nunca carregou só aparece nas sondas.</p>
        ) : (
          d.superficies.map((s) => <CartaoDaSuperficie key={s.superficie} s={s} />)
        )}
      </Secao>
      <Secao id="cli-erros" titulo="Erros, por assinatura">
        <ListaDeErros erros={d.erros} />
      </Secao>
      <p className="text-[11.5px] text-muted-foreground">
        Só entra quem fez login e, no aluno, quem aceitou a coleta de desempenho. Crash nativo do app não aparece aqui. Com menos de 20 amostras, o P75 é mostrado sem julgamento.
      </p>
    </div>
  );
}

function Mensagem({ estado }: { estado: { tipo: "indisponivel" } | { tipo: "erro"; detalhe: string } }) {
  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h2 className="text-lg text-foreground">Saúde dos clientes ainda não disponível</h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[13px] leading-relaxed text-muted-foreground">O banco deste ambiente ainda não tem a migration 20261105_13.</p>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
      Não foi possível carregar a saúde dos clientes. Detalhe: {estado.detalhe}
    </div>
  );
}

/** Erros, vitais e chamadas, vistos de dentro de cada cliente. Completa as sondas, que só veem de fora. */
export default function SaudeDosClientesSection({ horas }: { horas: number }) {
  const { dados, estado } = useSaudeDosClientes(horas);
  if (estado.tipo === "indisponivel" || estado.tipo === "erro") return <Mensagem estado={estado} />;
  if (!dados) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        {[0, 1].map((i) => (
          <div key={i} className="console-skeleton h-[160px]" />
        ))}
      </div>
    );
  }
  return <Painel d={dados} />;
}

/** Acessos ao console: contagem por dia, sem nome de professor. */
export function AcessosDoConsole({ horas }: { horas: number }) {
  const { dados, estado } = useSaudeDosClientes(horas);
  if (!dados) {
    return estado.tipo === "carregando" ? null : <p className="text-[11.5px] text-muted-foreground">Acessos do console ainda não disponíveis neste banco.</p>;
  }
  const c = dados.console;
  const porDia = new Map(c.serie_30d.map((d) => [d.dia, d]));
  const teto = Math.max(c.professores, ...c.serie_30d.map((d) => d.professores), 1);
  return (
    <Secao id="ace-console" titulo="Console do professor">
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Ativos em 7 dias" valor={contagem(c.ativos_7d, c.professores)} />
        <Numero rotulo="Ativos em 30 dias" valor={contagem(c.ativos_30d, c.professores)} />
        <Numero rotulo="Sessões em 7 dias" valor={c.sessoes_7d} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex h-[90px] items-end gap-[2px]" role="img" aria-label={`Professores com acesso por dia, últimos 30 dias, de ${c.professores} cadastrados.`}>
          {ultimosDias(new Date()).map((dia) => {
            const n = porDia.get(dia)?.professores ?? 0;
            return <span key={dia} title={`${dia}: ${n} de ${c.professores}`} className="min-w-0 flex-1 rounded-t-[4px] bg-primary" style={{ height: n === 0 ? 2 : `${(100 * n) / teto}%`, opacity: n === 0 ? 0.25 : 1 }} />;
          })}
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">Conta desde a migration 20261105_13. A conta do dono entra na soma.</p>
    </Secao>
  );
}
