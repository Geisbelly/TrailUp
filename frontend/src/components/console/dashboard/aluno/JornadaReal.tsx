import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatarTempo, montarJornada, type Passo, type TipoDePasso } from "./jornada";
import { useIntervencoesDoPasso, useJornadaDoAluno, type DadosDaJornada } from "./useJornadaDoAluno";
import type { Aluno } from "./tipos";

// Preenchimento tingido + borda na cor do tipo e número na cor de texto: o
// branco sobre roxo saturado do protótipo não passa AAA nesse tamanho.
const COR: Record<TipoDePasso, { cor: string; texto: string }> = {
  ok: { cor: "var(--console-violet)", texto: "var(--console-violet-text)" },
  err: { cor: "var(--destructive)", texto: "var(--destructive)" },
  drop: { cor: "var(--destructive)", texto: "var(--destructive)" },
  retry: { cor: "var(--warning)", texto: "var(--warning)" },
  back: { cor: "var(--warning)", texto: "var(--warning)" },
  skip: { cor: "var(--info)", texto: "var(--info)" },
};

const CHIP: Record<TipoDePasso, string> = {
  ok: "sem desvio",
  err: "errou",
  retry: "repetiu",
  skip: "fora de ordem",
  back: "retorno",
  drop: "abandonou",
};

const TITULO_DO_DESVIO: Record<TipoDePasso, string> = {
  ok: "Sem desvio",
  err: "Erro nas respostas",
  retry: "Repetição",
  skip: "Fora de ordem",
  back: "Retorno a tópico anterior",
  drop: "Abandono em aberto",
};

const hsl = (v: string, alfa?: number) => (alfa === undefined ? `hsl(${v})` : `hsl(${v} / ${alfa})`);

