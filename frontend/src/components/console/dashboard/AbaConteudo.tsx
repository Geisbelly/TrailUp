import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  comparacaoComMedia,
  destaques as calcularDestaques,
  erroMedio,
  faixaDeErro,
  metricasPorConteudo,
  pctDe,
  type FaixaDeErro,
  type Matricula,
  type MetricaDeConteudo,
} from "./conteudo";
import { useConteudoDaTurma } from "./useConteudoDaTurma";

const COR_DO_ERRO: Record<FaixaDeErro, string> = {
  baixo: "hsl(var(--success))",
  medio: "hsl(var(--warning))",
  alto: "hsl(var(--destructive))",
};

const pct = (v: number) => `${Math.round(v)}%`;
const alunos = (n: number) => `${n} ${n === 1 ? "aluno" : "alunos"}`;
const formato = (tipo: string | null) => (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "—");

function CardDestaque({
  rotulo,
  metrica,
  valor,
  corDoValor,
  complemento,
  nota,
  corDaNota,
  alerta,
  mostrarTurma,
  nomeDaTurma,
}: {
  rotulo: string;
  metrica: MetricaDeConteudo | null;
  valor?: string;
  corDoValor?: string;
  complemento?: string;
  nota?: string | null;
  corDaNota?: string;
  alerta?: boolean;
  mostrarTurma: boolean;
  nomeDaTurma: (id: number) => string;
}) {
  return (
    <div className={cn("rounded-[20px] border bg-card px-6 py-[22px]", alerta ? "border-destructive/50" : "border-border")}>
      <div className="console-label-sm">{rotulo}</div>
      {metrica ? (
        <>
          <div className="mt-2.5 text-[17px] font-bold text-foreground">{metrica.titulo}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {metrica.topico}
            {mostrarTurma && ` · ${nomeDaTurma(metrica.classeId)}`}
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
            <div className="text-[28px] font-extrabold leading-none" style={{ color: corDoValor ?? "hsl(var(--foreground))" }}>
              {valor}
            </div>
            {complemento && <div className="text-[12.5px] text-muted-foreground">{complemento}</div>}
          </div>
          {nota && (
            <div className="mt-2.5 text-xs font-bold" style={{ color: corDaNota ?? "hsl(var(--muted-foreground))" }}>
              {nota}
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados ainda</p>
      )}
    </div>
  );
}

export default function AbaConteudo({
  classIds,
  matriculas,
  mostrarTurma,
  nomeDaTurma,
}: {
  classIds: number[];
  matriculas: Matricula[];
  mostrarTurma: boolean;
  nomeDaTurma: (id: number) => string;
}) {
  const { dados, carregando, erro } = useConteudoDaTurma(classIds);
  const metricas = useMemo(() => {
    const ordemDoTopico = new Map(dados.topicos.map((t, i) => [t.id, i]));
    const ordemDoConteudo = new Map(dados.conteudos.map((c) => [c.id, [ordemDoTopico.get(c.topico_id) ?? 0, c.ordem ?? 0, c.id]]));
    return metricasPorConteudo({ ...dados, matriculas }).sort((a, b) => {
      const [ta, oa, ia] = ordemDoConteudo.get(a.conteudoId) ?? [0, 0, 0];
      const [tb, ob, ib] = ordemDoConteudo.get(b.conteudoId) ?? [0, 0, 0];
      return ta - tb || oa - ob || ia - ib;
    });
  }, [dados, matriculas]);
  const media = useMemo(() => erroMedio(metricas), [metricas]);
  const { maisConsumido, maiorDificuldade, maiorConclusao } = useMemo(() => calcularDestaques(metricas), [metricas]);
  const temErro = metricas.some((m) => m.erroPct !== null);

  if (erro) {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar os conteúdos da turma. Detalhe: {erro}
      </div>
    );
  }
  if (carregando && metricas.length === 0) {
    return (
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="console-skeleton h-[160px]" />
          ))}
        </div>
        <div className="console-skeleton h-[320px]" />
      </div>
    );
  }
  if (metricas.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-10 py-16 text-center text-[15px] text-muted-foreground">
        Nenhum conteúdo cadastrado na trilha desta turma ainda.
      </div>
    );
  }

  const erroDoDestaque = maiorDificuldade?.erroPct ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-3">
        <CardDestaque
          rotulo="Mais consumido"
          metrica={maisConsumido}
          valor={maisConsumido ? String(maisConsumido.abriram) : undefined}
          complemento={maisConsumido ? `de ${alunos(maisConsumido.alunos)} abriram` : undefined}
          nota={maisConsumido ? `${pct(pctDe(maisConsumido.abriram, maisConsumido.alunos))} da turma` : null}
          mostrarTurma={mostrarTurma}
          nomeDaTurma={nomeDaTurma}
        />
        <CardDestaque
          rotulo="Maior dificuldade"
          metrica={maiorDificuldade}
          valor={erroDoDestaque === null ? undefined : pct(erroDoDestaque)}
          corDoValor={erroDoDestaque === null ? undefined : COR_DO_ERRO[faixaDeErro(erroDoDestaque)]}
          complemento="de erro nas atividades ligadas"
          nota={erroDoDestaque === null ? null : comparacaoComMedia(erroDoDestaque, media)}
          corDaNota={erroDoDestaque === null ? undefined : COR_DO_ERRO[faixaDeErro(erroDoDestaque)]}
          alerta={erroDoDestaque !== null && faixaDeErro(erroDoDestaque) === "alto"}
          mostrarTurma={mostrarTurma}
          nomeDaTurma={nomeDaTurma}
        />
        <CardDestaque
          rotulo="Maior conclusão"
          metrica={maiorConclusao}
          valor={maiorConclusao ? pct(pctDe(maiorConclusao.concluiram, maiorConclusao.alunos)) : undefined}
          corDoValor="hsl(var(--success))"
          complemento="concluíram"
          nota={maiorConclusao ? `${maiorConclusao.concluiram} de ${alunos(maiorConclusao.alunos)}` : null}
          mostrarTurma={mostrarTurma}
          nomeDaTurma={nomeDaTurma}
        />
      </div>

      <section aria-labelledby="conteudo-por-topico" className="overflow-hidden rounded-[20px] border border-border bg-card">
        <div className="px-[26px] pb-4 pt-[22px]">
          <h3 id="conteudo-por-topico" className="text-lg text-foreground">Conteúdo por tópico</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Consumo, {temErro ? "dificuldade e " : ""}conclusão de cada conteúdo da trilha
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
            <colgroup>
              <col style={{ width: temErro ? "32%" : "38%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: temErro ? "20%" : "26%" }} />
              {temErro && <col style={{ width: "18%" }} />}
              <col style={{ width: temErro ? "18%" : "24%" }} />
            </colgroup>
            <thead className="bg-muted">
              <tr>
                {["Conteúdo", "Formato", "Consumo", ...(temErro ? ["Dificuldade (erro)"] : []), "Conclusão"].map((c) => (
                  <th key={c} scope="col" className="console-label-sm !text-[11px] px-3 py-3 first:pl-[26px] last:pr-[26px]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricas.map((m) => {
                const consumo = pctDe(m.abriram, m.alunos);
                return (
                  <tr key={m.conteudoId} className="border-t border-border">
                    <td className="px-3 py-3.5 pl-[26px]">
                      <div className="truncate text-[13.5px] font-semibold text-foreground">{m.titulo}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {m.topico}
                        {mostrarTurma && ` · ${nomeDaTurma(m.classeId)}`}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-foreground">{formato(m.formato)}</td>
                    <td className="px-3 py-3.5">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--border))]"
                        role="progressbar"
                        aria-label={`Consumo de ${m.titulo}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(consumo)}
                      >
                        <div className="h-full bg-[hsl(var(--console-violet))]" style={{ width: `${consumo}%` }} />
                      </div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        {m.abriram} de {alunos(m.alunos)}
                      </div>
                    </td>
                    {temErro && (
                      <td className="px-3 py-3.5">
                        {m.erroPct === null ? (
                          <span className="text-[13.5px] text-muted-foreground">—</span>
                        ) : (
                          <>
                            <div className="text-[13.5px] font-bold" style={{ color: COR_DO_ERRO[faixaDeErro(m.erroPct)] }}>
                              {pct(m.erroPct)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">{comparacaoComMedia(m.erroPct, media)}</div>
                          </>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3.5 pr-[26px]">
                      <div className="text-[13.5px] font-bold text-foreground">{pct(pctDe(m.concluiram, m.alunos))}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {m.concluiram} de {alunos(m.alunos)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
