import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { estadoDaEntrega, type LinhaDaFila } from "./fila";
import { formatar, iniciais, mensagemDeImpacto, validarNota } from "./nota";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/**
 * Painel de correção (protótipo V9): enunciado, resposta completa, gabarito de referência,
 * nota limitada ao máximo, feedback e a frase de que a nota vira pontos no rank.
 * Quem monta deve usar `key` por entrega, para o estado reiniciar ao trocar de aluno.
 */
export function PainelDeCorrecao({
  linha,
  anterior,
  proxima,
  salvando,
  erroDoServidor,
  onSalvar,
  onIr,
  onVoltar,
}: {
  linha: LinhaDaFila;
  anterior: LinhaDaFila | null;
  proxima: LinhaDaFila | null;
  salvando: boolean;
  erroDoServidor: string | null;
  onSalvar: (nota: number, feedback: string) => void;
  onIr: (l: LinhaDaFila) => void;
  onVoltar: () => void;
}) {
  const jaCorrigida = estadoDaEntrega(linha) === "corrigida";
  const semEntregaInicial = estadoDaEntrega(linha) === "sem_entrega";
  const notaDaIa = estadoDaEntrega(linha) === "revisar";
  const [nota, setNota] = useState(linha.pontuacaoObtida !== null && !semEntregaInicial ? formatar(linha.pontuacaoObtida) : "");
  const [feedback, setFeedback] = useState(linha.feedback ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const semEntrega = estadoDaEntrega(linha) === "sem_entrega";
  const validada = validarNota(nota, linha.pontuacaoMaxima);

  const salvar = () => {
    if (!validada.ok) return setErro(validada.erro);
    setErro(null);
    onSalvar(validada.valor!, feedback);
  };

  return (
    <section className="overflow-hidden rounded-[20px] border border-primary bg-card" aria-label={`Correção de ${linha.alunoNome}`}>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-6 py-4">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onVoltar}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Fila de correção
        </Button>
        <span aria-hidden="true" className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-background text-xs font-extrabold">{iniciais(linha.alunoNome)}</span>
        <div className="min-w-0">
          <p className="truncate font-bold">{linha.alunoNome}</p>
          <p className="truncate text-xs text-muted-foreground">{linha.titulo} · Dissertativa</p>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          Pontuação máxima <strong className="text-foreground">{linha.pontuacaoMaxima !== null ? `${formatar(linha.pontuacaoMaxima)} pts` : "—"}</strong>
        </p>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <h3 className={rotulo}>Enunciado</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{linha.enunciado || "Sem enunciado cadastrado."}</p>
        </div>

        <div>
          <h3 className={rotulo}>Resposta do aluno</h3>
          {semEntrega ? (
            <p role="note" className="mt-2 rounded-[14px] border border-destructive/40 bg-destructive/10 p-4 text-[13px]">
              O prazo venceu e o aluno não enviou resposta. Ainda é preciso decidir uma nota para esta entrega.
            </p>
          ) : (
            <p className="mt-2 whitespace-pre-wrap rounded-[14px] bg-muted p-4 text-sm leading-relaxed">{linha.resposta}</p>
          )}
        </div>

        {linha.gabarito && (
          <div>
            <h3 className={rotulo}>Gabarito de referência</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{linha.gabarito}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Referência para orientar a correção — questão dissertativa não tem resposta certa/errada binária.</p>
          </div>
        )}

        {notaDaIa && (
          <p role="note" className="rounded-[14px] border border-primary/40 bg-primary/10 p-4 text-[13px]">
            A IA sugeriu <strong>{formatar(linha.pontuacaoObtida)} pts</strong>. Confira a resposta e confirme a nota ou ajuste.
          </p>
        )}
        {estadoDaEntrega(linha) === "sem_nota" && (
          <p role="note" className="rounded-[14px] border border-destructive/40 bg-destructive/10 p-4 text-[13px]">
            A IA não conseguiu corrigir esta resposta. Dê a nota.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div>
            <Label htmlFor="nota-valor" className={rotulo}>Nota *</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input id="nota-valor" inputMode="decimal" className="rounded-[14px] bg-background" value={nota} onChange={(e) => setNota(e.target.value)} aria-invalid={!!erro} />
              <span className="whitespace-nowrap text-xs text-muted-foreground">de {linha.pontuacaoMaxima !== null ? formatar(linha.pontuacaoMaxima) : "—"} pts</span>
            </div>
            {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
          </div>
          <div>
            <Label htmlFor="nota-feedback" className={rotulo}>Feedback ao aluno</Label>
            <Textarea id="nota-feedback" rows={3} maxLength={2000} className="mt-2 rounded-[14px] bg-background" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Ex.: sua explicação está correta, mas faltou distinguir velocidade média de instantânea…" />
          </div>
        </div>

        <p className="text-[12.5px] text-muted-foreground" aria-live="polite">{mensagemDeImpacto(linha, validada.ok ? validada.valor : null)}</p>
        {erroDoServidor && <p role="alert" className="text-sm text-destructive">{erroDoServidor}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-full font-bold" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar avaliação"}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" disabled={!anterior || salvando} onClick={() => anterior && onIr(anterior)}>
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" disabled={!proxima || salvando} onClick={() => proxima && onIr(proxima)}>
              Próxima
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
