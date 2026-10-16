import { useCallback, useEffect, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina, SeloDeStatus } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import { aproveitamento, posicoes, ROTULO_DO_FORMATO, ROTULO_DO_MODO, rotuloDoDesfecho, tituloDoDuelo } from "./batalha";
import { lerBatalhas, type ResumoDasBatalhas } from "./batalhasApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Rank de batalhas: ranking de guildas por duelos e os duelos recentes da turma (só leitura). */
export default function BatalhasSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando: carregandoTurmas, erro: erroTurmas, recarregar } = useTurmasDoProfessor(professorId);
  const [dados, setDados] = useState<ResumoDasBatalhas | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");

  const carregar = useCallback(async (id: number) => {
    setEstado("carregando");
    try {
      setDados(await lerBatalhas(id));
      setEstado("ok");
    } catch (e) {
      setDetalhe((e as { message?: string })?.message?.trim() || "erro desconhecido");
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    if (turmaId) void carregar(turmaId);
  }, [turmaId, carregar]);

  const ranking = dados ? posicoes(dados.ranking) : [];

  return (
    <div>
      <CabecalhoDePagina titulo="Rank de batalhas" subtitulo="Os duelos de perguntas entre guildas da turma e quem está vencendo." />

      {carregandoTurmas && <div role="status" aria-label="Carregando" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {erroTurmas && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erroTurmas} onTentarNovamente={() => void recarregar()} />}
      {!carregandoTurmas && !erroTurmas && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={Swords} titulo="Crie uma turma primeiro" texto="As batalhas acontecem entre guildas de uma turma. Crie a primeira em Turmas." />
      )}

      {!carregandoTurmas && !erroTurmas && turmaId && (
        <div className="space-y-6">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
              <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Turma"><SelectValue /></SelectTrigger>
              <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.descricao || `Turma ${t.id}`}</SelectItem>)}</SelectContent>
            </Select>
          )}

          {estado === "carregando" && <div role="status" aria-label="Carregando batalhas" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar as batalhas" detalhe={detalhe} onTentarNovamente={() => void carregar(turmaId)} />}

          {estado === "ok" && dados && dados.duelos.length === 0 && (
            <EstadoVazioDaPagina icone={Swords} titulo="Nenhuma batalha ainda" texto="Os duelos são lançados pelos alunos, no app, entre guildas da turma. Quando o primeiro acontecer, o ranking aparece aqui." />
          )}

          {estado === "ok" && dados && dados.duelos.length > 0 && (
            <>
              <section aria-label="Ranking de guildas">
                <h2 className={rotulo}>Ranking de guildas</h2>
                {ranking.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhum duelo encerrado ainda — o ranking conta só duelos concluídos.</p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {ranking.map(({ linha, posicao }) => (
                      <li key={linha.guildaId} className="flex flex-wrap items-center gap-3 rounded-[16px] border bg-card px-4 py-3">
                        <span className="w-8 text-lg font-bold">{posicao}º</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{linha.nome}</span>
                        <span className="text-sm text-muted-foreground">{linha.vitorias} vitórias · {linha.empates} empates · {linha.duelos} duelos</span>
                        <span className="text-sm font-bold">{aproveitamento(linha)}%</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section aria-label="Duelos recentes">
                <h2 className={rotulo}>Duelos recentes</h2>
                <ul className="mt-2 space-y-2">
                  {dados.duelos.map((d) => (
                    <li key={d.id} className="rounded-[16px] border bg-card px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate font-semibold">{tituloDoDuelo(d)}</h3>
                        <SeloDeStatus tom={d.status === "aberto" ? "ativo" : "neutro"}>{rotuloDoDesfecho(d)}</SeloDeStatus>
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        {ROTULO_DO_FORMATO[d.formato]} · {ROTULO_DO_MODO[d.modo]} · {d.aceitaram} {d.aceitaram === 1 ? "participante" : "participantes"} · {dataCurta(d.criadoEm)}
                        {d.equipes.length > 0 && ` · ${d.equipes.map((e) => `${e.pontos} pts`).join(" × ")}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
