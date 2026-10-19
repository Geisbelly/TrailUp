import { useEffect, useState } from "react";
import { Loader2, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErroDaPagina } from "../comum/PaginaDoConsole";
import { listarResultado, traduzirErroDeEvento, type Evento, type ResultadoApurado } from "./eventosApi";
import { larguraDaBarra, ordenarResultado, resumirResultado, rotuloDaPosicao } from "./resultado";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** Resultado de um evento encerrado: resumo, destaques, placar individual e ranking de guildas (fora do rank da turma). */
export function ResultadoDoEventoDialog({ evento, onFechar }: { evento: Evento; onFechar: () => void }) {
  const [dados, setDados] = useState<ResultadoApurado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    listarResultado(evento.id)
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(traduzirErroDeEvento(e, "erro desconhecido")));
    return () => {
      ativo = false;
    };
  }, [evento.id, tentativa]);

  const placar = dados ? ordenarResultado(dados.alunos) : [];
  const resumo = dados ? resumirResultado(dados.alunos) : null;
  const maximo = placar.reduce((m, l) => Math.max(m, l.pontos), 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[20px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-[22px]">Resultado — {evento.titulo}</DialogTitle>
          <DialogDescription>Apurado quando o evento foi encerrado. Não muda se alguém sair da turma depois.</DialogDescription>
        </DialogHeader>

        {!dados && !erro && <div role="status" aria-label="Carregando resultado" className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {erro && <ErroDaPagina titulo="Não foi possível carregar o resultado" detalhe={erro} onTentarNovamente={() => setTentativa((t) => t + 1)} />}

        {dados && resumo && dados.alunos.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Este evento não tem resultado apurado. Eventos encerrados antes da apuração existir não têm placar.</p>
        )}

        {dados && resumo && dados.alunos.length > 0 && (
          <div className="space-y-6">
            <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
              <div>
                <dt className={rotulo}>Participação</dt>
                <dd className="mt-1 text-sm font-semibold">{resumo.participantes}/{resumo.total} ({resumo.percentualParticipacao}%)</dd>
              </div>
              <div>
                <dt className={rotulo}>Média de pontos</dt>
                <dd className="mt-1 text-sm font-semibold">{resumo.mediaDePontos}</dd>
              </div>
              <div>
                <dt className={rotulo}>Acima da média</dt>
                <dd className="mt-1 text-sm font-semibold">{resumo.percentualAcimaDaMedia}%</dd>
              </div>
            </dl>

            {resumo.destaques.length > 0 && (
              <section aria-label="Destaques">
                <h3 className={rotulo}>Medalha de destaque</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {resumo.destaques.map((d) => (
                    <li key={d.alunoId} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-semibold">
                      <Medal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      {d.nome}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-muted-foreground">A medalha ainda não é entregue ao aluno automaticamente; esta lista mostra quem a merece.</p>
              </section>
            )}

            <section aria-label="Placar individual">
              <h3 className={rotulo}>Placar individual</h3>
              {resumo.participantes < 8 && <p className="mt-1 text-[11.5px] text-muted-foreground">Poucos participantes: mostramos só os pontos, sem barra de comparação.</p>}
              <ol className="mt-2 space-y-1.5">
                {placar.map((l) => {
                  const largura = l.participou ? larguraDaBarra(l.pontos, maximo, resumo.participantes) : null;
                  return (
                    <li key={l.alunoId} className="rounded-[12px] border bg-background px-3 py-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-24 shrink-0 font-semibold">{rotuloDaPosicao(l.posicao, l.participou)}</span>
                        <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                        {l.participou && <span className="font-semibold">{l.pontos} pts</span>}
                      </div>
                      {largura !== null && (
                        <div role="progressbar" aria-valuenow={largura} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.nome}: ${largura}% do primeiro colocado`} className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${largura}%` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {dados.guildas.length > 0 && (
              <section aria-label="Ranking de guildas">
                <h3 className={rotulo}>Ranking de guildas</h3>
                <p className="mt-1 text-[11.5px] text-muted-foreground">Separado do placar individual: a pontuação da guilda não altera o rank da turma.</p>
                <ol className="mt-2 space-y-1.5">
                  {dados.guildas.map((g) => (
                    <li key={g.guildaId} className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 font-semibold">{g.posicao ? `${g.posicao}º` : "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{g.nome} <span className="text-muted-foreground">· {g.membros} membros</span></span>
                      <span className="font-semibold">{g.pontos} pts</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" className="rounded-full" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
