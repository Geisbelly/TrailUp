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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import { CartaoDaMissao } from "./CartaoDaMissao";
import { FormularioDaMissao } from "./FormularioDaMissao";
import { FORMULARIO_DE_MISSAO_VAZIO, prazoParaCampo, type FormularioDeMissao, type PayloadDaAtividade, type PayloadDaMissao } from "./missao";
import { CHAVE_DO_ALVO, definicaoDaMetrica } from "./criterio";
import { MOTIVO_MAX, separarPorDecisao, validarMotivoDeRecusa } from "./aprovacao";
import { decidirMissao, duplicarMissao, excluirMissao, listarMissoes, salvarMissao, type Missao } from "./missoesApi";
import { lerMissoesDiarias, type ResumoDasMissoesDiarias } from "./missoesDiariasApi";
import { PainelMissoesDiarias } from "./PainelMissoesDiarias";

type FormAberto = { inicial: FormularioDeMissao; editando: Missao | null; chave: number };
type Acao = { tipo: "duplicar" | "excluir"; missao: Missao };

const formularioDe = (m: Missao): FormularioDeMissao => ({
  caminho: m.caminho,
  titulo: m.titulo,
  objetivo: m.objetivo,
  topicoId: m.topicoId == null ? "" : String(m.topicoId),
  prazo: prazoParaCampo(m.prazo),
  pontos: m.pontos > 0 ? String(m.pontos) : "",
  moedas: m.moedas > 0 ? String(m.moedas) : "",
  // O critério já está em `missoes`; o formulário o reabre pela métrica e pelo alvo.
  metrica: metricaDoCriterio(m.criterio),
  alvo: alvoDoCriterio(m.criterio),
  escopo: m.escopo,
});

function metricaDoCriterio(criterio: unknown): string {
  const c = criterio && typeof criterio === "object" ? (criterio as Record<string, unknown>) : null;
  const metrica = String(c?.metrica ?? "");
  return definicaoDaMetrica(metrica) ? metrica : "";
}

