import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import SegmentedPills from "../dashboard/SegmentedPills";
import {
  contagem,
  quando,
  estadoDoDia,
  formatarDisponibilidade,
  orcamentoGastoPct,
  rotuloDaAula,
  rotuloDaOrigem,
  rotuloDoAlvo,
  rotuloDoIncidente,
  ultimosDias,
  type Alvo,
  type DiaDeAcesso,
  type Disponibilidade,
  type EstadoDoAlvo,
} from "./disponibilidade";
import { formatarMinutos, formatarTokens, haQuanto } from "./painelTecnico";
import { Numero, Secao, Tabela } from "./pecasDoPainel";
import { AcessosDoConsole } from "./SaudeDosClientesSection";
import { useAcessosDosAlunos, useDisponibilidade } from "./useDisponibilidade";

const COR_DO_ALVO: Record<EstadoDoAlvo, string> = {
  queda: "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/.12)]",
  ok: "border-[hsl(var(--success)/.5)] bg-[hsl(var(--success)/.08)]",
  sem_dado: "border-border bg-card",
};

const COR_DO_DIA = { bom: "bg-[hsl(var(--success))]", falhou: "bg-[hsl(var(--warning))]", sem_dado: "bg-muted" } as const;

function IconeDoAlvo({ estado }: { estado: EstadoDoAlvo }) {
  if (estado === "queda") return <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" aria-hidden="true" />;
  if (estado === "ok") return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden="true" />;
  return <CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

const diaCurto = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

/** Uma faixa por dia. A cor nunca está sozinha: cada dia diz o número no `title` e o total vem em texto ao lado. */
function FaixaDe30Dias({ a }: { a: Alvo }) {
  const porDia = new Map(a.serie_30d.map((d) => [d.dia, d]));
  return (
    <div className="mt-3 flex gap-[2px]" role="img" aria-label={`Últimos 30 dias de ${a.nome}: ${contagem(a.serie_30d.filter((d) => estadoDoDia(d) === "falhou").length, a.serie_30d.length)} dias medidos com falha.`}>
      {ultimosDias(new Date()).map((dia) => {
        const d = porDia.get(dia);
        const estado = estadoDoDia(d);
        return (
          <span
            key={dia}
            title={d && d.medidas > 0 ? `${diaCurto(dia)}: ${d.boas} de ${d.medidas} sondas boas` : `${diaCurto(dia)}: sem dado`}
            className={cn("h-6 min-w-0 flex-1 rounded-[3px]", COR_DO_DIA[estado])}
          />
        );
      })}
    </div>
  );
}

function CartaoDoAlvo({ a }: { a: Alvo }) {
  const gasto = orcamentoGastoPct(a);
  return (
    <li className={cn("rounded-2xl border px-4 py-3.5", COR_DO_ALVO[a.estado])}>
      <div className="flex items-center gap-2">
        <IconeDoAlvo estado={a.estado} />
        <h3 className="text-[13.5px] font-bold text-foreground">{a.nome}</h3>
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{rotuloDoAlvo(a.estado)}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
        Na janela: {formatarDisponibilidade(a.disponibilidade_pct)} ({contagem(a.boas, a.medidas)} sondas). Tempo até responder: p50 {a.latencia_p50_ms ?? "—"} ms, p95 {a.latencia_p95_ms ?? "—"} ms.
      </p>
      <FaixaDe30Dias a={a} />
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
        Em aula: {formatarDisponibilidade(a.disponibilidade_aula_pct)} (meta {a.slo_pct === null ? "—" : `${a.slo_pct.toLocaleString("pt-BR")}%`}). Fora do ar em aula: {formatarMinutos(a.minutos_fora_aula)} de {formatarMinutos(a.orcamento_aula_min)} permitidos{gasto === null ? "" : ` (${gasto}% do orçamento)`}. Aula medida: {a.cobertura_aula_pct === null ? "—" : `${a.cobertura_aula_pct.toLocaleString("pt-BR")}%`}.
      </p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Todo horário, 30 dias: {formatarDisponibilidade(a.disponibilidade_30d_pct)} (informativo).</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Última sonda {haQuanto(a.ultima_sonda_em, new Date())}{a.versao ? `. Versão ${a.versao}` : ""}.
      </p>
    </li>
  );
}

function PainelDeDisponibilidade({ d }: { d: Disponibilidade }) {
  const { cliente, ia, banco, alertas, resumo } = d;
  return (
    <div className="flex flex-col gap-[22px]">
      <Secao id="disp-alvos" titulo="Serviços, agora">
        <ul className="grid gap-3 md:grid-cols-3">
          {d.alvos.map((a) => (
            <CartaoDoAlvo key={a.id} a={a} />
          ))}
        </ul>
        <p className="text-[11.5px] text-muted-foreground">
          A meta vale em horário de aula ({rotuloDaAula(d.aula)}), nos últimos {d.aula.slo_janela_dias} dias{d.aula.agora ? ", e agora é horário de aula" : ""}. Em aula as sondas rodam a cada minuto. Quem mede é o banco, de fora do servidor da API. O tempo até responder inclui a espera do pg_net: serve para ver tendência, não como número absoluto. O app não tem sonda; o que ele vê está em &ldquo;O que os aparelhos relatam&rdquo;.
        </p>
      </Secao>

      <Secao id="disp-incidentes" titulo="Incidentes na janela">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Numero rotulo="Abertos agora" valor={resumo.abertos} destaque={resumo.abertos > 0} />
          <Numero rotulo="Quedas" valor={resumo.quedas} />
          <Numero rotulo="Instabilidades" valor={resumo.instabilidades} />
          <Numero rotulo="Lentidão" valor={resumo.lentidoes} />
          <Numero rotulo="Mediana da queda" valor={formatarMinutos(resumo.mediana_queda_min)} />
        </div>
        <Tabela
          cabecalho={["Tipo", "Onde", "Início", "Duração", "Motivo", "Versão"]}
          vazio="Nenhum incidente na janela."
          linhas={d.incidentes.map((i) => [
            rotuloDoIncidente(i.tipo),
            rotuloDaOrigem(i.alvo_id, d.alvos),
            quando(i.inicio),
            i.fim ? formatarMinutos(i.minutos) : `aberto há ${formatarMinutos(i.minutos)}`,
            i.motivo ?? "—",
            i.versao ?? "—",
          ])}
        />
      </Secao>

      <Secao id="disp-cliente" titulo="O que os aparelhos relatam">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero rotulo="Lotes recebidos" valor={cliente.lotes} />
          <Numero rotulo="Pela API" valor={contagem(cliente.pela_api, cliente.lotes)} />
          <Numero rotulo="Caminho direto" valor={contagem(cliente.diretos, cliente.lotes)} />
          <Numero rotulo="Sem alcançar a API" valor={contagem(cliente.sem_alcancar_api, cliente.lotes)} destaque={cliente.sem_alcancar_api > 0} />
        </div>
        <Tabela cabecalho={["Versão do app", "Plataforma", "Lotes"]} vazio="Nenhum lote na janela." linhas={cliente.versoes.map((v) => [v.versao, v.plataforma, v.lotes])} />
        <p className="text-[11.5px] text-muted-foreground">Erro de tela e travamento do app ainda não são capturados: até lá, isto só mostra a ida à API.</p>
      </Secao>

      <Secao id="disp-ia" titulo="Chamadas ao modelo (pela API)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero rotulo="Com erro" valor={contagem(ia.erros, ia.chamadas)} destaque={ia.erros > 0} />
          <Numero rotulo="p95 da chamada" valor={ia.latencia_p95_ms === null ? "—" : `${(ia.latencia_p95_ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`} />
          <Numero rotulo="Tokens de entrada" valor={formatarTokens(ia.tokens_entrada)} />
          <Numero rotulo="Tokens de saída" valor={formatarTokens(ia.tokens_saida)} />
        </div>
        <Tabela cabecalho={["Prompt", "Chamadas", "Erros"]} vazio="Nenhuma chamada registrada na janela." linhas={ia.por_prompt.map((p) => [p.prompt, p.chamadas, p.erros])} />
      </Secao>

      <Secao id="disp-banco" titulo="Banco">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Numero rotulo="Espaço" valor={banco.tamanho_mb === null ? "—" : `${banco.tamanho_mb} de ${banco.limite_mb} MB`} />
          <Numero rotulo="Conexões" valor={banco.conexoes === null ? "—" : `${banco.conexoes} de ${banco.conexoes_max}`} />
          <Numero rotulo="Rotinas com falha (24 h)" valor={banco.rotinas_com_falha_24h ?? "—"} destaque={(banco.rotinas_com_falha_24h ?? 0) > 0} />
        </div>
      </Secao>

      <Secao id="disp-alertas" titulo="Alertas por e-mail">
        <div className="grid grid-cols-3 gap-3">
          <Numero rotulo="Enviados em 24 h" valor={`${alertas.enviados_24h} de ${alertas.teto_dia}`} />
          <Numero rotulo="Na fila" valor={alertas.pendentes} />
          <Numero rotulo="Desistidos" valor={alertas.desistidos} destaque={alertas.desistidos > 0} />
        </div>
        <Tabela
          cabecalho={["Assunto", "Criado", "Enviado", "Erro"]}
          vazio="Nenhum alerta ainda."
          linhas={alertas.ultimos.map((a) => [a.assunto, quando(a.criado_em), a.enviado_em ? quando(a.enviado_em) : "não", a.erro ?? "—"])}
        />
      </Secao>
    </div>
  );
}

/** Uma série só: barras finas de alunos por dia, com o número no `title` e a tabela logo abaixo. */
function BarrasDeAlunos({ serie, matriculados }: { serie: DiaDeAcesso[]; matriculados: number }) {
  const porDia = new Map(serie.map((d) => [d.dia, d]));
  const teto = Math.max(matriculados, ...serie.map((d) => d.alunos), 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex h-[120px] items-end gap-[2px]" role="img" aria-label={`Alunos com acesso por dia, últimos 30 dias, de ${matriculados} matriculados.`}>
        {ultimosDias(new Date()).map((dia) => {
          const alunos = porDia.get(dia)?.alunos ?? 0;
          return (
            <span
              key={dia}
              title={`${diaCurto(dia)}: ${alunos} de ${matriculados} alunos, ${porDia.get(dia)?.minutos ?? 0} min de uso`}
              className="min-w-0 flex-1 rounded-t-[4px] bg-primary"
              style={{ height: alunos === 0 ? 2 : `${(100 * alunos) / teto}%`, opacity: alunos === 0 ? 0.25 : 1 }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Alunos com acesso por dia, nos últimos 30 dias. O topo é a turma inteira ({matriculados}).</p>
    </div>
  );
}

function ListaPorAluno() {
  const [dias, setDias] = useState("30");
  const { alunos, revelado, erro, revelar, ocultar } = useAcessosDosAlunos(Number(dias));
  return (
    <Secao id="disp-por-aluno" titulo="Acessos por aluno">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedPills ariaLabel="Período da lista" opcoes={["7", "30", "90"].map((v) => ({ value: v, label: `${v} dias` }))} valor={dias} onChange={setDias} />
        <button
          type="button"
          onClick={revelado ? ocultar : revelar}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted"
        >
          {revelado ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          {revelado ? "Ocultar nomes" : "Mostrar nomes"}
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-[12.5px] text-foreground">
          Não foi possível ler a lista. Detalhe: {erro}
        </p>
      )}
      <Tabela
        cabecalho={[revelado ? "Aluno" : "Código", "Dias com acesso", "Acessos", "Tempo de uso", "Último acesso"]}
        vazio="Nenhum aluno matriculado."
        linhas={alunos.map((a) => [a.nome ?? a.codigo, a.dias_com_acesso, a.acessos, formatarMinutos(a.minutos), a.ultimo_acesso_em ? haQuanto(a.ultimo_acesso_em, new Date()) : "nunca"])}
      />
      <p className="text-[11.5px] text-muted-foreground">
        Quem ficou mais tempo sem acessar vem primeiro. Esta lista serve para achar problema técnico, não para avaliar aluno, e cada vez que os nomes são mostrados fica registrada. Acessos a menos de 30 min um do outro contam como um.
      </p>
    </Secao>
  );
}

function PainelDeAcessos({ d, horas }: { d: Disponibilidade; horas: number }) {
  const a = d.acessos;
  return (
    <div className="flex flex-col gap-[22px]">
      <Secao id="disp-acessos" titulo="Acessos do app e da web do aluno">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Numero rotulo="Ativos hoje" valor={contagem(a.ativos_hoje, a.matriculados)} />
          <Numero rotulo="Ativos em 7 dias" valor={contagem(a.ativos_7d, a.matriculados)} />
          <Numero rotulo="Ativos em 30 dias" valor={contagem(a.ativos_30d, a.matriculados)} />
          <Numero rotulo="Acessos em 7 dias" valor={a.acessos_7d} />
          <Numero rotulo="Acessos em 30 dias" valor={a.acessos_30d} />
        </div>
        <BarrasDeAlunos serie={a.serie_30d} matriculados={a.matriculados} />
        <Tabela cabecalho={["Plataforma", "Acessos em 30 dias"]} vazio="Nenhum acesso em 30 dias." linhas={a.por_plataforma.map((p) => [p.plataforma, p.acessos])} />
        </Secao>
      <AcessosDoConsole horas={horas} />
      <ListaPorAluno />
    </div>
  );
}

/** Disponibilidade ou acessos, conforme a aba. Lê direto do banco: com a API fora, esta tela continua de pé. */
export default function DisponibilidadeSection({ horas, aba }: { horas: number; aba: "disponibilidade" | "acessos" }) {
  const { dados, estado } = useDisponibilidade(horas);
  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h2 className="text-lg text-foreground">Monitor ainda não disponível</h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[13px] leading-relaxed text-muted-foreground">O banco deste ambiente ainda não tem as funções do monitor (migrations 20261105_09 e _10).</p>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar o monitor. Detalhe: {estado.detalhe}
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[110px]" />
        ))}
      </div>
    );
  }
  return aba === "disponibilidade" ? <PainelDeDisponibilidade d={dados} /> : <PainelDeAcessos d={dados} horas={horas} />;
}
