import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DESCRICAO_MAX,
  PECAS_DO_EVENTO,
  RECOMPENSA_MAX,
  TITULO_MAX,
  validarEvento,
  type ChaveDePeca,
  type ErrosDoEvento,
  type FormularioDeEvento,
  type PayloadDoEvento,
} from "./evento";
import type { MissaoDisponivel } from "./eventosApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-background";
const SEM_TOPICO = "__turma__";

/**
 * "Novo evento" / "Editar evento". Quem monta usa `key` para remontar a cada abertura.
 * `somenteTexto`: evento já aberto ou encerrado — o banco só aceita título e descrição.
 */
export function FormularioDoEvento({
  inicial,
  editando,
  somenteTexto,
  topicos,
  missoesDisponiveis,
  salvando,
  erroDoServidor,
  onSalvar,
  onCancelar,
}: {
  inicial: FormularioDeEvento;
  editando: boolean;
  somenteTexto: boolean;
  topicos: { id: number; nome: string | null }[];
  missoesDisponiveis: MissaoDisponivel[];
  salvando: boolean;
  erroDoServidor: string | null;
  onSalvar: (payload: PayloadDoEvento, missoes: number[]) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState<ErrosDoEvento>({});
  const alterar = (parcial: Partial<FormularioDeEvento>) => setForm((f) => ({ ...f, ...parcial }));
  const alternarMissao = (id: number, ligada: boolean) =>
    alterar({ missoesIds: ligada ? [...form.missoesIds, id] : form.missoesIds.filter((m) => m !== id) });
  const alternarPeca = (chave: ChaveDePeca, ligada: boolean) =>
    alterar({ pecas: ligada ? [...form.pecas, chave] : form.pecas.filter((c) => c !== chave) });

  const salvar = () => {
    const r = validarEvento(form);
    setErros(r.erros ?? {});
    if (r.ok) onSalvar(r.payload, r.missoes);
  };
  const travado = somenteTexto || salvando;

  return (
    <Dialog open onOpenChange={(v) => !v && !salvando && onCancelar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[20px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-[22px]">{editando ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>
            {somenteTexto
              ? "Depois de aberto, o evento só aceita mudar título e descrição."
              : "O evento nasce como rascunho. Agendado, abre sozinho no começo; senão, os alunos só o veem depois que você abrir. Aberto, encerra e apura sozinho no fim."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label htmlFor="ev-titulo" className={rotulo}>Título *</Label>
            <Input id="ev-titulo" className={campo} value={form.titulo} maxLength={TITULO_MAX} disabled={salvando} onChange={(e) => alterar({ titulo: e.target.value })} aria-invalid={!!erros.titulo} />
            {erros.titulo && <p className="mt-1 text-xs text-destructive">{erros.titulo}</p>}
          </div>

          <div>
            <Label htmlFor="ev-descricao" className={rotulo}>Descrição</Label>
            <Textarea id="ev-descricao" rows={3} className={campo} value={form.descricao} maxLength={DESCRICAO_MAX} disabled={salvando} onChange={(e) => alterar({ descricao: e.target.value })} aria-invalid={!!erros.descricao} />
            {erros.descricao && <p className="mt-1 text-xs text-destructive">{erros.descricao}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ev-inicio" className={rotulo}>Começa *</Label>
              <Input id="ev-inicio" type="datetime-local" className={campo} value={form.inicio} disabled={travado} onChange={(e) => alterar({ inicio: e.target.value })} aria-invalid={!!erros.inicio} />
              {erros.inicio && <p className="mt-1 text-xs text-destructive">{erros.inicio}</p>}
            </div>
            <div>
              <Label htmlFor="ev-fim" className={rotulo}>Termina *</Label>
              <Input id="ev-fim" type="datetime-local" className={campo} value={form.fim} disabled={travado} onChange={(e) => alterar({ fim: e.target.value })} aria-invalid={!!erros.fim} />
              {erros.fim && <p className="mt-1 text-xs text-destructive">{erros.fim}</p>}
            </div>
          </div>

          <div className="rounded-[14px] border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Abrir sozinho no começo</p>
                <p className="text-[11.5px] text-muted-foreground">
                  O evento vai ao ar no horário de início, sem precisar clicar em Abrir. O fim vale sempre: no horário de término ele encerra e apura sozinho.
                </p>
              </div>
              <Switch checked={form.abrirNoInicio} onCheckedChange={(v) => alterar({ abrirNoInicio: v })} disabled={travado} aria-label="Abrir sozinho no começo" />
            </div>
          </div>

          <div>
            <span className={rotulo}>Escopo</span>
            <Select value={form.topicoId || SEM_TOPICO} onValueChange={(v) => alterar({ topicoId: v === SEM_TOPICO ? "" : v })} disabled={travado}>
              <SelectTrigger className={campo} aria-label="Escopo do evento"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_TOPICO}>Turma toda</SelectItem>
                {topicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome || `Tópico ${t.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <fieldset disabled={travado}>
            <legend className={rotulo}>O que este evento inclui *</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PECAS_DO_EVENTO.map((p) => (
                <label key={p.chave} className="flex cursor-pointer items-start gap-3 rounded-[14px] border bg-background p-3">
                  <Checkbox checked={form.pecas.includes(p.chave)} onCheckedChange={(v) => alternarPeca(p.chave, v === true)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold">{p.rotulo}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{p.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            {erros.pecas && <p className="mt-1 text-xs text-destructive">{erros.pecas}</p>}
          </fieldset>

          {form.pecas.includes("missoes") && (
            <fieldset disabled={travado} className="rounded-[14px] border bg-background p-4">
              <legend className={rotulo}>Missões do evento *</legend>
              {missoesDisponiveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta turma ainda não tem missões. Crie as missões na tela Missões e volte aqui.</p>
              ) : (
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {missoesDisponiveis.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 text-sm">
                        <Checkbox checked={form.missoesIds.includes(m.id)} onCheckedChange={(v) => alternarMissao(m.id, v === true)} />
                        <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
                        <span className="truncate text-[11.5px] text-muted-foreground">{m.topicoNome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {erros.missoes && <p className="mt-2 text-xs text-destructive">{erros.missoes}</p>}
            </fieldset>
          )}

          <div className="rounded-[14px] border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Modalidade de guilda</p>
                <p className="text-[11.5px] text-muted-foreground">A modalidade individual sempre existe. Ao abrir, as guildas ficam congeladas.</p>
              </div>
              <Switch checked={form.modalidadeGuilda} onCheckedChange={(v) => alterar({ modalidadeGuilda: v })} disabled={travado} aria-label="Modalidade de guilda" />
            </div>
            {form.modalidadeGuilda && (
              <div className="mt-3 max-w-[200px]">
                <Label htmlFor="ev-guilda" className={rotulo}>Tamanho máximo</Label>
                <Input id="ev-guilda" inputMode="numeric" className={campo} value={form.guildaTamanhoMax} disabled={travado} onChange={(e) => alterar({ guildaTamanhoMax: e.target.value })} aria-invalid={!!erros.guildaTamanhoMax} />
                {erros.guildaTamanhoMax && <p className="mt-1 text-xs text-destructive">{erros.guildaTamanhoMax}</p>}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ev-pontos" className={rotulo}>Pontos do evento</Label>
              <Input id="ev-pontos" inputMode="numeric" className={campo} value={form.pontos} disabled={travado} onChange={(e) => alterar({ pontos: e.target.value })} aria-invalid={!!erros.pontos} />
              {erros.pontos && <p className="mt-1 text-xs text-destructive">{erros.pontos}</p>}
            </div>
            <div>
              <Label htmlFor="ev-moedas" className={rotulo}>Moedas</Label>
              <Input id="ev-moedas" inputMode="numeric" className={campo} value={form.moedas} disabled={travado} onChange={(e) => alterar({ moedas: e.target.value })} aria-invalid={!!erros.moedas} />
              <p className="mt-1 text-[11.5px] text-muted-foreground">Fica registrado; o crédito na carteira do aluno ainda não existe.</p>
              {erros.moedas && <p className="mt-1 text-xs text-destructive">{erros.moedas}</p>}
            </div>
          </div>

          <div className="space-y-2 rounded-[14px] border bg-background p-4">
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={form.medalhaParticipacao || form.medalhaDestaque} disabled={travado || form.medalhaDestaque} onCheckedChange={(v) => alterar({ medalhaParticipacao: v === true })} />
              Medalha de participação (todos que participarem)
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={form.medalhaDestaque} disabled={travado} onCheckedChange={(v) => alterar({ medalhaDestaque: v === true })} />
              Medalha de destaque (resultado) — sempre junto com a de participação
            </label>
          </div>

          <div>
            <Label htmlFor="ev-recompensa" className={rotulo}>Recompensa (opcional)</Label>
            <Input id="ev-recompensa" className={campo} value={form.recompensa} maxLength={RECOMPENSA_MAX} disabled={travado} onChange={(e) => alterar({ recompensa: e.target.value })} placeholder="Ex.: sem prova surpresa na próxima semana" aria-invalid={!!erros.recompensa} />
            {erros.recompensa && <p className="mt-1 text-xs text-destructive">{erros.recompensa}</p>}
          </div>
        </div>

        {erroDoServidor && <p role="alert" className="text-sm text-destructive">{erroDoServidor}</p>}

        <div className="flex justify-end gap-3">
          <Button variant="outline" className="rounded-full" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button className="rounded-full font-bold" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : editando ? "Salvar evento" : "Criar rascunho"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
