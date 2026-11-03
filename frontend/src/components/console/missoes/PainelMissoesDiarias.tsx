import { useState } from "react";
import { Flag, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { percentualCumprido, type ResumoDasMissoesDiarias } from "./missoesDiariasApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function dataCurta(iso: string) {
  if (!iso) return "hoje";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/** Bloco do painel do professor: missões do dia por coorte e quantos já cumpriram. */
export function PainelMissoesDiarias({
  dados,
  carregando,
  erro,
  onTentar,
  onSalvarTexto,
  onExcluir,
}: {
  dados: ResumoDasMissoesDiarias | null;
  carregando: boolean;
  erro: string | null;
  onTentar: () => void;
  onSalvarTexto: (id: number, titulo: string, descricao: string, criterio: Record<string, unknown>) => Promise<void>;
  onExcluir: (id: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState<ResumoDasMissoesDiarias["missoes"][number] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [medida, setMedida] = useState("");
  const [alvo, setAlvo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<ResumoDasMissoesDiarias["missoes"][number] | null>(null);
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [erroAoExcluir, setErroAoExcluir] = useState<string | null>(null);
  const capacidade = medida === "atividade_concluida"
    ? editando?.atividadesDisponiveis ?? 0
    : medida === "conteudo_concluido"
      ? editando?.conteudosDisponiveis ?? 0
      : Number.POSITIVE_INFINITY;
  const opcoesDeAlvo = medida === "minutos_no_dia" ? [5, 10, 15, 20, 30] : [1, 2, 3, 5, 10];
  const opcoesVisiveis = opcoesDeAlvo.filter((valor) => valor <= capacidade);
  if (Number(alvo) > 0 && !opcoesVisiveis.includes(Number(alvo))) opcoesVisiveis.push(Number(alvo));

  const abrirEdicao = (missao: ResumoDasMissoesDiarias["missoes"][number]) => {
    setEditando(missao);
    setTitulo(missao.titulo);
    setDescricao(missao.descricao);
    const metricaAtual = String(missao.criterio.metrica ?? "");
    const eventoAtual = String(missao.criterio.evento ?? "");
    setMedida(metricaAtual === "minutos_no_dia" ? "minutos_no_dia" : eventoAtual || "atividade_concluida");
    setAlvo(String(missao.criterio.minutos ?? missao.criterio.minimo ?? "1"));
    setErroDoServidor(null);
  };

  const excluirMissao = async () => {
    if (!excluindo) return;
    setExcluindoAgora(true);
    try {
      await onExcluir(excluindo.id);
      setExcluindo(null);
    } catch (e) {
      setErroAoExcluir(e instanceof Error ? e.message : "Não foi possível excluir a missão diária.");
    } finally {
      setExcluindoAgora(false);
    }
  };

  const salvarTexto = async () => {
    if (!editando) return;
    const tituloLimpo = titulo.trim();
    if (tituloLimpo.length < 3) return setErroDoServidor("O título precisa ter pelo menos 3 caracteres.");
    setSalvando(true);
    setErroDoServidor(null);
    try {
      const numeroAlvo = Number(alvo);
      if (!medida || !Number.isInteger(numeroAlvo) || numeroAlvo < 1) {
        setErroDoServidor("Escolha uma medida e informe um alvo inteiro maior que zero.");
        return;
      }
      if (numeroAlvo > capacidade) {
        setErroDoServidor(`Esse alvo supera os ${capacidade} recursos disponíveis nesta turma.`);
        return;
      }
      const criterio = medida === "minutos_no_dia"
        ? { metrica: medida, minutos: numeroAlvo, dia: editando.criterio.dia }
        : {
            metrica: "eventos_no_dia",
            minimo: numeroAlvo,
            evento: medida,
            dia: editando.criterio.dia,
            fuso: editando.criterio.fuso ?? "America/Sao_Paulo",
          };
      await onSalvarTexto(editando.id, tituloLimpo, descricao.trim(), criterio);
      setEditando(null);
    } catch (e) {
      setErroDoServidor(e instanceof Error ? e.message : "Não foi possível salvar o texto da missão.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section aria-label="Missões do dia" className="rounded-[20px] border bg-card p-5">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-[15px] font-bold">Missões do dia</h2>
        {dados?.dia && <span className="text-[12px] text-muted-foreground">· {dataCurta(dados.dia)}</span>}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Geradas para cada turma. Edite o texto e a meta diária.
      </p>

      {carregando && (
        <div role="status" aria-label="Carregando missões do dia" className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {!carregando && erro && (
        <div className="mt-4 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-semibold text-destructive">Não foi possível carregar as missões do dia</p>
          <p className="mt-1 text-muted-foreground">{erro}</p>
          <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={onTentar}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erro && dados && dados.missoes.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhuma missão do dia ainda. Elas nascem à meia-noite de Brasília, depois que a cadeia da fase 5b estiver aplicada.
        </p>
      )}

      {!carregando && !erro && dados && dados.missoes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {dados.missoes.map((m) => {
            const pct = percentualCumprido(m.cumpriram, m.alunosDoPerfil);
            return (
              <li key={m.id} className="rounded-[14px] border bg-background/60 px-4 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate pt-1 text-sm font-semibold">{m.titulo}</h3>
                  <span className={`${rotulo} pt-1`}>{m.perfilAlvo ?? "todos"} · slot {m.slot}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => abrirEdicao(m)} aria-label={`Editar texto de ${m.titulo}`} title="Editar texto">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-destructive hover:text-destructive" onClick={() => { setErroAoExcluir(null); setExcluindo(m); }} aria-label={`Excluir ${m.titulo}`} title="Excluir">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {m.descricao && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{m.descricao}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
                  <span className="font-semibold">
                    {m.cumpriram}/{m.alunosDoPerfil} cumpriram · {pct}%
                  </span>
                  <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && !salvando && setEditando(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-[20px] bg-card">
          <DialogHeader>
            <DialogTitle>Editar missão diária</DialogTitle>
            <DialogDescription>Você pode ajustar o texto. O critério que mede o progresso da turma não será alterado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="missao-diaria-titulo" className="mb-1.5 block text-sm font-medium">Título</label>
              <Input id="missao-diaria-titulo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <label htmlFor="missao-diaria-descricao" className="mb-1.5 block text-sm font-medium">Descrição</label>
              <Textarea id="missao-diaria-descricao" value={descricao} maxLength={500} rows={4} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">O que mede</label>
                <Select value={medida} onValueChange={(v) => { setMedida(v); setAlvo(v === "minutos_no_dia" ? "10" : "1"); }}>
                  <SelectTrigger><SelectValue placeholder="Escolha uma medida" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutos_no_dia">Minutos de estudo</SelectItem>
                    {(editando?.atividadesDisponiveis ?? 0) > 0 && <SelectItem value="atividade_concluida">Atividades concluídas</SelectItem>}
                    {(editando?.conteudosDisponiveis ?? 0) > 0 && <SelectItem value="conteudo_concluido">Conteúdos concluídos</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Meta {medida === "minutos_no_dia" ? "de estudo" : "de conclusão"}</label>
                <Select value={alvo} onValueChange={setAlvo}>
                  <SelectTrigger aria-label="Meta diária"><SelectValue placeholder="Escolha a meta" /></SelectTrigger>
                  <SelectContent>
                    {opcoesVisiveis.map((valor) => (
                      <SelectItem key={valor} value={String(valor)}>
                        {valor} {medida === "minutos_no_dia" ? "minutos" : valor === 1 ? "conclusão" : "conclusões"}
                        {valor > capacidade ? " · acima do disponível" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {Number.isFinite(capacidade) && <p className="mt-1 text-xs text-muted-foreground">Máximo disponível nesta turma: {capacidade}.</p>}
              </div>
            </div>
            {erroDoServidor && <p role="alert" className="text-sm text-destructive">{erroDoServidor}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" disabled={salvando} onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="button" className="rounded-full" disabled={salvando} onClick={() => void salvarTexto()}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluindo !== null} onOpenChange={(aberto) => !aberto && !excluindoAgora && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir missão diária?</AlertDialogTitle>
            <AlertDialogDescription>
              “{excluindo?.titulo}” deixará de aparecer para a turma. O progresso já registrado será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {erroAoExcluir && <p role="alert" className="text-sm text-destructive">{erroAoExcluir}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoAgora}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={excluindoAgora} onClick={(e) => { e.preventDefault(); void excluirMissao(); }}>
              {excluindoAgora ? "Excluindo…" : "Excluir missão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
