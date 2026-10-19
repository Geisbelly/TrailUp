import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OBJETIVO_MAX, TITULO_MAX, validarMissao, type ErrosDaMissao, type FormularioDeMissao, type PayloadDaMissao } from "./missao";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-background";

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
  onSalvar: (payload: PayloadDaMissao) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState<ErrosDaMissao>({});
  const alterar = (parcial: Partial<FormularioDeMissao>) => setForm((f) => ({ ...f, ...parcial }));

  const salvar = () => {
    const r = validarMissao(form);
    setErros(r.erros ?? {});
    if (r.ok) onSalvar(r.payload!);
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
              <Label htmlFor="mis-pontos" className={rotulo}>Pontuação máxima *</Label>
              <Input id="mis-pontos" inputMode="numeric" className={campo} value={form.pontos} onChange={(e) => alterar({ pontos: e.target.value })} aria-invalid={!!erros.pontos} />
              {erros.pontos && <p className="mt-1 text-xs text-destructive">{erros.pontos}</p>}
            </div>
          </div>

          <div className="max-w-[240px]">
            <Label htmlFor="mis-moedas" className={rotulo}>Moedas ao ser aprovada (opcional)</Label>
            <Input id="mis-moedas" inputMode="numeric" className={campo} value={form.moedas} onChange={(e) => alterar({ moedas: e.target.value })} aria-invalid={!!erros.moedas} />
            <p className="mt-1 text-[11.5px] text-muted-foreground">O aluno recebe as moedas só depois que você aprovar a entrega (nota de pelo menos 60%).</p>
            {erros.moedas && <p className="mt-1 text-xs text-destructive">{erros.moedas}</p>}
          </div>
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
