import { useCallback, useEffect, useState } from "react";
import { Flag, Loader2, Plus } from "lucide-react";
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
import { CartaoDaMissao } from "./CartaoDaMissao";
import { FormularioDaMissao } from "./FormularioDaMissao";
import { FORMULARIO_DE_MISSAO_VAZIO, prazoParaCampo, type FormularioDeMissao, type PayloadDaMissao } from "./missao";
import { duplicarMissao, excluirMissao, listarMissoes, salvarMissao, type Missao } from "./missoesApi";

type FormAberto = { inicial: FormularioDeMissao; editando: Missao | null; chave: number };
type Acao = { tipo: "duplicar" | "excluir"; missao: Missao };

const formularioDe = (m: Missao): FormularioDeMissao => ({
  titulo: m.titulo,
  objetivo: m.objetivo,
  topicoId: String(m.topicoId),
  prazo: prazoParaCampo(m.prazo),
  pontos: String(m.pontos),
});

const mensagem = (e: unknown, padrao: string) => (e as { message?: string })?.message?.trim() || padrao;

export default function MissoesSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando: carregandoTurmas, erro: erroTurmas, recarregar } = useTurmasDoProfessor(professorId);
  const [missoes, setMissoes] = useState<Missao[]>([]);
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
      const [lista, t] = await Promise.all([listarMissoes(id), supabase.from("topicos").select("id, nome").eq("classe_id", id).order("ordem")]);
      setMissoes(lista);
      setTopicos((t.data ?? []) as { id: number; nome: string | null }[]);
      setEstado("ok");
    } catch (e) {
      setDetalhe(mensagem(e, "erro desconhecido"));
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    if (turmaId) void carregar(turmaId);
  }, [turmaId, carregar]);

  const abrirNova = () => {
    setErroDoServidor(null);
    setForm({ inicial: FORMULARIO_DE_MISSAO_VAZIO, editando: null, chave: Date.now() });
  };

  const salvar = async (payload: PayloadDaMissao) => {
    if (!turmaId) return;
    setSalvando(true);
    setErroDoServidor(null);
    try {
      await salvarMissao(payload, form?.editando?.id);
      setForm(null);
      toast.success(form?.editando ? "Missão atualizada." : "Missão criada. Monte os itens no editor do tópico.");
      await carregar(turmaId);
    } catch (e) {
      setErroDoServidor(mensagem(e, "Não foi possível salvar a missão."));
    } finally {
      setSalvando(false);
    }
  };

  const confirmar = async () => {
    if (!acao || !turmaId) return;
    setExecutando(true);
    try {
      if (acao.tipo === "duplicar") await duplicarMissao(acao.missao.id);
      else await excluirMissao(acao.missao.id);
      toast.success(acao.tipo === "duplicar" ? "Missão duplicada." : "Missão excluída.");
      setAcao(null);
      await carregar(turmaId);
    } catch (e) {
      toast.error(acao.tipo === "duplicar" ? "Não foi possível duplicar a missão." : "Não foi possível excluir a missão. Se ela já tem entregas de alunos, o banco pode estar impedindo.");
      console.error("Erro na ação da missão:", e);
    } finally {
      setExecutando(false);
    }
  };

  return (
    <div>
      <CabecalhoDePagina
        titulo="Missões"
        subtitulo="Objetivos avaliativos com prazo e pontuação."
        acao={
          estado === "ok" && turmaId ? (
            <Button className="rounded-full font-bold" onClick={abrirNova} disabled={topicos.length === 0}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nova missão
            </Button>
          ) : undefined
        }
      />

      {carregandoTurmas && (
        <div role="status" aria-label="Carregando" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}
      {erroTurmas && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erroTurmas} onTentarNovamente={() => void recarregar()} />}
      {!carregandoTurmas && !erroTurmas && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={Flag} titulo="Crie uma turma primeiro" texto="As missões pertencem a uma turma. Crie a primeira em Turmas." />
      )}

      {!carregandoTurmas && !erroTurmas && turmaId && (
        <div className="space-y-4">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
              <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Turma"><SelectValue /></SelectTrigger>
              <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.descricao || `Turma ${t.id}`}</SelectItem>)}</SelectContent>
            </Select>
          )}

          {estado === "carregando" && <div role="status" aria-label="Carregando missões" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar as missões" detalhe={detalhe} onTentarNovamente={() => void carregar(turmaId)} />}

          {estado === "ok" && topicos.length === 0 && (
            <EstadoVazioDaPagina icone={Flag} titulo="Esta turma ainda não tem tópicos" texto="Uma missão pertence a um tópico. Monte a trilha primeiro, em Trilhas." />
          )}
          {estado === "ok" && topicos.length > 0 && missoes.length === 0 && (
            <EstadoVazioDaPagina icone={Flag} titulo="Nenhuma missão ainda" texto="Crie a primeira: objetivo, tópico, prazo e pontuação. Os itens você monta no editor do tópico." acao={{ rotulo: "Nova missão", onClick: abrirNova }} />
          )}
          {estado === "ok" && missoes.length > 0 && (
            <ul className="space-y-3">
              {missoes.map((m) => (
                <CartaoDaMissao
                  key={m.id}
                  missao={m}
                  onEditar={() => { setErroDoServidor(null); setForm({ inicial: formularioDe(m), editando: m, chave: Date.now() }); }}
                  onDuplicar={() => setAcao({ tipo: "duplicar", missao: m })}
                  onExcluir={() => setAcao({ tipo: "excluir", missao: m })}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {form && (
        <FormularioDaMissao key={form.chave} inicial={form.inicial} editando={form.editando !== null} topicos={topicos} salvando={salvando} erroDoServidor={erroDoServidor} onSalvar={(p) => void salvar(p)} onCancelar={() => setForm(null)} />
      )}

      <AlertDialog open={acao !== null} onOpenChange={(v) => !v && !executando && setAcao(null)}>
        <AlertDialogContent className="max-w-[460px] rounded-[20px] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px]">{acao?.tipo === "excluir" ? "Excluir missão" : "Duplicar missão"}</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-[13px] leading-relaxed">
              {acao?.tipo === "excluir"
                ? `Excluir “${acao.missao.titulo}” remove a missão para sempre. Entregas de alunos ligadas a ela podem ser removidas junto. Esta ação não pode ser desfeita.`
                : `Cria uma cópia de “${acao?.missao.titulo}” com as mesmas questões, prazo e pontuação, sem entregas de alunos.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-between">
            <AlertDialogCancel disabled={executando} className="mt-0 rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(e) => { e.preventDefault(); void confirmar(); }}
              className={`rounded-full font-bold ${acao?.tipo === "excluir" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
            >
              {executando ? "Aguarde…" : acao?.tipo === "excluir" ? "Excluir missão" : "Duplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
