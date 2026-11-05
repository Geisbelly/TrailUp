import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SegmentedPills from "../dashboard/SegmentedPills";
import { AbaNaTurma, type Matriculado } from "./AbaNaTurma";
import { AdicionarPorBusca } from "./AdicionarPorBusca";
import { AdicionarPorLista } from "./AdicionarPorLista";
import { siglaDaTurma } from "./resumo";
import { perfilDominantePorAluno, type AlunoCandidato, type PerfilDoAluno } from "./matriculas";
import { listarTermosDaTurma, type TermoDoAluno } from "./termosResponsavel";

type Aba = "turma" | "busca" | "lista";

/**
 * Lê direto do Supabase o que o card não tem: data de matrícula
 * (classe_aluno.created_at), nome dos matriculados (de `alunos`, não da lista
 * de acesso do professor — antes quem não estivesse nela sumia do modal) e o
 * perfil dominante de todos que aparecem.
 */
function useDetalhes(turmaId: number | null, matriculadosIds: string[], candidatos: AlunoCandidato[]) {
  const [matriculados, setMatriculados] = useState<Matriculado[]>([]);
  const [perfis, setPerfis] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = [...matriculadosIds].sort().join(",");

  useEffect(() => {
    if (turmaId === null) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      const ids = chave ? chave.split(",") : [];
      const todos = [...new Set([...ids, ...candidatos.map((c) => c.id)])];
      const [matriculas, nomes, perfisDoBanco] = await Promise.all([
        supabase.from("classe_aluno").select("aluno_id, created_at").eq("classe_id", turmaId),
        ids.length ? supabase.from("alunos").select("id, nome, email").in("id", ids) : Promise.resolve({ data: [], error: null }),
        todos.length
          ? supabase.from("aluno_perfil").select("aluno_id, afinidade, perfil:perfil_id ( nome )").in("aluno_id", todos)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const falha = matriculas.error ?? nomes.error ?? perfisDoBanco.error;
      if (falha) throw new Error(falha.message);
      const desde = new Map((matriculas.data ?? []).map((m) => [m.aluno_id as string, m.created_at as string | null]));
      const porId = new Map(((nomes.data ?? []) as { id: string; nome: string | null; email: string | null }[]).map((a) => [a.id, a]));
      const lista = ids
        .map((id) => {
          const a = porId.get(id) ?? candidatos.find((c) => c.id === id);
          return { id, nome: a?.nome?.trim() || "Aluno", email: a?.email ?? null, desde: desde.get(id) ?? null };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      return { lista, perfis: perfilDominantePorAluno((perfisDoBanco.data ?? []) as unknown as PerfilDoAluno[]) };
    })()
      .then((r) => {
        if (!vivo) return;
        setMatriculados(r.lista);
        setPerfis(r.perfis);
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os alunos."))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [turmaId, chave, candidatos]);

  return { matriculados, perfis, carregando, erro };
}

/** Situação do termo do responsável por aluno (#195). Nunca traz a data de nascimento. */
function useTermos(turmaId: number | null, chave: string) {
  const [termos, setTermos] = useState<Map<string, TermoDoAluno>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (turmaId === null) return;
    let vivo = true;
    setErro(null);
    listarTermosDaTurma(turmaId)
      .then((lista) => vivo && setTermos(new Map(lista.map((t) => [t.aluno_id, t]))))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os termos."));
    return () => {
      vivo = false;
    };
  }, [turmaId, chave, versao]);

  return { termos, erro, recarregar: () => setVersao((v) => v + 1) };
}

export function ModalMatriculas({
  turma,
  candidatos,
  matriculadosIds,
  onMatricularVarios,
  onRemover,
  onFechar,
}: {
  turma: { id: number; descricao: string | null } | null;
  candidatos: AlunoCandidato[];
  matriculadosIds: string[];
  /** Um INSERT só: entram todos ou nenhum. Em erro, rejeita com a mensagem para mostrar na tela. */
  onMatricularVarios: (alunoIds: string[]) => Promise<void>;
  /** Remove um a um e devolve quem não saiu. */
  onRemover: (alunoIds: string[]) => Promise<string[]>;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>("turma");
  const celular = useIsMobile();
  const cancelarConfirmacao = useRef<(() => void) | null>(null);
  const { matriculados, perfis, carregando, erro } = useDetalhes(turma?.id ?? null, matriculadosIds, candidatos);
  const termosDaTurma = useTermos(turma?.id ?? null, [...matriculadosIds].sort().join(","));
  const nome = turma?.descricao?.trim() || (turma ? `Turma ${turma.id}` : "");

  // Turma vazia abre direto em adicionar: não há o que ver na outra aba.
  const turmaAberta = turma?.id ?? null;
  useEffect(() => {
    if (turmaAberta !== null) setAba(matriculadosIds.length === 0 ? "busca" : "turma");
    // Só ao trocar de turma: matricular o primeiro aluno não pode tirar o professor de onde está.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmaAberta]);

  return (
    <Dialog open={!!turma} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        // Esc com uma remoção sendo confirmada cancela só a confirmação.
        onEscapeKeyDown={(e) => {
          if (cancelarConfirmacao.current) {
            e.preventDefault();
            cancelarConfirmacao.current();
          }
        }}
        // Altura fixa: trocar de aba ou filtrar não pode fazer a janela pular.
        className="flex h-[88vh] max-w-[860px] flex-col gap-0 overflow-hidden rounded-[20px] border-[hsl(var(--console-violet))] bg-card p-0"
      >
        <div className="flex flex-none items-center gap-3.5 px-[26px] pb-3.5 pt-[22px] pr-14">
          <span
            aria-hidden="true"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[hsl(var(--console-violet)/.16)] text-xs font-extrabold text-[hsl(var(--console-violet-text))]"
          >
            {siglaDaTurma(turma?.descricao)}
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--console-violet-text))]">Matrículas</div>
            <DialogTitle className="mt-[3px] truncate text-xl leading-tight">{nome}</DialogTitle>
            <DialogDescription className="sr-only">Veja quem está na turma, adicione e remova alunos. As alterações valem na hora.</DialogDescription>
          </div>
        </div>
        <div className="flex-none border-b border-border px-[26px] pb-3">
          <SegmentedPills<Aba>
            ariaLabel="O que fazer nesta turma"
            className="w-fit"
            valor={aba}
            onChange={setAba}
            opcoes={[
              { value: "turma", label: `Na turma (${matriculadosIds.length})` },
              // No celular os rótulos inteiros jogariam a última aba para fora da tela.
              { value: "busca", label: celular ? "Buscar" : "Adicionar por busca" },
              { value: "lista", label: celular ? "Lista" : "Colar ou importar lista" },
            ]}
          />
        </div>

        {aba === "turma" ? (
          <AbaNaTurma
            key={turmaAberta ?? "nenhuma"}
            matriculados={matriculados}
            total={matriculadosIds.length}
            perfis={perfis}
            termos={termosDaTurma.termos}
            erroDosTermos={termosDaTurma.erro}
            carregando={carregando}
            erro={erro}
            onRemover={onRemover}
            onTermoSalvo={termosDaTurma.recarregar}
            onIrParaAdicionar={() => setAba("busca")}
            cancelarConfirmacao={cancelarConfirmacao}
          />
        ) : aba === "busca" ? (
          <AdicionarPorBusca key={turmaAberta ?? "nenhuma"} candidatos={candidatos} matriculadosIds={matriculadosIds} perfis={perfis} onMatricularVarios={onMatricularVarios} />
        ) : (
          <AdicionarPorLista key={turmaAberta ?? "nenhuma"} candidatos={candidatos} matriculadosIds={matriculadosIds} onMatricularVarios={onMatricularVarios} />
        )}
      </DialogContent>
    </Dialog>
  );
}
