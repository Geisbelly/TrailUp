import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import { CartaoDoEvento } from "./CartaoDoEvento";
import { FormularioDoEvento } from "./FormularioDoEvento";
import { FORMULARIO_DE_EVENTO_VAZIO, dataParaCampo, resumoDeAbertura, type ChaveDePeca, type FormularioDeEvento, type PayloadDoEvento } from "./evento";
import { abrirEvento, encerrarEvento, excluirEvento, listarEventos, salvarEvento, salvarTextoDoEvento, traduzirErroDeEvento, type Evento } from "./eventosApi";

type FormAberto = { inicial: FormularioDeEvento; editando: Evento | null; chave: number };
type Acao = { tipo: "abrir" | "encerrar" | "excluir"; evento: Evento };

const formularioDe = (e: Evento): FormularioDeEvento => ({
  titulo: e.titulo,
  descricao: e.descricao,
  inicio: dataParaCampo(e.inicio),
  fim: dataParaCampo(e.fim),
  topicoId: e.topicoId ? String(e.topicoId) : "",
  pecas: e.pecas as ChaveDePeca[],
  modalidadeGuilda: e.modalidadeGuilda,
  guildaTamanhoMax: e.guildaTamanhoMax ? String(e.guildaTamanhoMax) : "",
  pontos: String(e.pontos),
  moedas: String(e.moedas),
  medalhaParticipacao: e.medalhaParticipacao,
  medalhaDestaque: e.medalhaDestaque,
  recompensa: e.recompensa,
});

const TEXTOS = {
  abrir: { titulo: "Abrir evento", botao: "Abrir evento", ok: "Evento aberto.", falha: "Não foi possível abrir o evento." },
  encerrar: { titulo: "Encerrar evento", botao: "Encerrar evento", ok: "Evento encerrado.", falha: "Não foi possível encerrar o evento." },
  excluir: { titulo: "Excluir rascunho", botao: "Excluir rascunho", ok: "Rascunho excluído.", falha: "Não foi possível excluir o rascunho." },
} as const;

