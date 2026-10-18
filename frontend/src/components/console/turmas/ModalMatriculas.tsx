import { useEffect, useId, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PerfilAvatar } from "../dashboard/PerfilVisual";
import { nomeExibidoDoPerfil } from "../dashboard/perfilCores";
import { siglaDaTurma } from "./resumo";
import {
  buscarAlunos,
  formatarDesde,
  perfilDominantePorAluno,
  rotuloDaContagem,
  type AlunoCandidato,
  type PerfilDoAluno,
} from "./matriculas";

type Matriculado = { id: string; nome: string; email: string | null; desde: string | null };

const BOTAO =
  "rounded-full px-[13px] py-1.5 text-[11.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

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

export function ModalMatriculas({
  turma,
  candidatos,
  matriculadosIds,
  onMatricular,
  onRemover,
  onFechar,
}: {
  turma: { id: number; descricao: string | null } | null;
  candidatos: AlunoCandidato[];
  matriculadosIds: string[];
  onMatricular: (alunoId: string) => Promise<void>;
  onRemover: (alunoId: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const id = useId();
  const { matriculados, perfis, carregando, erro } = useDetalhes(turma?.id ?? null, matriculadosIds, candidatos);
  const nome = turma?.descricao?.trim() || (turma ? `Turma ${turma.id}` : "");
  const resultados = useMemo(() => buscarAlunos(candidatos, termo, new Set(matriculadosIds)), [candidatos, termo, matriculadosIds]);

  useEffect(() => {
    setTermo("");
    setConfirmando(null);
  }, [turma?.id]);

  const perfilDe = (alunoId: string) => perfis.get(alunoId) ?? null;
  const rotuloDoPerfil = (alunoId: string) => (perfilDe(alunoId) ? nomeExibidoDoPerfil(perfilDe(alunoId)!) : "sem perfil");

  const cancelarRemocao = (alunoId: string) => {
    setConfirmando(null);
    // Devolve o foco a quem abriu a confirmação.
    requestAnimationFrame(() => document.getElementById(`${id}-remover-${alunoId}`)?.focus());
  };

  const executar = async (alunoId: string, acao: (id: string) => Promise<void>) => {
    setOcupado(alunoId);
    try {
      await acao(alunoId);
      setConfirmando(null);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Dialog open={!!turma} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        // Esc com uma remoção sendo confirmada cancela só a confirmação.
        onEscapeKeyDown={(e) => {
          if (confirmando) {
            e.preventDefault();
            cancelarRemocao(confirmando);
          }
        }}
        className="flex max-h-[88vh] max-w-[620px] flex-col gap-0 overflow-hidden rounded-[20px] border-[hsl(var(--console-violet))] bg-card p-0"
      >
        <div className="flex flex-none items-center gap-3.5 border-b border-border px-[26px] pb-[18px] pt-[22px] pr-14">
          <span
            aria-hidden="true"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[hsl(var(--console-violet)/.16)] text-xs font-extrabold text-[hsl(var(--console-violet-text))]"
          >
            {siglaDaTurma(turma?.descricao)}
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--console-violet-text))]">Matrículas</div>
            <DialogTitle className="mt-[3px] truncate text-xl leading-tight">{nome}</DialogTitle>
            <DialogDescription className="sr-only">Matricule e remova alunos desta turma.</DialogDescription>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-[26px] pt-5">
            <label htmlFor={`${id}-busca`} className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Adicionar aluno
            </label>
            <div className="mt-[9px] flex items-center gap-2.5 rounded-[14px] border border-border bg-muted px-[15px] py-[11px] focus-within:border-[hsl(var(--console-violet))] focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
              <input
                id={`${id}-busca`}
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                aria-describedby={`${id}-contagem`}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <span id={`${id}-contagem`} aria-live="polite" className="flex-none text-[11.5px] text-muted-foreground">
                {rotuloDaContagem(resultados.length, termo)}
              </span>
            </div>
            <ul aria-label="Alunos que você pode matricular" className="mt-2 max-h-[220px] overflow-y-auto rounded-[14px] border border-border bg-background">
              {candidatos.length === 0 ? (
                <li className="px-[15px] py-3 text-[13px] text-muted-foreground">Nenhum aluno com acesso liberado para você ainda.</li>
              ) : resultados.length === 0 ? (
                <li className="px-[15px] py-3 text-[13px] text-muted-foreground">Nenhum aluno encontrado com “{termo.trim()}”.</li>
              ) : (
                resultados.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-t border-border px-[15px] py-[11px] first:border-t-0">
                    <PerfilAvatar nome={a.nome} perfil={perfilDe(a.id) ?? ""} tamanho={28} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[13.5px] font-semibold", a.jaMatriculado ? "text-muted-foreground" : "text-foreground")}>{a.nome}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {a.jaMatriculado ? "já matriculado nesta turma" : [a.email, rotuloDoPerfil(a.id)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {!a.jaMatriculado && (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void executar(a.id, onMatricular)}
                        aria-label={`Matricular ${a.nome}`}
                        className={cn(BOTAO, "border border-[hsl(var(--console-violet))] bg-[hsl(var(--console-violet)/.16)] text-[hsl(var(--console-violet-text))]")}
                      >
                        {ocupado === a.id ? "Matriculando…" : "Matricular"}
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex items-center gap-2.5 px-[26px] pb-1.5 pt-5">
            <h3 id={`${id}-matriculados`} className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Alunos matriculados
            </h3>
            <span className="rounded-full bg-muted px-2.5 py-[3px] text-[11.5px] font-bold text-foreground">{matriculadosIds.length}</span>
          </div>
          <div className="px-[26px] pb-5">
            {erro ? (
              <p role="alert" className="text-[13px] text-foreground">
                Não foi possível carregar os detalhes dos alunos. Detalhe: {erro}
              </p>
            ) : carregando && matriculados.length === 0 && matriculadosIds.length > 0 ? (
              <div className="h-14 animate-pulse rounded-[14px] bg-muted" />
            ) : matriculadosIds.length === 0 ? (
              <p className="rounded-[14px] bg-muted px-3.5 py-4 text-center text-[13px] text-muted-foreground">Nenhum aluno matriculado nesta turma.</p>
            ) : (
              <ul aria-labelledby={`${id}-matriculados`} className="flex flex-col gap-2">
                {matriculados.map((a) => {
                  const desde = formatarDesde(a.desde);
                  return (
                    <li key={a.id}>
                      {confirmando === a.id ? (
                        <div role="group" aria-labelledby={`${id}-confirma-${a.id}`} className="rounded-[14px] border border-destructive/50 bg-destructive/10 px-[15px] py-[13px]">
                          <div className="flex items-center gap-3">
                            <PerfilAvatar nome={a.nome} perfil={perfilDe(a.id) ?? ""} tamanho={28} />
                            <div className="min-w-0 flex-1">
                              <div id={`${id}-confirma-${a.id}`} className="text-[13.5px] font-semibold text-foreground">
                                Remover {a.nome} da turma?
                              </div>
                              <p className="mt-[3px] text-[11.5px] leading-normal text-foreground">
                                Ele perde o acesso à trilha desta turma e o progresso dele aqui é apagado.
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2.5">
                            <button
                              type="button"
                              autoFocus
                              disabled={ocupado === a.id}
                              onClick={() => cancelarRemocao(a.id)}
                              className={cn(BOTAO, "border border-destructive/60 px-4 py-2 text-xs text-foreground hover:bg-muted")}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={ocupado === a.id}
                              onClick={() => void executar(a.id, onRemover)}
                              className={cn(BOTAO, "flex items-center gap-[7px] bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90")}
                            >
                              <Trash2 className="h-[13px] w-[13px]" aria-hidden="true" />
                              {ocupado === a.id ? "Removendo…" : "Remover mesmo assim"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 rounded-[14px] bg-muted px-3.5 py-[11px]">
                          <PerfilAvatar nome={a.nome} perfil={perfilDe(a.id) ?? ""} tamanho={28} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-semibold text-foreground">{a.nome}</div>
                            <div className="truncate text-[11.5px] text-muted-foreground">
                              {[a.email, [rotuloDoPerfil(a.id), desde && `desde ${desde}`].filter(Boolean).join(" · ")].filter(Boolean).join(" — ")}
                            </div>
                          </div>
                          <button
                            id={`${id}-remover-${a.id}`}
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() => setConfirmando(a.id)}
                            aria-label={`Remover ${a.nome} da turma`}
                            className={cn(BOTAO, "text-muted-foreground hover:bg-card hover:text-foreground")}
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-3 border-t border-border px-[26px] py-4">
          <p className="text-[11.5px] text-muted-foreground">Alterações de matrícula são aplicadas na hora.</p>
          <button
            type="button"
            onClick={onFechar}
            className="ml-auto rounded-full border border-border bg-muted px-[22px] py-2.5 text-[13.5px] font-semibold text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
