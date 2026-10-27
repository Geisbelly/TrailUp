import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { COR_DO_PERFIL, NOME_DO_PERFIL, PERFIS_EM_ORDEM } from "../dashboard/perfilCores";
import { ICONES_DA_CONQUISTA, PALETA_DE_CORES } from "./aparencia";
import { IconeDaConquista } from "./CartaoDaConquista";
import { METRICAS, metricaPorChave } from "./criterio";
import { criterioMudou, textoDeMudancaDeCriterio } from "./textos";
import { DESCRICAO_MAX, expandirEmLinhas, NOME_MAX, type ErrosDoFormulario, type FormularioDeConquista, type LinhaDeConquista } from "./formulario";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-background";

/**
 * "Nova conquista" / "Editar conquista" (protótipo V9). Ao EDITAR, escopo e perfil ficam
 * fixos: a edição mexe numa linha só, e trocar o escopo criaria outras.
 */
export function FormularioDaConquista({
  aberto,
  inicial,
  editando,
  concedidas,
  salvando,
  erroDoServidor,
  pontosMax,
  onSalvar,
  onCancelar,
}: {
  aberto: boolean;
  inicial: FormularioDeConquista;
  editando: boolean;
  /** Quantos alunos já ganharam: se > 0, mostra o aviso de que alterar o critério não revoga. */
  concedidas: number;
  salvando: boolean;
  erroDoServidor: string | null;
  pontosMax?: number;
  onSalvar: (linhas: LinhaDeConquista[]) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  /** Linhas prontas esperando o professor confirmar a troca de critério. */
  const [pendente, setPendente] = useState<LinhaDeConquista[] | null>(null);
  const alterar = (parcial: Partial<FormularioDeConquista>) => {
    setPendente(null);
    setForm((f) => ({ ...f, ...parcial }));
  };
  const metrica = metricaPorChave(form.metrica);
  const porPerfil = form.escopo === "perfil";
  const alternarPerfil = (p: BrainHexProfileKey) =>
    alterar({ perfis: form.perfis.includes(p) ? form.perfis.filter((x) => x !== p) : [...form.perfis, p] });

  const salvar = () => {
    const r = expandirEmLinhas(form, { pontosMax });
    setErros(r.ok ? {} : r.erros!);
    if (!r.ok) return;
    // Editar o critério pede confirmação: não revoga quem já ganhou e fica no histórico.
    if (editando && criterioMudou(inicial, form)) setPendente(r.linhas!);
    else onSalvar(r.linhas!);
  };
  const aviso = pendente ? textoDeMudancaDeCriterio(form.nome, concedidas) : null;

  const pill = (ativo: boolean) =>
    `rounded-full border px-4 py-1.5 text-[12.5px] font-semibold ${ativo ? "border-primary bg-primary/20" : "border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvando && onCancelar()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-[20px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-[22px]">{editando ? "Editar conquista" : "Nova conquista"}</DialogTitle>
          <DialogDescription>Conquistas exclusivas desta turma, além das que a plataforma já traz.</DialogDescription>
        </DialogHeader>

        {editando && concedidas > 0 && (
          <div role="note" className="flex items-start gap-3 rounded-[14px] border border-warning/40 bg-warning/10 p-4 text-[12.5px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warning" aria-hidden="true" />
            <p>
              Alterar o critério não afeta quem já ganhou esta conquista — a concessão nunca é revogada. Passa a valer um critério diferente só para quem ainda não ganhou.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="conq-nome" className={rotulo}>Nome *</Label>
            <Input id="conq-nome" className={campo} value={form.nome} maxLength={NOME_MAX} onChange={(e) => alterar({ nome: e.target.value })} aria-invalid={!!erros.nome} />
            {erros.nome && <p className="mt-1 text-xs text-destructive">{erros.nome}</p>}
          </div>

          <div>
            <Label htmlFor="conq-desc" className={rotulo}>Descrição</Label>
            <Textarea id="conq-desc" rows={2} className={campo} value={form.descricao} maxLength={DESCRICAO_MAX} onChange={(e) => alterar({ descricao: e.target.value })} />
            {erros.descricao && <p className="mt-1 text-xs text-destructive">{erros.descricao}</p>}
          </div>

          <div role="radiogroup" aria-label="Ícone">
            <span className={rotulo}>Ícone</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICONES_DA_CONQUISTA.map((i) => (
                <button key={i.chave} type="button" role="radio" aria-checked={form.icone === i.chave} aria-label={i.rotulo} onClick={() => alterar({ icone: i.chave })} className={`rounded-full p-1 ${form.icone === i.chave ? "ring-2 ring-primary" : ""}`}>
                  <IconeDaConquista icone={i.chave} cor={porPerfil && form.perfis.length === 1 ? COR_DO_PERFIL[form.perfis[0]].marca : form.cor} tamanho={36} />
                </button>
              ))}
            </div>
          </div>

          <div role="radiogroup" aria-label="Cor">
            <span className={rotulo}>Cor</span>
            {porPerfil ? (
              <p className="mt-2 text-[12.5px] text-muted-foreground">Cor-assinatura do(s) perfil(is) selecionado(s), aplicada automaticamente.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {PALETA_DE_CORES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={form.cor === c} aria-label={`Cor ${c}`} onClick={() => alterar({ cor: c })} className={`h-8 w-8 rounded-full ${form.cor === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`} style={{ background: c }} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div>
              <span className={rotulo}>Métrica *</span>
              <Select value={form.metrica} onValueChange={(v) => alterar({ metrica: v as FormularioDeConquista["metrica"] })}>
                <SelectTrigger className={campo} aria-label="Métrica"><SelectValue placeholder="O que será medido" /></SelectTrigger>
                <SelectContent>
                  {METRICAS.map((m) => <SelectItem key={m.chave} value={m.chave}>{m.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
              {erros.metrica && <p className="mt-1 text-xs text-destructive">{erros.metrica}</p>}
            </div>
            {!(porPerfil && form.modoLimiar === "por_perfil" && form.perfis.length > 1) && (
              <div>
                <Label htmlFor="conq-limiar" className={rotulo}>{metrica ? `Mínimo (${metrica.unidade})` : "Mínimo"} *</Label>
                <Input id="conq-limiar" className={campo} value={form.limiar} onChange={(e) => alterar({ limiar: e.target.value })} placeholder={metrica?.aceitaTodos ? "número ou todos" : ""} aria-invalid={!!erros.limiar} />
                {erros.limiar && <p className="mt-1 text-xs text-destructive">{erros.limiar}</p>}
              </div>
            )}
          </div>

          <div role="radiogroup" aria-label="Escopo">
            <span className={rotulo}>Escopo</span>
            <div className="mt-2 flex gap-2">
              <button type="button" role="radio" aria-checked={!porPerfil} disabled={editando} onClick={() => alterar({ escopo: "geral" })} className={pill(!porPerfil)}>Geral</button>
              <button type="button" role="radio" aria-checked={porPerfil} disabled={editando} onClick={() => alterar({ escopo: "perfil" })} className={pill(porPerfil)}>Por perfil</button>
            </div>
          </div>

          {porPerfil && (
            <div>
              <span className={rotulo}>Perfis *</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PERFIS_EM_ORDEM.map((p) => (
                  <button key={p} type="button" aria-pressed={form.perfis.includes(p)} disabled={editando} onClick={() => alternarPerfil(p)} className={`${pill(form.perfis.includes(p))} flex items-center gap-2`}>
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[p].marca }} />
                    {NOME_DO_PERFIL[p]}
                  </button>
                ))}
              </div>
              {erros.perfis && <p className="mt-1 text-xs text-destructive">{erros.perfis}</p>}

              {!editando && form.perfis.length > 1 && (
                <div className="mt-3 space-y-3 rounded-[14px] bg-muted p-4">
                  <div role="radiogroup" aria-label="Limiar por perfil" className="flex flex-wrap gap-2">
                    <button type="button" role="radio" aria-checked={form.modoLimiar === "igual"} onClick={() => alterar({ modoLimiar: "igual" })} className={pill(form.modoLimiar === "igual")}>Mesmo mínimo para todos</button>
                    <button type="button" role="radio" aria-checked={form.modoLimiar === "por_perfil"} onClick={() => alterar({ modoLimiar: "por_perfil" })} className={pill(form.modoLimiar === "por_perfil")}>Um mínimo por perfil</button>
                  </div>
                  {form.modoLimiar === "por_perfil" &&
                    form.perfis.map((p) => (
                      <div key={p}>
                        <Label htmlFor={`conq-lim-${p}`} className="text-[12px]">{NOME_DO_PERFIL[p]}</Label>
                        <Input id={`conq-lim-${p}`} className={campo} value={form.limiaresPorPerfil[p] ?? ""} onChange={(e) => alterar({ limiaresPorPerfil: { ...form.limiaresPorPerfil, [p]: e.target.value } })} />
                        {erros[`limiar:${p}`] && <p className="mt-1 text-xs text-destructive">{erros[`limiar:${p}`]}</p>}
                      </div>
                    ))}
                  <p className="text-[11.5px] text-muted-foreground">Cada perfil selecionado vira uma conquista separada — uma linha por perfil, não um único registro com vários valores.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="conq-pontos" className={rotulo}>Pontos *</Label>
            <Input id="conq-pontos" inputMode="numeric" className={`${campo} max-w-[140px]`} value={form.pontos} onChange={(e) => alterar({ pontos: e.target.value })} aria-invalid={!!erros.pontos} />
            {erros.pontos && <p className="mt-1 text-xs text-destructive">{erros.pontos}</p>}
          </div>
        </div>

        {erroDoServidor && <p role="alert" className="text-sm text-destructive">{erroDoServidor}</p>}

        {aviso ? (
          <div role="alertdialog" aria-labelledby="conq-criterio-titulo" aria-describedby="conq-criterio-corpo" className="space-y-3 rounded-[14px] border border-warning/40 bg-warning/10 p-4">
            <p id="conq-criterio-titulo" className="flex items-center gap-2 text-[13px] font-semibold">
              <AlertTriangle className="h-4 w-4 flex-none text-warning" aria-hidden="true" />
              {aviso.pergunta}
            </p>
            <p id="conq-criterio-corpo" className="text-[12.5px]">{aviso.corpo}</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-full" onClick={() => setPendente(null)} disabled={salvando}>Voltar</Button>
              <Button className="rounded-full font-bold" onClick={() => onSalvar(pendente!)} disabled={salvando}>{salvando ? "Salvando…" : aviso.confirmar}</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="rounded-full" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
            <Button className="rounded-full font-bold" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar conquista"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
