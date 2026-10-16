import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import { FilaDeCorrecao } from "./FilaDeCorrecao";
import { PainelDeCorrecao } from "./PainelDeCorrecao";
import { contarPendentes, filtrarFila, vizinhas, type FiltroDeStatus, type LinhaDaFila } from "./fila";
import { avaliarEntrega, listarFila, traduzirErroDeNota } from "./notasApi";

const STATUS: { valor: FiltroDeStatus; rotulo: string }[] = [
  { valor: "pendentes", rotulo: "Para revisar" },
  { valor: "sem_entrega", rotulo: "Sem entrega" },
  { valor: "corrigidas", rotulo: "Já corrigidas" },
  { valor: "todas", rotulo: "Todas" },
];

const TODOS = "todos";

export default function NotasSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando: carregandoTurmas, erro: erroTurmas, recarregar } = useTurmasDoProfessor(professorId);
  const [fila, setFila] = useState<LinhaDaFila[]>([]);
  const [topicos, setTopicos] = useState<{ id: number; nome: string | null }[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");
  const [status, setStatus] = useState<FiltroDeStatus>("pendentes");
  const [topicoId, setTopicoId] = useState<number | null>(null);
  const [aberta, setAberta] = useState<LinhaDaFila | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);

  const carregarFila = useCallback(async (id: number) => {
    setEstado("carregando");
    try {
      const [linhas, t] = await Promise.all([
        listarFila(id),
        supabase.from("topicos").select("id, nome").eq("classe_id", id).order("ordem"),
      ]);
      setFila(linhas);
      setTopicos((t.data ?? []) as { id: number; nome: string | null }[]);
      setEstado("ok");
    } catch (e) {
      setDetalhe((e as { message?: string })?.message ?? "erro desconhecido");
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    setAberta(null);
    setTopicoId(null);
    if (turmaId) void carregarFila(turmaId);
  }, [turmaId, carregarFila]);

  const visiveis = useMemo(() => filtrarFila(fila, { topicoId, status }), [fila, topicoId, status]);
  const { anterior, proxima } = vizinhas(visiveis, aberta);
  const pendentes = contarPendentes(fila);

  const salvar = async (nota: number, feedback: string) => {
    if (!aberta || !turmaId) return;
    setSalvando(true);
    setErroDoServidor(null);
    try {
      await avaliarEntrega(aberta.atividadeId, aberta.alunoId, nota, feedback);
      toast.success("Avaliação salva.");
      const seguinte = proxima;
      await carregarFila(turmaId);
      setAberta(seguinte);
    } catch (e) {
      setErroDoServidor(traduzirErroDeNota(e as { code?: string; message?: string }));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <CabecalhoDePagina titulo="Notas" subtitulo="Correção de questões dissertativas e entregas que dependem de leitura." />

      {carregandoTurmas && (
        <div role="status" aria-label="Carregando" className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {erroTurmas && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erroTurmas} onTentarNovamente={() => void recarregar()} />}

      {!carregandoTurmas && !erroTurmas && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={ClipboardCheck} titulo="Crie uma turma primeiro" texto="As notas pertencem a uma turma. Crie a primeira em Turmas." />
      )}

      {!carregandoTurmas && !erroTurmas && turmaId && (
        <div className="space-y-4">
          {!aberta && (
            <div className="flex flex-wrap items-center gap-3">
              <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
                <SelectTrigger className="w-[220px] rounded-[14px]" aria-label="Turma"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.descricao || `Turma ${t.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={topicoId === null ? TODOS : String(topicoId)} onValueChange={(v) => setTopicoId(v === TODOS ? null : Number(v))}>
                <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Tópico"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os tópicos</SelectItem>
                  {topicos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome || `Tópico ${t.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
              <div role="radiogroup" aria-label="Status" className="flex gap-2">
                {STATUS.map((s) => (
                  <button key={s.valor} type="button" role="radio" aria-checked={status === s.valor} onClick={() => setStatus(s.valor)} className={`rounded-full border px-4 py-1.5 text-[12.5px] font-semibold ${status === s.valor ? "border-primary bg-primary/20" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {s.rotulo}
                  </button>
                ))}
              </div>
              {estado === "ok" && <span className="ml-auto text-xs text-muted-foreground">{pendentes === 1 ? "1 entrega para revisar" : `${pendentes} entregas para revisar`}</span>}
            </div>
          )}

          {estado === "carregando" && (
            <div role="status" aria-label="Carregando a fila" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          )}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar a fila de correção" detalhe={detalhe} onTentarNovamente={() => void carregarFila(turmaId)} />}

          {estado === "ok" && aberta && (
            <PainelDeCorrecao
              key={`${aberta.alunoId}-${aberta.atividadeId}`}
              linha={aberta}
              anterior={anterior}
              proxima={proxima}
              salvando={salvando}
              erroDoServidor={erroDoServidor}
              onSalvar={(n, f) => void salvar(n, f)}
              onIr={(l) => { setErroDoServidor(null); setAberta(l); }}
              onVoltar={() => { setErroDoServidor(null); setAberta(null); }}
            />
          )}

          {estado === "ok" && !aberta &&
            (visiveis.length === 0 ? (
              <EstadoVazioDaPagina icone={ClipboardCheck} titulo={status === "pendentes" ? "Nada para revisar." : "Nada por aqui"} texto={status === "pendentes" ? "Quando a IA corrigir uma dissertativa, ou não conseguir corrigir, ela aparece aqui para você olhar." : "Mude o filtro para ver outras entregas."} />
            ) : (
              <FilaDeCorrecao linhas={visiveis} onAbrir={(l) => { setErroDoServidor(null); setAberta(l); }} />
            ))}
        </div>
      )}
    </div>
  );
}
