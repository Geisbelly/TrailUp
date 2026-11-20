import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { alunosParaOlhar, conceitosDificeis, nomeDoTopico, resumir, textoAntesDepois, topicosNaOrdem } from "./guia";
import { useGuiaDaTurma } from "./useGuiaDaTurma";
import type { Aluno } from "./aluno/tipos";
import ExplicacaoDaMetrica from "../comum/ExplicacaoDaMetrica";
import type { ChaveMetrica } from "@/lib/metricas/explicacoes";

const alunosTxt = (n: number) => `${n} ${n === 1 ? "aluno" : "alunos"}`;
const LIMITE_DE_ALUNOS = 30;

function Kpi({ rotulo, valor, nota, alerta }: { rotulo: string; valor: number; nota: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-[20px] border bg-card px-6 py-[22px]", alerta ? "border-destructive/50" : "border-border")}>
      <div className="console-label-sm">{rotulo}</div>
      <div className="mt-2.5 text-[28px] font-extrabold leading-none text-foreground">{valor}</div>
      <div className="mt-2 text-[12.5px] text-muted-foreground">{nota}</div>
    </div>
  );
}

function Secao({
  id,
  titulo,
  subtitulo,
  explicacao,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
  explicacao: ChaveMetrica;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-[20px] border border-border bg-card">
      <div className="px-[26px] pb-4 pt-[22px]">
        <div className="flex items-center gap-1">
          <h3 id={id} className="text-lg text-foreground">
            {titulo}
          </h3>
          <ExplicacaoDaMetrica chave={explicacao} />
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{subtitulo}</p>
      </div>
      {children}
    </section>
  );
}

const TH = "console-label-sm !text-[11px] px-3 py-3 first:pl-[26px] last:pr-[26px]";
const TD = "px-3 py-3.5 text-[13.5px] text-foreground first:pl-[26px] last:pr-[26px]";