const quando = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const listar = (nomes: string[], max = 2) =>
  nomes.length <= max ? nomes.join(", ") : `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function explicarDesvios(p: Passo, anterior: Passo | null): string {
  const partes: string[] = [];
  for (const d of p.desvios) {
    if (d === "back" && anterior) partes.push(`Voltou ao tópico ${p.topicoNumero} depois de estudar o ${anterior.topicoNumero}.`);
    if (d === "skip") partes.push("Estudou este tópico antes de terminar um anterior da trilha.");
    if (d === "retry") partes.push(`Refez ${plural(p.refez.length, "atividade que já tinha respondido", "atividades que já tinha respondido")}.`);
    if (d === "err") partes.push(`Terminou com erro em ${plural(p.atividades.filter((a) => !a.acertouNoFim).length, "atividade", "atividades")}.`);
    if (d === "drop") partes.push("Foi a última vez neste tópico, e ele continua sem concluir.");
  }
  return partes.join(" ") || "Seguiu a ordem da trilha.";
}

function Campo({ rotulo, valor, nota, grande }: { rotulo: string; valor: string; nota?: string | null; grande?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="console-label-sm">{rotulo}</div>
      <div className={cn("mt-[7px] font-semibold leading-snug text-foreground", grande ? "text-xl font-extrabold" : "text-[13.5px]")}>{valor}</div>
      {nota && <div className="mt-1 text-[11.5px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

function PainelDoPasso({ passo, anterior, total, dados }: { passo: Passo; anterior: Passo | null; total: number; dados: DadosDaJornada }) {
  const tituloDe = (lista: { id: number; titulo: string | null }[], id: number, prefixo: string) =>
    lista.find((x) => x.id === id)?.titulo?.trim() || `${prefixo} ${id}`;
  const conteudos = passo.conteudosAbertos.map((id) => tituloDe(dados.conteudos, id, "Conteúdo"));
  const atividades = passo.atividades.map((a) => tituloDe(dados.atividades, a.atividadeId, "Atividade"));
  const erradas = passo.atividades.filter((a) => !a.acertouNoFim);
  const esperadas = erradas
    .map((a) => {
      const q = a.tentativas[a.tentativas.length - 1]?.questaoId;
      return dados.questoes.find((x) => x.id === q)?.resposta_correta?.trim();
    })
    .filter(Boolean) as string[];
  const cor = COR[passo.tipo];

  const resultado =
    passo.tipo === "drop"
      ? "Abandonado"
      : erradas.length > 0
        ? "Errou"
        : passo.concluiuTopico
          ? "Tópico concluído"
          : passo.atividades.length > 0
            ? "Acertou tudo"
            : passo.conteudosConcluidos.length > 0
              ? "Conteúdo concluído"
              : "Parcial";

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-[26px] pb-[18px] pt-[22px]">
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border text-[15px] font-extrabold"
          style={{ background: hsl(cor.cor, 0.18), borderColor: hsl(cor.cor), color: hsl(cor.texto) }}
        >
          {passo.topicoNumero}
        </div>
        <div className="min-w-0">
          <div className="console-label-sm text-[hsl(var(--console-violet-text))]">
            passo {passo.indice + 1} de {total} · tópico {passo.topicoNumero}
          </div>
          <h4 className="mt-[5px] text-xl leading-tight text-foreground">{passo.topicoNome}</h4>
        </div>
        <span className="rounded-full px-[13px] py-[5px] text-[11px] font-bold" style={{ background: hsl(cor.cor, 0.16), color: hsl(cor.texto) }}>
          {CHIP[passo.tipo]}
        </span>
        <div className="whitespace-nowrap text-xs text-muted-foreground sm:ml-auto">{quando(passo.inicio)}</div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Campo
          rotulo="Conteúdo acessado"
          valor={conteudos.length ? listar(conteudos) : "Nenhum conteúdo aberto"}
          nota={conteudos.length ? `${plural(passo.conteudosConcluidos.length, "concluído", "concluídos")} de ${conteudos.length} aberto${conteudos.length === 1 ? "" : "s"}` : null}
        />
        <Campo
          rotulo="Atividade"
          valor={atividades.length ? listar(atividades) : "Nenhuma atividade respondida"}
          nota={atividades.length ? plural(atividades.length, "atividade respondida", "atividades respondidas") : null}
        />
        <Campo
          rotulo="Respostas"
          valor={passo.respostas ? `${passo.certas} de ${passo.respostas} certas` : "—"}
          nota={
            passo.respostas === 0
              ? "sem respostas neste passo"
              : esperadas.length
                ? `esperava ${esperadas.slice(0, 2).map((r) => `“${r}”`).join(", ")}${esperadas.length > 2 ? "…" : ""} · a resposta escolhida não é registrada`
                : "a resposta escolhida não é registrada, só se acertou"
          }
        />
        <Campo rotulo="Resultado" valor={resultado} nota={passo.concluiuTopico && resultado !== "Tópico concluído" ? "concluiu o tópico" : null} />
        <Campo rotulo="Tempo gasto" valor={formatarTempo(passo.tempoSeg)} nota={passo.tempoSeg === null ? "sem registro de tempo para este passo" : "sessões de estudo no tópico"} grande />
        <Campo
          rotulo="Visita ao tópico"
          valor={`${passo.visitaNoTopico}ª`}
          nota={passo.refez.length ? `refez ${plural(passo.refez.length, "atividade", "atividades")}` : passo.visitaNoTopico === 1 ? "primeira vez no tópico" : "sem refazer atividade"}
          grande
        />
        <Campo
          rotulo="Ordem em que foi feito"
          valor={`${passo.indice + 1}º de ${total}`}
          nota={passo.desvios.includes("back") ? "voltou a um tópico anterior" : passo.desvios.includes("skip") ? "fora da ordem da trilha" : "na ordem da trilha"}
          grande
        />
        <div className="bg-card px-5 py-4">
          <div className="console-label-sm">Progresso neste ponto</div>
          <div className="mt-[7px] text-xl font-extrabold text-foreground">{passo.progressoPct === null ? "—" : `${Math.round(passo.progressoPct)}%`}</div>
          {passo.progressoPct !== null && (
            <div className="mt-[9px] h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[hsl(var(--console-violet))]" style={{ width: `${Math.min(100, passo.progressoPct)}%` }} />
            </div>
          )}
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">atividades da trilha acertadas até aqui</div>
        </div>
      </div>

      <div className="border-t border-border bg-muted/40 px-[26px] py-[18px]">
        <div className="text-[13px] font-bold" style={{ color: passo.tipo === "ok" ? undefined : hsl(cor.texto) }}>
          {TITULO_DO_DESVIO[passo.tipo]}
        </div>
        <p className="mt-[5px] text-[13px] leading-relaxed text-muted-foreground">{explicarDesvios(passo, anterior)}</p>
      </div>
    </>
  );
}

function IntervencoesDoPasso({ passo, intervencoes }: { passo: Passo; intervencoes: ReturnType<typeof useIntervencoesDoPasso> }) {
  const { user } = useAuth();
  const { lista, estado, salvar } = intervencoes;
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const doPasso = lista.filter((i) => i.passo_ref === passo.ref);

  const enviar = async () => {
    if (!texto.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvar(passo.ref, passo.topicoId, texto);
      setTexto("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="border-t border-border px-[26px] py-[18px]">
      <label htmlFor={`comentario-${passo.ref}`} className="console-label-sm block">
        Intervenções do professor neste passo
      </label>
      {estado === "indisponivel" ? (
        <p className="mt-3 rounded-xl bg-muted px-3.5 py-3.5 text-center text-[13px] text-muted-foreground">
          Os comentários por passo ainda não estão disponíveis neste ambiente.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-start">
            <textarea
              id={`comentario-${passo.ref}`}
              value={texto}
              maxLength={2000}
              rows={2}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escrever um comentário, sugestão de estudo ou guia para este passo…"
              className="min-w-0 flex-1 resize-y rounded-[14px] border border-input bg-muted px-3.5 py-[11px] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              disabled={salvando || !texto.trim() || estado !== "pronto"}
              onClick={() => void enviar()}
              className="whitespace-nowrap rounded-full bg-primary px-[18px] py-[11px] text-[13px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar comentário"}
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
              Não foi possível salvar: {erro}
            </p>
          )}
          <div className="console-label-sm mt-[18px]">Histórico deste passo</div>
          {estado === "erro" ? (
            <p role="alert" className="mt-3 text-[13px] text-muted-foreground">Não foi possível carregar o histórico deste passo.</p>
          ) : estado === "carregando" ? (
            <div className="console-skeleton mt-3 h-12" />
          ) : doPasso.length === 0 ? (
            <p className="mt-3 rounded-xl bg-muted px-3.5 py-3.5 text-center text-[13px] text-muted-foreground">
              Nenhuma intervenção registrada ainda neste passo.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {doPasso.map((i) => (
                <li key={i.id} className="rounded-xl bg-muted px-3.5 py-3">
                  <div className="text-[11px] text-muted-foreground">
                    {quando(i.created_at)} · {i.professor_id === user?.id ? "você" : "professor"}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-normal text-foreground">{i.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function JornadaReal({ aluno }: { aluno: Aluno }) {
  const { dados, carregando, erro } = useJornadaDoAluno(aluno.id, aluno.classe_id);
  const intervencoes = useIntervencoesDoPasso(aluno.id, aluno.classe_id);
  const jornada = useMemo(
    () =>
      montarJornada({
        eventos: dados.eventos,
        topicos: dados.topicos,
        sessoes: dados.sessoes,
        totalAtividades: dados.atividades.length,
        topicosConcluidos: new Set(aluno.topicos.filter((t) => t.status === "concluido").map((t) => t.id)),
        agora: new Date(),
      }),
    [dados, aluno.topicos],
  );
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const primeiroNome = aluno.nome.split(" ")[0];

  if (erro) {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar a jornada do aluno. Detalhe: {erro}
      </div>
    );
  }
  if (carregando) {
    return (
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        <div className="console-skeleton h-[260px]" />
        <div className="console-skeleton h-[320px]" />
      </div>
    );
  }

  const { passos, resumo, passagensRapidas } = jornada;
  if (passos.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h3 className="text-lg text-foreground">Sem passos registrados ainda</h3>
        <p className="mx-auto mt-3 max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">
          A jornada aparece quando {primeiroNome} estudar pelo app: responder atividades, concluir conteúdos ou ficar ao menos um minuto num tópico.
          {passagensRapidas > 0 && ` Há ${plural(passagensRapidas, "passagem rápida", "passagens rápidas")} pelo mapa, sem estudo.`}
        </p>
      </div>
    );
  }

  const indice = selecionado !== null && selecionado < passos.length ? selecionado : passos.length - 1;
  const passo = passos[indice];
  const chips = [
    { n: resumo.retornos, texto: plural(resumo.retornos, "retorno a tópico anterior", "retornos a tópico anterior"), tipo: "back" as const },
    { n: resumo.foraDeOrdem, texto: plural(resumo.foraDeOrdem, "tópico feito fora de ordem", "tópicos feitos fora de ordem"), tipo: "skip" as const },
    { n: resumo.repeticoes, texto: plural(resumo.repeticoes, "repetição de atividade", "repetições de atividade"), tipo: "retry" as const },
    { n: resumo.abandonos, texto: plural(resumo.abandonos, "abandono", "abandonos"), tipo: "drop" as const },
  ].filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="jornada-titulo" className="rounded-[20px] border border-border bg-card px-7 pb-7 pt-6">
        <h3 id="jornada-titulo" className="text-xl text-foreground">Jornada real de {primeiroNome}</h3>
        <p className="mt-[5px] text-[12.5px] text-muted-foreground">
          Na ordem em que {primeiroNome} realmente estudou — não na ordem cadastrada da trilha. Escolha um passo para investigar.
        </p>

        <div className="mt-[18px] flex flex-wrap items-center gap-2.5 rounded-[14px] bg-muted px-4 py-[13px]">
          <div className="console-label-sm">Desvios detectados</div>
          {chips.length === 0 ? (
            <span className="text-xs text-muted-foreground">nenhum</span>
          ) : (
            chips.map((c) => (
              <span key={c.tipo} className="rounded-full px-3 py-[5px] text-xs font-bold" style={{ background: hsl(COR[c.tipo].cor, 0.16), color: hsl(COR[c.tipo].texto) }}>
                {c.texto}
              </span>
            ))
          )}
          <div className="text-xs text-muted-foreground sm:ml-auto">
            {plural(passos.length, "passo registrado", "passos registrados")} · {quando(passos[0].inicio).split(" · ")[0]} a {quando(passos[passos.length - 1].fim).split(" · ")[0]}
            {passagensRapidas > 0 && ` · ${plural(passagensRapidas, "passagem rápida", "passagens rápidas")} não contadas`}
          </div>
        </div>

        <ol aria-label="Passos da jornada" className="mt-6 flex flex-wrap items-start gap-y-5">
          {passos.map((p, i) => {
            const cor = COR[p.tipo];
            const conector = p.conector ? COR[p.conector.tipo === "ok" ? "ok" : p.conector.tipo] : null;
            const ativo = i === indice;
            return (
              <li key={p.ref} className="flex items-start">
                {p.conector && conector && (
                  <div aria-hidden="true" className="flex w-10 flex-col items-center gap-1 pt-6">
                    <div className="h-0.5 w-full" style={{ background: p.conector.tipo === "ok" ? "hsl(var(--border))" : hsl(conector.cor) }} />
                    <div
                      className="text-center text-[8.5px] font-bold uppercase leading-tight tracking-[0.03em]"
                      style={{ color: p.conector.tipo === "ok" ? "hsl(var(--muted-foreground))" : hsl(conector.texto) }}
                    >
                      {p.conector.rotulo}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  aria-pressed={ativo}
                  aria-label={`Passo ${i + 1}: ${p.topicoNome}, ${CHIP[p.tipo]}${p.conector ? `, ${p.conector.rotulo}` : ""}, ${quando(p.inicio)}`}
                  onClick={() => setSelecionado(i)}
                  className={cn(
                    "flex w-24 flex-col items-center rounded-[14px] border-2 px-1 pb-2.5 pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ativo ? "border-[hsl(var(--console-violet))] bg-muted" : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <span
                    className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 text-[17px] font-extrabold"
                    style={{ background: hsl(cor.cor, 0.22), borderColor: hsl(cor.cor), color: hsl(cor.texto) }}
                  >
                    {p.topicoNumero}
                  </span>
                  <span className="mt-2 text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">passo {i + 1}</span>
                  <span className="mt-[3px] line-clamp-2 max-w-[90px] text-center text-[11.5px] font-semibold leading-tight text-foreground">{p.topicoNome}</span>
                  <span className="mt-[7px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10px] font-bold" style={{ background: hsl(cor.cor, 0.16), color: hsl(cor.texto) }}>
                    {CHIP[p.tipo]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap gap-x-[22px] gap-y-3 border-t border-border pt-[18px] text-xs text-muted-foreground">
          {[
            { tipo: "ok" as const, texto: "Passo sem desvio" },
            { tipo: "err" as const, texto: "Errou ou abandonou" },
            { tipo: "back" as const, texto: "Retorno / repetição" },
            { tipo: "skip" as const, texto: "Fora de ordem" },
          ].map((l) => (
            <span key={l.tipo} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full border-2" style={{ background: hsl(COR[l.tipo].cor, 0.22), borderColor: hsl(COR[l.tipo].cor) }} />
              {l.texto}
            </span>
          ))}
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-[hsl(var(--console-violet))]" />
            Passo selecionado
          </span>
        </div>
      </section>

      <section aria-label={`Detalhe do passo ${indice + 1}`} className="overflow-hidden rounded-[20px] border border-border bg-card">
        <PainelDoPasso passo={passo} anterior={indice > 0 ? passos[indice - 1] : null} total={passos.length} dados={dados} />
        <IntervencoesDoPasso key={passo.ref} passo={passo} intervencoes={intervencoes} />
      </section>
    </div>
  );
}
