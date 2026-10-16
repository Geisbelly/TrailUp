import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErroDaPagina, SeloDeStatus } from "../comum/PaginaDoConsole";
import { percentual, quemPrecisaDeEmpurrao, resumoEmFrase, ROTULO_DA_SITUACAO, rotuloDasGuildas, type PainelDurante } from "./durante";
import { lerDurante, traduzirErroDeEvento, type Evento } from "./eventosApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function Numero({ titulo, valor, detalhe }: { titulo: string; valor: number | string; detalhe?: string }) {
  return (
    <div className="rounded-[14px] border bg-background p-3">
      <dt className={rotulo}>{titulo}</dt>
      <dd className="mt-1 text-2xl font-bold">{valor}</dd>
      {detalhe && <p className="text-[11.5px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** Painel "Durante": como o evento aberto está andando — quem começou, quem parou e as guildas ativas. */
export function DuranteDoEventoDialog({ evento, onFechar }: { evento: Evento; onFechar: () => void }) {
  const [painel, setPainel] = useState<PainelDurante | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setPainel(null);
    setErro(null);
    lerDurante(evento.id)
      .then((p) => ativo && setPainel(p))
      .catch((e) => ativo && setErro(traduzirErroDeEvento(e, "erro desconhecido")));
    return () => {
      ativo = false;
    };
  }, [evento.id, tentativa]);

  const empurrar = painel ? quemPrecisaDeEmpurrao(painel.alunos) : [];

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[20px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-[22px]">Durante — {evento.titulo}</DialogTitle>
          <DialogDescription>Como o evento está andando agora. Atualiza sempre que você abre o painel.</DialogDescription>
        </DialogHeader>

        {!painel && !erro && <div role="status" aria-label="Carregando painel" className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {erro && <ErroDaPagina titulo="Não foi possível carregar o painel" detalhe={erro} onTentarNovamente={() => setTentativa((t) => t + 1)} />}

        {painel && (
          <div className="space-y-6">
            <p className="text-sm">{resumoEmFrase(painel)}</p>

            <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
              <Numero titulo="Participando" valor={painel.comecaram - painel.pararam} detalhe={`${percentual(painel.comecaram - painel.pararam, painel.total)}% da turma`} />
              <Numero titulo="Pararam" valor={painel.pararam} detalhe="3+ dias sem atividade" />
              <Numero titulo="Não começaram" valor={painel.naoComecaram} />
              {evento.modalidadeGuilda && <Numero titulo="Guildas" valor={painel.guildasAtivas} detalhe={rotuloDasGuildas(painel)} />}
            </dl>

            <section aria-label="Por modalidade">
              <h3 className={rotulo}>Por modalidade</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Individual: {painel.porModalidade.individual} alunos participaram</li>
                {evento.modalidadeGuilda && <li>Guilda: {painel.porModalidade.guilda} alunos participaram em guilda</li>}
              </ul>
            </section>

            <section aria-label="Quem precisa de um empurrão">
              <h3 className={rotulo}>Quem precisa de um empurrão</h3>
              {empurrar.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Ninguém por enquanto: todos estão participando.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {empurrar.map((a) => (
                    <li key={a.alunoId} className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                      <SeloDeStatus tom={a.situacao === "parou" ? "alerta" : "neutro"}>{ROTULO_DA_SITUACAO[a.situacao]}</SeloDeStatus>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" className="rounded-full" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
