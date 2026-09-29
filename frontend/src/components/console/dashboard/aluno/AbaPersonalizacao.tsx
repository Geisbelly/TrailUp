import type { ReactNode } from "react";
import { PerfilChip } from "../PerfilVisual";
import { consumoTotal, itemConcluido } from "./calculos";
import type { Aluno, Personalizacao, ProgressoItem } from "./tipos";

const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "Sem data");

function justificativaDe(p: Personalizacao): string {
  const valor = p.plano?.justificativa;
  return typeof valor === "string" && valor.trim() ? valor : "Sem justificativa registrada.";
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">{children}</span>;
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div>
      <dt className="console-label-sm !text-[11px]">{rotulo}</dt>
      <dd className="mt-1 text-2xl font-extrabold text-foreground">{valor}</dd>
    </div>
  );
}

export default function AbaPersonalizacao({
  aluno,
  carregando,
  erro,
  personalizacoes,
  progressoItens,
}: {
  aluno: Aluno;
  carregando: boolean;
  erro: string | null;
  personalizacoes: Personalizacao[];
  progressoItens: ProgressoItem[];
}) {
  if (carregando) {
    return <div className="rounded-[20px] border border-border bg-card p-6 text-sm text-muted-foreground">Carregando histórico de personalização…</div>;
  }
  if (erro) {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar a personalização deste aluno. Detalhe: {erro}
      </div>
    );
  }

  const consumo = consumoTotal(progressoItens);
  const nomeDoTopico = new Map(aluno.topicos.map((t) => [t.id, t.nome]));
  const tempoPersonalizado = progressoItens.reduce((soma, i) => soma + Number(i.tempo_gasto_min ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="min-w-0 rounded-[20px] border border-border bg-card px-7 py-[26px]">
          <h3 className="text-lg text-foreground">Material personalizado por tópico</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Justificativa, formatos gerados e etapas entregues ao aluno em cada personalização</p>
          {personalizacoes.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">Nenhuma personalização encontrada para este aluno nesta turma.</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-3">
              {personalizacoes.map((p) => (
                <li key={p.id} className="rounded-2xl bg-muted px-[18px] py-[15px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-foreground">
                        {p.topico_id != null ? nomeDoTopico.get(p.topico_id) ?? `Tópico ${p.topico_id}` : "Geral"}
                        <span className="font-normal text-muted-foreground"> · personalização #{p.id}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">{justificativaDe(p)}</p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground">
                      {p.formato_prioritario || "misto"}
                    </span>
                  </div>
                  {(p.formatos_gerados ?? []).length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(p.formatos_gerados ?? []).map((f) => (
                        <span key={f} className="rounded-full bg-card px-2.5 py-0.5 text-[11.5px] font-semibold text-foreground">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2.5 text-[11.5px] text-muted-foreground">
                    {p.steps?.length === 1 ? "1 etapa gerada" : `${p.steps?.length ?? 0} etapas geradas`} · gerado em {dataHora(p.gerado_em)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section className="rounded-[20px] border border-border bg-card px-6 py-[22px]">
            <h3 className="text-base text-foreground">Consumo total</h3>
            {consumo.percentual === null ? (
              <p className="mt-3 text-sm text-muted-foreground">Ainda não há itens personalizados registrados para este aluno.</p>
            ) : (
              <>
                <div className="mt-3.5 flex items-end gap-2.5">
                  <div className="text-[38px] font-extrabold leading-none text-foreground">{consumo.percentual.toFixed(0)}%</div>
                  <div className="pb-1 text-[12.5px] text-muted-foreground">dos itens concluídos</div>
                </div>
                <div className="mt-4 h-[7px] overflow-hidden rounded-full bg-[hsl(var(--border))]" aria-hidden="true">
                  <div className="h-full bg-[hsl(var(--console-violet))]" style={{ width: `${consumo.percentual}%` }} />
                </div>
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  {consumo.concluidos} de {consumo.total} itens registrados
                </p>
              </>
            )}
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <Numero rotulo="Personalizações" valor={personalizacoes.length} />
              <Numero rotulo="Itens" valor={progressoItens.length} />
              <Numero rotulo="Tempo" valor={`${tempoPersonalizado.toFixed(1)}min`} />
            </dl>
          </section>

          <section className="rounded-[20px] border border-border bg-card px-6 py-[22px]">
            <h3 className="text-base text-foreground">Contexto do aluno</h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Perfis e modo usados para personalizar o material</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {aluno.perfis.map((perfil) => (
                <Etiqueta key={perfil.nome}>
                  {perfil.nome} {Math.round(perfil.afinidade)}%
                </Etiqueta>
              ))}
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="console-label-sm !text-[11px]">Modo de operação</dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">{aluno.modoOperacao}</dd>
              </div>
              <div>
                <dt className="console-label-sm !text-[11px]">Perfil dominante</dt>
                <dd className="mt-1">
                  <PerfilChip perfil={aluno.perfilDominante} />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-border bg-card">
        <div className="px-[26px] pb-4 pt-[22px]">
          <h3 className="text-lg text-foreground">Progresso dos itens personalizados</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Tempo, pontuação e status registrados por passo do módulo personalizado</p>
        </div>
        {progressoItens.length === 0 ? (
          <p className="border-t border-border px-[26px] py-6 text-sm text-muted-foreground">Ainda não há itens personalizados registrados para este aluno.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead className="bg-muted">
                <tr>
                  {["Item", "Tipo", "Status", "Tempo", "Pontos", "Atualizado"].map((c) => (
                    <th key={c} scope="col" className="console-label-sm !text-[11px] px-3 py-3 first:pl-[26px] last:pr-[26px]">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progressoItens.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-3 pl-[26px] font-semibold text-foreground">{item.item_title}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.item_kind}</td>
                    <td className="px-3 py-3">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={
                          itemConcluido(item)
                            ? { background: "hsl(var(--success) / .14)", color: "hsl(var(--success))" }
                            : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-foreground">{Number(item.tempo_gasto_min ?? 0).toFixed(1)} min</td>
                    <td className="px-3 py-3 text-foreground">
                      {item.pontuacao_obtida ?? 0}
                      {item.pontuacao_maxima ? ` / ${item.pontuacao_maxima}` : ""}
                    </td>
                    <td className="px-3 py-3 pr-[26px] text-muted-foreground">{item.updated_at ? dataHora(item.updated_at) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
