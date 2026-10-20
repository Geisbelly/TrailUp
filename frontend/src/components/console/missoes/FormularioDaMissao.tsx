import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { METRICAS, definicaoDaMetrica, metricaSomaEmGuilda } from "./criterio";
import { OBJETIVO_MAX, TITULO_MAX, validarMissao, type ErrosDaMissao, type FormularioDeMissao, type PayloadDaAtividade, type PayloadDaMissao } from "./missao";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-background";

/** Os dois caminhos de `missoes`: ver o cabeçalho de `missao.ts`. */
const CAMINHOS = [
  { chave: "entrega" as const, titulo: "Entrega", ajuda: "O aluno entrega e você corrige." },
  { chave: "meta" as const, titulo: "Meta", ajuda: "O app fecha sozinho quando o aluno atinge." },
];

/**
 * Quem cumpre. `guilda` soma o progresso dos membros no período da missão (`20261021_15`), e
 * por isso só existe como meta com métrica que soma. `aluno` é o escopo da diária do sistema
 * e não é oferecido aqui.
 */
const ESCOPOS = [
  { chave: "turma" as const, titulo: "Cada aluno da turma", ajuda: "Cada um cumpre a sua." },
  { chave: "guilda" as const, titulo: "A guilda, junta", ajuda: "Soma o que os membros fazem no período." },
];