export default function AbaGuia({
  classIds,
  alunos,
  mostrarTurma,
  nomeDaTurma,
  onAbrirAluno,
}: {
  classIds: number[];
  alunos: Aluno[];
  mostrarTurma: boolean;
  nomeDaTurma: (id: number) => string;
  onAbrirAluno: (aluno: Aluno) => void;
}) {
  const { dados, estado } = useGuiaDaTurma(classIds);

  const nomesDosTopicos = useMemo(() => new Map(dados.topicos.map((t) => [t.id, t.nome])), [dados.topicos]);
  const ordemDosTopicos = useMemo(() => new Map(dados.topicos.map((t, i) => [t.id, i])), [dados.topicos]);
  const resumo = useMemo(() => resumir(dados.porTopico, dados.porAluno), [dados]);
  const conceitos = useMemo(() => conceitosDificeis(dados.conceitos), [dados.conceitos]);
  const porTopico = useMemo(() => topicosNaOrdem(dados.porTopico, ordemDosTopicos), [dados.porTopico, ordemDosTopicos]);
  const porAluno = useMemo(() => alunosParaOlhar(dados.porAluno), [dados.porAluno]);
  const alunoDe = (alunoId: string, classeId: number) => alunos.find((a) => a.id === alunoId && a.classe_id === classeId) ?? null;
  const ondeFica = (topicoId: number | null, classeId: number) =>
    `${nomeDoTopico(nomesDosTopicos, topicoId)}${mostrarTurma ? ` · ${nomeDaTurma(classeId)}` : ""}`;

  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h3 className="text-lg text-foreground">Perguntas ao Guia ainda não disponíveis</h3>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          O banco deste ambiente ainda não tem o registro das perguntas ao Guia. Assim que ele for instalado, o resumo aparece aqui.
        </p>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar as perguntas ao Guia. Detalhe: {estado.detalhe}
      </div>
    );
  }
  if (estado.tipo === "carregando") {
    return (
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="console-skeleton h-[120px]" />
          ))}
        </div>
        <div className="console-skeleton h-[280px]" />
      </div>
    );
  }
  if (resumo.perguntas === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-10 py-16 text-center">
        <p className="text-[15px] text-muted-foreground">Nenhum aluno desta turma perguntou ao Guia ainda.</p>
        <p className="mx-auto mt-3 max-w-[460px] text-[12.5px] leading-relaxed text-muted-foreground">
          Quando perguntarem, aparece aqui o tema de cada pergunta e onde a turma trava. O texto que o aluno escreve não é guardado.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        O que os alunos perguntaram ao Guia. Guardamos o tema, os conceitos e se o aluno estava com dificuldade, nunca o texto que ele
        escreveu.
      </p>

      <div className="grid gap-5 md:grid-cols-3">
        <Kpi rotulo="Perguntas" valor={resumo.perguntas} nota={`${alunosTxt(resumo.alunosEmTopico)} perguntaram em algum tópico`} />
        <Kpi
          rotulo="Pediram a resposta"
          valor={resumo.pedidosResposta}
          nota="vezes em que o aluno pediu a resposta pronta (o Guia dá dica, não entrega)"
        />
        <Kpi
          rotulo="Travaram"
          valor={resumo.alunosTravados}
          nota={resumo.alunosTravados === 1 ? "aluno disse que não sai do lugar em algum tópico" : "alunos disseram que não saem do lugar em algum tópico"}
          alerta={resumo.alunosTravados > 0}
        />
      </div>

      <Secao id="guia-conceitos" explicacao="prof.guia_conceitos" titulo="Onde a turma trava" subtitulo="Conceitos que apareceram em perguntas com dificuldade, do mais citado ao menos citado">
        {conceitos.length === 0 ? (
          <p className="px-[26px] pb-6 text-sm text-muted-foreground">Nenhuma pergunta com dificuldade ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead className="bg-muted">
                <tr>
                  {["Conceito", "Tópico", "Com dificuldade", "Menções"].map((c) => (
                    <th key={c} scope="col" className={TH}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conceitos.map((c) => (
                  <tr key={`${c.classe_id}:${c.topico_id}:${c.conceito}`} className="border-t border-border">
                    <td className={cn(TD, "truncate font-semibold")}>{c.conceito}</td>
                    <td className={cn(TD, "truncate text-xs text-muted-foreground")}>{ondeFica(c.topico_id, c.classe_id)}</td>
                    <td className={TD}>
                      {c.alunos_com_dificuldade} de {alunosTxt(c.alunos)}
                    </td>
                    <td className={TD}>{c.mencoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao id="guia-topicos" explicacao="prof.guia_topicos" titulo="Perguntas por tópico" subtitulo="Na ordem da trilha. Perguntas feitas fora de um tópico ficam por último">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead className="bg-muted">
              <tr>
                {["Tópico", "Perguntas", "Alunos", "Sobre a matéria", "Pediram resposta", "Travaram"].map((c) => (
                  <th key={c} scope="col" className={TH}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porTopico.map((t) => (
                <tr key={`${t.classe_id}:${t.topico_id}`} className="border-t border-border">
                  <td className={cn(TD, "truncate font-semibold")}>{ondeFica(t.topico_id, t.classe_id)}</td>
                  <td className={TD}>{t.perguntas}</td>
                  <td className={TD}>{t.alunos}</td>
                  <td className={TD}>{t.duvidas_materia}</td>
                  <td className={TD}>{t.pedidos_resposta}</td>
                  <td className={cn(TD, t.alunos_travados > 0 && "font-bold text-destructive")}>{t.alunos_travados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao
        id="guia-alunos"
        explicacao="prof.guia_por_aluno"
        titulo="Por aluno"
        subtitulo="Quem travou aparece primeiro. O acerto antes e depois da primeira conversa no tópico mostra o que aconteceu no tempo, não prova que o Guia ajudou"
      >
        {porAluno.length === 0 ? (
          <p className="px-[26px] pb-6 text-sm text-muted-foreground">Nenhuma pergunta feita dentro de um tópico ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
              <colgroup>
                <col style={{ width: "24%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead className="bg-muted">
                <tr>
                  {["Aluno", "Tópico", "Perguntas", "Pediram resposta", "Travou", "Acerto antes → depois"].map((c) => (
                    <th key={c} scope="col" className={TH}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAluno.slice(0, LIMITE_DE_ALUNOS).map((l) => {
                  const quem = alunoDe(l.aluno_id, l.classe_id);
                  return (
                    <tr key={`${l.classe_id}:${l.aluno_id}:${l.topico_id}`} className="border-t border-border">
                      <td className={cn(TD, "truncate")}>
                        {quem ? (
                          <button
                            type="button"
                            onClick={() => onAbrirAluno(quem)}
                            className="truncate font-semibold text-foreground underline-offset-2 hover:underline focus-visible:underline"
                          >
                            {quem.nome}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">Aluno fora da turma</span>
                        )}
                      </td>
                      <td className={cn(TD, "truncate text-xs text-muted-foreground")}>{ondeFica(l.topico_id, l.classe_id)}</td>
                      <td className={TD}>{l.perguntas}</td>
                      <td className={TD}>{l.pedidos_resposta}</td>
                      <td className={cn(TD, l.travado > 0 && "font-bold text-destructive")}>{l.travado > 0 ? `${l.travado}×` : "—"}</td>
                      <td className={TD}>{textoAntesDepois(l)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {porAluno.length > LIMITE_DE_ALUNOS && (
              <p className="px-[26px] py-4 text-[12px] text-muted-foreground">
                Mostrando {LIMITE_DE_ALUNOS} de {porAluno.length} linhas, das que pedem mais atenção para as que pedem menos.
              </p>
            )}
          </div>
        )}
      </Secao>
    </div>
  );
}