function alvoDoCriterio(criterio: unknown): string {
  const c = criterio && typeof criterio === "object" ? (criterio as Record<string, unknown>) : null;
  const def = definicaoDaMetrica(String(c?.metrica ?? ""));
  if (!def || !c) return "";
  const v = c[CHAVE_DO_ALVO[def.chave]];
  return v == null ? "" : String(v);
}

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
  const [resumoDiario, setResumoDiario] = useState<ResumoDasMissoesDiarias | null>(null);
  const [estadoDiario, setEstadoDiario] = useState<"carregando" | "ok" | "erro">("carregando");
  const [erroDiario, setErroDiario] = useState("");
  const [decidindo, setDecidindo] = useState<number | null>(null);
  const [recusando, setRecusando] = useState<Missao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null);
  const { pendentes, demais } = separarPorDecisao(missoes);


  const carregar = useCallback(async (id: number) => {
    setEstado("carregando");
    setEstadoDiario("carregando");
    try {
      const [lista, t] = await Promise.all([listarMissoes(id), supabase.from("topicos").select("id, nome").eq("classe_id", id).order("ordem")]);
      setMissoes(lista);
      setTopicos((t.data ?? []) as { id: number; nome: string | null }[]);
      setEstado("ok");
    } catch (e) {
      setDetalhe(mensagem(e, "erro desconhecido"));
      setEstado("erro");
    }
    try {
      setResumoDiario(await lerMissoesDiarias(id));
      setEstadoDiario("ok");
      setErroDiario("");
    } catch (e) {
      setErroDiario(mensagem(e, "erro desconhecido"));
      setEstadoDiario("erro");
    }
  }, []);

  useEffect(() => {
    if (turmaId) void carregar(turmaId);
  }, [turmaId, carregar]);

  const abrirNova = () => {
    setErroDoServidor(null);
    setForm({ inicial: FORMULARIO_DE_MISSAO_VAZIO, editando: null, chave: Date.now() });
  };

  const salvar = async (missao: PayloadDaMissao, atividade: PayloadDaAtividade | null) => {
    if (!turmaId) return;
    setSalvando(true);
    setErroDoServidor(null);
    try {
      await salvarMissao(turmaId, missao, atividade, form?.editando?.id, form?.editando?.atividadeId);
      setForm(null);
      toast.success(
        form?.editando
          ? "Missão atualizada."
          : atividade
            ? "Missão criada. Monte os itens no editor do tópico."
            : "Missão criada. O app fecha sozinho quando o aluno atingir o alvo.",
      );
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
      if (acao.tipo === "duplicar") await duplicarMissao(acao.missao);
      else await excluirMissao(acao.missao.id, acao.missao.atividadeId);
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

  const aprovar = async (m: Missao) => {
    if (!turmaId) return;
    setDecidindo(m.id);
    try {
      await decidirMissao(m.id, true);
      toast.success("Missão aprovada. Ela passa a valer para os alunos.");
      await carregar(turmaId);
    } catch (e) {
      toast.error(mensagem(e, "Não foi possível aprovar a missão."));
    } finally {
      setDecidindo(null);
    }
  };

  const abrirRecusa = (m: Missao) => {
    setMotivo("");
    setErroDoMotivo(null);
    setRecusando(m);
  };

  const recusar = async () => {
    if (!recusando || !turmaId) return;
    const v = validarMotivoDeRecusa(motivo);
    if ("erro" in v) {
      setErroDoMotivo(v.erro);
      return;
    }
    setDecidindo(recusando.id);
    try {
      await decidirMissao(recusando.id, false, v.motivo);
      toast.success("Missão recusada. Nenhum aluno vai vê-la.");
      setRecusando(null);
      await carregar(turmaId);
    } catch (e) {
      setErroDoMotivo(mensagem(e, "Não foi possível recusar a missão."));
    } finally {
      setDecidindo(null);
    }
  };

  const cartao = (m: Missao) => (
    <CartaoDaMissao
      key={m.id}
      missao={m}
      onEditar={() => { setErroDoServidor(null); setForm({ inicial: formularioDe(m), editando: m, chave: Date.now() }); }}
      onDuplicar={() => setAcao({ tipo: "duplicar", missao: m })}
      onExcluir={() => setAcao({ tipo: "excluir", missao: m })}
      onAprovar={() => void aprovar(m)}
      onRecusar={() => abrirRecusa(m)}
      decidindo={decidindo === m.id}
    />
  );

  return (
    <div>
      <CabecalhoDePagina
        titulo="Missões"
        subtitulo="Entregas que você corrige, ou metas que o app fecha sozinho."
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

          <PainelMissoesDiarias
            dados={resumoDiario}
            carregando={estadoDiario === "carregando"}
            erro={estadoDiario === "erro" ? erroDiario : null}
            onTentar={() => turmaId && void carregar(turmaId)}
          />

          {estado === "carregando" && <div role="status" aria-label="Carregando missões" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar as missões" detalhe={detalhe} onTentarNovamente={() => void carregar(turmaId)} />}

          {estado === "ok" && topicos.length === 0 && (
            <EstadoVazioDaPagina icone={Flag} titulo="Esta turma ainda não tem tópicos" texto="Uma missão pertence a um tópico. Monte a trilha primeiro, em Trilhas." />
          )}
          {estado === "ok" && topicos.length > 0 && missoes.length === 0 && (
            <EstadoVazioDaPagina icone={Flag} titulo="Nenhuma missão ainda" texto="Crie a primeira: objetivo, tópico, prazo e pontuação. Os itens você monta no editor do tópico." acao={{ rotulo: "Nova missão", onClick: abrirNova }} />
          )}
          {estado === "ok" && pendentes.length > 0 && (
            <section aria-labelledby="missoes-pendentes" className="space-y-3">
              <div>
                <h2 id="missoes-pendentes" className="text-[15px] font-bold">Aguardam sua aprovação ({pendentes.length})</h2>
                <p className="text-[12.5px] text-muted-foreground">Propostas que nenhum aluno vê enquanto você não aprovar.</p>
              </div>
              <ul className="space-y-3">{pendentes.map(cartao)}</ul>
            </section>
          )}
          {estado === "ok" && demais.length > 0 && <ul className="space-y-3">{demais.map(cartao)}</ul>}
        </div>
      )}

      {form && (
        <FormularioDaMissao key={form.chave} inicial={form.inicial} editando={form.editando !== null} topicos={topicos} salvando={salvando} erroDoServidor={erroDoServidor} onSalvar={(m, a) => void salvar(m, a)} onCancelar={() => setForm(null)} />
      )}

      <AlertDialog open={recusando !== null} onOpenChange={(v) => !v && decidindo === null && setRecusando(null)}>
        <AlertDialogContent className="max-w-[460px] rounded-[20px] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px]">Recusar missão</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-[13px] leading-relaxed">
              {`“${recusando?.titulo ?? ""}” não chega aos alunos. O motivo fica registrado junto da missão.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Textarea
              aria-label="Motivo da recusa"
              rows={3}
              maxLength={MOTIVO_MAX}
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErroDoMotivo(null); }}
              placeholder="Ex.: fora do conteúdo desta turma"
              aria-invalid={!!erroDoMotivo}
              className="rounded-[14px] bg-background"
            />
            {erroDoMotivo && <p role="alert" className="mt-1 text-xs text-destructive">{erroDoMotivo}</p>}
          </div>
          <AlertDialogFooter className="gap-3 sm:justify-between">
            <AlertDialogCancel disabled={decidindo !== null} className="mt-0 rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={decidindo !== null}
              onClick={(e) => { e.preventDefault(); void recusar(); }}
              className="rounded-full bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90"
            >
              {decidindo !== null ? "Aguarde…" : "Recusar missão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