/** "Nova missão" / "Editar missão". Quem monta usa `key` para remontar a cada abertura (o estado inicia de `inicial`). */
export function FormularioDaMissao({
  inicial,
  editando,
  topicos,
  salvando,
  erroDoServidor,
  onSalvar,
  onCancelar,
}: {
  inicial: FormularioDeMissao;
  editando: boolean;
  topicos: { id: number; nome: string | null }[];
  salvando: boolean;
  erroDoServidor: string | null;
  onSalvar: (missao: PayloadDaMissao, atividade: PayloadDaAtividade | null) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState<ErrosDaMissao>({});
  const alterar = (parcial: Partial<FormularioDeMissao>) => setForm((f) => ({ ...f, ...parcial }));
  const guilda = (form.escopo ?? "turma") === "guilda";
  const metricasOferecidas = guilda ? METRICAS.filter((m) => metricaSomaEmGuilda(m.chave)) : METRICAS;
  const escolherEscopo = (escopo: "turma" | "guilda") =>
    alterar(
      escopo === "guilda"
        ? { escopo, caminho: "meta", metrica: metricaSomaEmGuilda(form.metrica) ? form.metrica : "" }
        : { escopo },
    );

  const salvar = () => {
    const r = validarMissao(form);
    setErros(r.erros ?? {});
    if (r.ok) onSalvar(r.missao!, r.atividade);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !salvando && onCancelar()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-[20px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-[22px]">{editando ? "Editar missão" : "Nova missão"}</DialogTitle>
          <DialogDescription>Uma missão é um objetivo com prazo e pontuação. Os itens (questões e conteúdos) você monta no editor do tópico.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="mis-titulo" className={rotulo}>Título *</Label>
            <Input id="mis-titulo" className={campo} value={form.titulo} maxLength={TITULO_MAX} onChange={(e) => alterar({ titulo: e.target.value })} aria-invalid={!!erros.titulo} />
            {erros.titulo && <p className="mt-1 text-xs text-destructive">{erros.titulo}</p>}
          </div>

          <div>
            <Label htmlFor="mis-objetivo" className={rotulo}>Objetivo *</Label>
            <Textarea id="mis-objetivo" rows={3} className={campo} value={form.objetivo} maxLength={OBJETIVO_MAX} onChange={(e) => alterar({ objetivo: e.target.value })} placeholder="O que se espera que o aluno atinja" aria-invalid={!!erros.objetivo} />
            {erros.objetivo && <p className="mt-1 text-xs text-destructive">{erros.objetivo}</p>}
          </div>

          <div role="radiogroup" aria-label="Quem cumpre a missão">
            <span className={rotulo}>Quem cumpre *</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ESCOPOS.map(({ chave, titulo, ajuda }) => {
                const ativo = (form.escopo ?? "turma") === chave;
                return (
                  <button
                    key={chave}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={editando}
                    onClick={() => escolherEscopo(chave)}
                    className={`flex-1 min-w-[180px] rounded-[14px] border px-4 py-3 text-left ${
                      ativo ? "border-primary bg-primary/15" : "border-border hover:border-primary/50"
                    } ${editando ? "opacity-60" : ""}`}
                  >
                    <span className="block text-[13px] font-bold">{titulo}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{ajuda}</span>
                  </button>
                );
              })}
            </div>
            {erros.escopo && <p className="mt-1 text-xs text-destructive">{erros.escopo}</p>}
          </div>

          <div role="radiogroup" aria-label="Como a missão é concluída">
            <span className={rotulo}>Como ela é concluída *</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CAMINHOS.map(({ chave, titulo, ajuda }) => {
                const ativo = form.caminho === chave;
                return (
                  <button
                    key={chave}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={editando || (guilda && chave === "entrega")}
                    onClick={() => alterar({ caminho: chave })}
                    className={`flex-1 min-w-[180px] rounded-[14px] border px-4 py-3 text-left ${
                      ativo ? "border-primary bg-primary/15" : "border-border hover:border-primary/50"
                    } ${editando || (guilda && chave === "entrega") ? "opacity-60" : ""}`}
                  >
                    <span className="block text-[13px] font-bold">{titulo}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{ajuda}</span>
                  </button>
                );
              })}
            </div>
            {guilda && !editando && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">Na guilda a missão é uma meta: o progresso é a soma dos membros.</p>
            )}
            {erros.caminho && <p className="mt-1 text-xs text-destructive">{erros.caminho}</p>}
            {editando && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Isso não muda depois de criada — a de entrega tem uma atividade atrás dela. Para trocar, crie outra.
              </p>
            )}
          </div>

          {form.caminho === "entrega" ? (
            <>
              <div>
                <span className={rotulo}>Tópico *</span>
                <Select value={form.topicoId} onValueChange={(v) => alterar({ topicoId: v })} disabled={editando}>
                  <SelectTrigger className={campo} aria-label="Tópico"><SelectValue placeholder="Escolha o tópico" /></SelectTrigger>
                  <SelectContent>
                    {topicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome || `Tópico ${t.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editando && <p className="mt-1 text-[11.5px] text-muted-foreground">O tópico não muda depois de criada. Para mover, duplique a missão.</p>}
                {erros.topicoId && <p className="mt-1 text-xs text-destructive">{erros.topicoId}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="mis-prazo" className={rotulo}>Prazo (opcional)</Label>
                  <Input id="mis-prazo" type="datetime-local" className={campo} value={form.prazo} onChange={(e) => alterar({ prazo: e.target.value })} aria-invalid={!!erros.prazo} />
                  {erros.prazo && <p className="mt-1 text-xs text-destructive">{erros.prazo}</p>}
                </div>
                <div>
                  <Label htmlFor="mis-pontos" className={rotulo}>Nota máxima *</Label>
                  <Input id="mis-pontos" inputMode="numeric" className={campo} value={form.pontos} onChange={(e) => alterar({ pontos: e.target.value })} aria-invalid={!!erros.pontos} />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">É a nota da entrega, não os pontos do ranking.</p>
                  {erros.pontos && <p className="mt-1 text-xs text-destructive">{erros.pontos}</p>}
                </div>
              </div>

              <div className="max-w-[240px]">
                <Label htmlFor="mis-moedas" className={rotulo}>Moedas ao ser aprovada (opcional)</Label>
                <Input id="mis-moedas" inputMode="numeric" className={campo} value={form.moedas} onChange={(e) => alterar({ moedas: e.target.value })} aria-invalid={!!erros.moedas} />
                <p className="mt-1 text-[11.5px] text-muted-foreground">O aluno recebe as moedas só depois que você aprovar a entrega (nota de pelo menos 60%).</p>
                {erros.moedas && <p className="mt-1 text-xs text-destructive">{erros.moedas}</p>}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={rotulo}>O que ela mede *</span>
                  <Select value={form.metrica} onValueChange={(v) => alterar({ metrica: v })}>
                    <SelectTrigger className={campo} aria-label="O que ela mede"><SelectValue placeholder="Escolha a medida" /></SelectTrigger>
                    <SelectContent>
                      {metricasOferecidas.map((m) => <SelectItem key={m.chave} value={m.chave}>{m.rotulo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {definicaoDaMetrica(form.metrica) && (
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {guilda ? "Soma do que os membros da guilda fazem no período da missão." : definicaoDaMetrica(form.metrica)!.ajuda}
                    </p>
                  )}
                  {erros.metrica && <p className="mt-1 text-xs text-destructive">{erros.metrica}</p>}
                </div>
                <div>
                  <Label htmlFor="mis-alvo" className={rotulo}>
                    Alvo *{definicaoDaMetrica(form.metrica) ? ` (${definicaoDaMetrica(form.metrica)!.unidade})` : ""}
                  </Label>
                  <Input id="mis-alvo" inputMode="numeric" className={campo} value={form.alvo} onChange={(e) => alterar({ alvo: e.target.value })} aria-invalid={!!erros.alvo} />
                  {erros.alvo && <p className="mt-1 text-xs text-destructive">{erros.alvo}</p>}
                </div>
              </div>

              <div className="max-w-[240px]">
                <Label htmlFor="mis-prazo-meta" className={rotulo}>Prazo (opcional)</Label>
                <Input id="mis-prazo-meta" type="datetime-local" className={campo} value={form.prazo} onChange={(e) => alterar({ prazo: e.target.value })} aria-invalid={!!erros.prazo} />
                {erros.prazo && <p className="mt-1 text-xs text-destructive">{erros.prazo}</p>}
              </div>
            </>
          )}
        </div>

        {erroDoServidor && <p role="alert" className="text-sm text-destructive">{erroDoServidor}</p>}

        <div className="flex justify-end gap-3">
          <Button variant="outline" className="rounded-full" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button className="rounded-full font-bold" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar missão"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