export default function EventosSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando: carregandoTurmas, erro: erroTurmas, recarregar } = useTurmasDoProfessor(professorId);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [topicos, setTopicos] = useState<{ id: number; nome: string | null }[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");
  const [form, setForm] = useState<FormAberto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [executando, setExecutando] = useState(false);

  const carregar = useCallback(async (id: number) => {
    setEstado("carregando");
    try {
      const [lista, t] = await Promise.all([listarEventos(id), supabase.from("topicos").select("id, nome").eq("classe_id", id).order("ordem")]);
      setEventos(lista);
      setTopicos((t.data ?? []) as { id: number; nome: string | null }[]);
      setEstado("ok");
    } catch (e) {
      setDetalhe(traduzirErroDeEvento(e, "erro desconhecido"));
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    if (turmaId) void carregar(turmaId);
  }, [turmaId, carregar]);

  const abrirNovo = () => {
    setErroDoServidor(null);
    setForm({ inicial: FORMULARIO_DE_EVENTO_VAZIO, editando: null, chave: Date.now() });
  };

  const salvar = async (payload: PayloadDoEvento) => {
    if (!turmaId) return;
    const editando = form?.editando ?? null;
    setSalvando(true);
    setErroDoServidor(null);
    try {
      if (editando && editando.status !== "rascunho") await salvarTextoDoEvento(editando.id, payload.titulo, payload.descricao);
      else await salvarEvento(turmaId, payload, editando?.id);
      setForm(null);
      toast.success(editando ? "Evento atualizado." : "Rascunho criado. Abra o evento quando estiver pronto.");
      await carregar(turmaId);
    } catch (e) {
      setErroDoServidor(traduzirErroDeEvento(e, "Não foi possível salvar o evento."));
    } finally {
      setSalvando(false);
    }
  };

  const confirmar = async () => {
    if (!acao || !turmaId) return;
    const t = TEXTOS[acao.tipo];
    setExecutando(true);
    try {
      if (acao.tipo === "abrir") await abrirEvento(acao.evento.id);
      else if (acao.tipo === "encerrar") await encerrarEvento(acao.evento.id);
      else await excluirEvento(acao.evento.id);
      toast.success(t.ok);
      setAcao(null);
      await carregar(turmaId);
    } catch (e) {
      toast.error(traduzirErroDeEvento(e, t.falha));
      console.error("Erro na ação do evento:", e);
    } finally {
      setExecutando(false);
    }
  };

  const nomeDoTopico = (id: number | null) => (id ? topicos.find((t) => t.id === id)?.nome || `Tópico ${id}` : undefined);

  return (
    <div>
      <CabecalhoDePagina
        titulo="Eventos"
        subtitulo="Janelas de tempo com missões, desafios e arena, em modalidade individual ou de guilda."
        acao={
          estado === "ok" && turmaId ? (
            <Button className="rounded-full font-bold" onClick={abrirNovo}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Novo evento
            </Button>
          ) : undefined
        }
      />

      {carregandoTurmas && (
        <div role="status" aria-label="Carregando" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}
      {erroTurmas && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erroTurmas} onTentarNovamente={() => void recarregar()} />}
      {!carregandoTurmas && !erroTurmas && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={CalendarDays} titulo="Crie uma turma primeiro" texto="Os eventos pertencem a uma turma. Crie a primeira em Turmas." />
      )}

      {!carregandoTurmas && !erroTurmas && turmaId && (
        <div className="space-y-4">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
              <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Turma"><SelectValue /></SelectTrigger>
              <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.descricao || `Turma ${t.id}`}</SelectItem>)}</SelectContent>
            </Select>
          )}

          {estado === "carregando" && <div role="status" aria-label="Carregando eventos" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar os eventos" detalhe={detalhe} onTentarNovamente={() => void carregar(turmaId)} />}

          {estado === "ok" && eventos.length === 0 && (
            <EstadoVazioDaPagina icone={CalendarDays} titulo="Nenhum evento ainda" texto="Crie o primeiro: janela, o que ele inclui, pontos e medalhas. Ele começa como rascunho." acao={{ rotulo: "Novo evento", onClick: abrirNovo }} />
          )}
          {estado === "ok" && eventos.length > 0 && (
            <ul className="space-y-3">
              {eventos.map((e) => (
                <CartaoDoEvento
                  key={e.id}
                  evento={e}
                  topicoNome={nomeDoTopico(e.topicoId)}
                  onEditar={() => { setErroDoServidor(null); setForm({ inicial: formularioDe(e), editando: e, chave: Date.now() }); }}
                  onAbrir={() => setAcao({ tipo: "abrir", evento: e })}
                  onEncerrar={() => setAcao({ tipo: "encerrar", evento: e })}
                  onExcluir={() => setAcao({ tipo: "excluir", evento: e })}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {form && (
        <FormularioDoEvento
          key={form.chave}
          inicial={form.inicial}
          editando={form.editando !== null}
          somenteTexto={form.editando !== null && form.editando.status !== "rascunho"}
          topicos={topicos}
          salvando={salvando}
          erroDoServidor={erroDoServidor}
          onSalvar={(p) => void salvar(p)}
          onCancelar={() => setForm(null)}
        />
      )}

      <AlertDialog open={acao !== null} onOpenChange={(v) => !v && !executando && setAcao(null)}>
        <AlertDialogContent className="max-w-[480px] rounded-[20px] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px]">{acao ? TEXTOS[acao.tipo].titulo : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-[13px] leading-relaxed">
                {acao?.tipo === "abrir" && (
                  <>
                    <p>Abrir “{acao.evento.titulo}” libera o evento para os alunos da turma.</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {resumoDeAbertura(acao.evento).map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  </>
                )}
                {acao?.tipo === "encerrar" && <p>Encerrar “{acao.evento.titulo}” fecha o evento. Isso não pode ser desfeito. O resultado e as medalhas ainda não são apurados automaticamente.</p>}
                {acao?.tipo === "excluir" && <p>Excluir o rascunho “{acao.evento.titulo}” remove o evento para sempre. Esta ação não pode ser desfeita.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-between">
            <AlertDialogCancel disabled={executando} className="mt-0 rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(e) => { e.preventDefault(); void confirmar(); }}
              className={`rounded-full font-bold ${acao?.tipo === "excluir" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
            >
              {executando ? "Aguarde…" : acao ? TEXTOS[acao.tipo].botao : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
