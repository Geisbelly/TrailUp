import { useEffect, useId, useMemo, useState, type MutableRefObject } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CampoDeBusca, FiltrosRapidos } from "../comum/FiltrosDaLista";
import { PerfilAvatar } from "../dashboard/PerfilVisual";
import { nomeExibidoDoPerfil } from "../dashboard/perfilCores";
import { CaixaDeSelecao } from "./CaixaDeSelecao";
import { FormTermoPapel } from "./FormTermoPapel";
import { alternarUm, alternarVisiveis, estadoDaSelecao, filtrarMatriculados, formatarDesde, resumirNomes, rotuloDaContagem } from "./matriculas";
import { rotuloCurtoDoTermo, rotuloDaSituacao, type TermoDoAluno } from "./termosResponsavel";

export type Matriculado = { id: string; nome: string; email: string | null; desde: string | null };

type Filtro = "todos" | "pendentes";

const BOTAO = "rounded-full px-3 py-1.5 text-[11.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const COL = "px-3 py-2.5 align-middle";

/** Tabela de quem está na turma: encontrar, ver a situação do termo e tirar um ou vários. */
export function AbaNaTurma({
  matriculados,
  total,
  perfis,
  termos,
  erroDosTermos,
  carregando,
  erro,
  onRemover,
  onTermoSalvo,
  onIrParaAdicionar,
  cancelarConfirmacao,
}: {
  matriculados: Matriculado[];
  total: number;
  perfis: Map<string, string>;
  termos: Map<string, TermoDoAluno>;
  erroDosTermos: string | null;
  carregando: boolean;
  erro: string | null;
  /** Devolve quem não saiu, para continuar selecionado. */
  onRemover: (alunoIds: string[]) => Promise<string[]>;
  onTermoSalvo: () => void;
  onIrParaAdicionar: () => void;
  /** Preenchida enquanto há confirmação aberta: o Esc do modal cancela só ela, sem fechar a janela. */
  cancelarConfirmacao: MutableRefObject<(() => void) | null>;
}) {
  const id = useId();
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // Quem está sendo confirmado: uma linha ou a seleção inteira.
  const [confirmando, setConfirmando] = useState<string[] | null>(null);
  const [registrandoTermo, setRegistrandoTermo] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const pendente = (alunoId: string) => !erroDosTermos && rotuloCurtoDoTermo(termos.get(alunoId)).pendente;
  const qtdPendentes = useMemo(() => (erroDosTermos ? 0 : matriculados.filter((a) => rotuloCurtoDoTermo(termos.get(a.id)).pendente).length), [matriculados, termos, erroDosTermos]);
  const visiveis = useMemo(() => filtrarMatriculados(matriculados, termo, filtro === "pendentes" ? (a) => pendente(a.id) : undefined), [matriculados, termo, filtro, termos, erroDosTermos]); // eslint-disable-line react-hooks/exhaustive-deps
  const idsVisiveis = visiveis.map((a) => a.id);
  // Quem saiu da turma por outro caminho deixa de contar como selecionado.
  const selecionados = useMemo(() => new Set(matriculados.filter((a) => marcados.has(a.id)).map((a) => a.id)), [matriculados, marcados]);
  const emLote = selecionados.size > 0;
  const nomeDe = (alunoId: string) => matriculados.find((a) => a.id === alunoId)?.nome ?? "Aluno";

  const cancelar = () => {
    const unico = confirmando?.length === 1 ? confirmando[0] : null;
    setConfirmando(null);
    // Devolve o foco a quem abriu a confirmação.
    if (unico) requestAnimationFrame(() => document.getElementById(`${id}-remover-${unico}`)?.focus());
  };

  useEffect(() => {
    cancelarConfirmacao.current = confirmando ? cancelar : null;
    return () => {
      cancelarConfirmacao.current = null;
    };
  });

  const remover = async (ids: string[]) => {
    setRemovendo(true);
    try {
      const falhas = await onRemover(ids);
      setMarcados(new Set(falhas));
      setConfirmando(null);
    } finally {
      setRemovendo(false);
    }
  };

  if (erro) {
    return (
      <p role="alert" className="px-[26px] py-5 text-[13px] text-foreground">
        Não foi possível carregar os detalhes dos alunos. Detalhe: {erro}
      </p>
    );
  }
  if (carregando && matriculados.length === 0 && total > 0) {
    return (
      <div role="status" aria-label="Carregando alunos" className="flex flex-col gap-2 px-[26px] py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="console-skeleton h-12" />
        ))}
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-[26px] py-16 text-center">
        <p className="text-[15px] font-semibold text-foreground">Nenhum aluno nesta turma ainda</p>
        <p className="max-w-[380px] text-[13px] text-muted-foreground">Busque pelos alunos ligados a você ou cole uma lista de e-mails.</p>
        <button type="button" onClick={onIrParaAdicionar} className="mt-1 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar alunos
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-col gap-2.5 px-[26px] pb-3 pt-4">
        <CampoDeBusca rotulo="Buscar na turma" placeholder="Buscar por nome ou e-mail" valor={termo} onChange={setTermo} contagem={rotuloDaContagem(visiveis.length, termo)} />
        {erroDosTermos ? (
          <p role="status" className="text-[12px] text-muted-foreground">Situação do termo do responsável indisponível: {erroDosTermos}</p>
        ) : (
          qtdPendentes > 0 && (
            <FiltrosRapidos<Filtro>
              rotulo="Filtrar alunos"
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { value: "todos", label: "Todos", contagem: matriculados.length },
                { value: "pendentes", label: "Termo pendente", contagem: qtdPendentes, destaque: true },
              ]}
            />
          )
        )}
      </div>

      {/* A barra entra no lugar quando há seleção: as ações de linha ficam desligadas enquanto isso. */}
      {emLote && !confirmando && (
        <div role="region" aria-label="Ações para os alunos selecionados" className="flex flex-none flex-wrap items-center gap-3 border-y border-[hsl(var(--console-violet)/.5)] bg-[hsl(var(--console-violet)/.1)] px-[26px] py-2.5">
          <span aria-live="polite" className="text-[12.5px] font-semibold text-foreground">
            {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <button type="button" onClick={() => setConfirmando([...selecionados])} className={cn(BOTAO, "ml-auto flex items-center gap-1.5 border border-destructive/60 text-foreground hover:bg-destructive/10")}>
            <Trash2 className="h-3 w-3" aria-hidden="true" /> Remover da turma
          </button>
          <button type="button" onClick={() => setMarcados(new Set())} className={cn(BOTAO, "text-muted-foreground hover:text-foreground")}>
            Limpar seleção
          </button>
        </div>
      )}

      {confirmando && (
        <div role="alertdialog" aria-labelledby={`${id}-confirma`} aria-describedby={`${id}-efeito`} className="flex-none border-y border-destructive/50 bg-destructive/10 px-[26px] py-3.5">
          <p id={`${id}-confirma`} className="text-[13.5px] font-semibold text-foreground">
            {confirmando.length === 1 ? `Remover ${nomeDe(confirmando[0])} da turma?` : `Remover ${confirmando.length} alunos da turma?`}
          </p>
          <p id={`${id}-efeito`} className="mt-1 text-[12px] leading-normal text-foreground">
            {confirmando.length > 1 && <>{resumirNomes(confirmando.map(nomeDe))}. </>}
            {confirmando.length === 1 ? "A pessoa perde o acesso à trilha desta turma e o progresso dela aqui é apagado." : "Cada pessoa perde o acesso à trilha desta turma e o progresso dela aqui é apagado."} Isso não pode ser desfeito.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2.5">
            <button type="button" autoFocus disabled={removendo} onClick={cancelar} className={cn(BOTAO, "border border-destructive/60 px-4 py-2 text-xs text-foreground hover:bg-muted")}>
              Manter na turma
            </button>
            <button type="button" disabled={removendo} onClick={() => void remover(confirmando)} className={cn(BOTAO, "flex items-center gap-[7px] bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90")}>
              <Trash2 className="h-[13px] w-[13px]" aria-hidden="true" />
              {removendo ? "Removendo…" : confirmando.length === 1 ? "Remover da turma" : `Remover ${confirmando.length} alunos`}
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-[26px] py-10 text-center">
            <p className="text-[13px] text-muted-foreground">Nenhum aluno com esses filtros.</p>
            <button type="button" onClick={() => { setTermo(""); setFiltro("todos"); }} className={cn(BOTAO, "border border-border text-foreground hover:bg-muted")}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Alunos matriculados nesta turma</caption>
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <tr>
                <th scope="col" className="w-11 py-2.5 pl-[26px] pr-1">
                  <CaixaDeSelecao estado={estadoDaSelecao(idsVisiveis, selecionados)} rotulo="Selecionar todos os alunos visíveis" disabled={!!confirmando} onChange={() => setMarcados(alternarVisiveis(idsVisiveis, selecionados))} />
                </th>
                <th scope="col" className={cn(COL, "font-semibold")}>Aluno</th>
                <th scope="col" className={cn(COL, "hidden font-semibold md:table-cell")}>Perfil</th>
                <th scope="col" className={cn(COL, "hidden font-semibold md:table-cell")}>Desde</th>
                <th scope="col" className={cn(COL, "hidden font-semibold sm:table-cell")}>Termo</th>
                <th scope="col" className="py-2.5 pl-3 pr-[26px]"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((a) => {
                const perfil = perfis.get(a.id) ?? null;
                const rotuloPerfil = perfil ? nomeExibidoDoPerfil(perfil) : "sem perfil";
                const curto = rotuloCurtoDoTermo(termos.get(a.id));
                if (registrandoTermo === a.id) {
                  return (
                    <tr key={a.id} className="border-b border-border">
                      <td colSpan={6} className="px-[26px] py-3">
                        <FormTermoPapel
                          alunoId={a.id}
                          nomeDoAluno={a.nome}
                          semDataNascimento={termos.get(a.id)?.situacao === "sem_data_nascimento"}
                          onSalvo={() => {
                            setRegistrandoTermo(null);
                            onTermoSalvo();
                          }}
                          onCancelar={() => setRegistrandoTermo(null)}
                        />
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={a.id} className={cn("border-b border-border transition-colors", selecionados.has(a.id) ? "bg-[hsl(var(--console-violet)/.07)]" : "hover:bg-muted/50")}>
                    <td className="py-2.5 pl-[26px] pr-1 align-middle">
                      <CaixaDeSelecao estado={selecionados.has(a.id) ? "todos" : "nenhum"} rotulo={`Selecionar ${a.nome}`} disabled={!!confirmando} onChange={() => setMarcados(alternarUm(a.id, selecionados))} />
                    </td>
                    <td className={cn(COL, "w-full max-w-0")}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PerfilAvatar nome={a.nome} perfil={perfil ?? ""} tamanho={28} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{a.nome}</div>
                          <div className="truncate text-[11.5px] text-muted-foreground">{a.email ?? "sem e-mail"}</div>
                          {/* O que as colunas escondidas no celular diriam. */}
                          <div className="text-[11.5px] text-muted-foreground sm:hidden">
                            {rotuloPerfil}
                            {!erroDosTermos && <> · termo: <span className={curto.pendente ? "font-semibold text-foreground" : ""}>{curto.texto}</span></>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn(COL, "hidden whitespace-nowrap text-[12.5px] text-muted-foreground md:table-cell")}>{rotuloPerfil}</td>
                    <td className={cn(COL, "hidden whitespace-nowrap text-[12.5px] text-muted-foreground md:table-cell")}>{formatarDesde(a.desde) ?? "—"}</td>
                    <td className={cn(COL, "hidden whitespace-nowrap text-[12.5px] sm:table-cell")} title={erroDosTermos ? undefined : rotuloDaSituacao(termos.get(a.id)).texto}>
                      {erroDosTermos ? "—" : curto.pendente ? <span className="font-semibold text-[hsl(var(--console-warning-text))]">{curto.texto}</span> : <span className="text-muted-foreground">{curto.texto}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-1 pr-[26px] text-right align-middle">
                      {termos.get(a.id)?.situacao !== "maior" && (
                        <button type="button" disabled={emLote || !!confirmando} onClick={() => setRegistrandoTermo(a.id)} aria-label={`Registrar termo do responsável de ${a.nome}`} className={cn(BOTAO, "hidden text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-block")}>
                          Termo recebido
                        </button>
                      )}
                      <button id={`${id}-remover-${a.id}`} type="button" disabled={emLote || !!confirmando} onClick={() => setConfirmando([a.id])} aria-label={`Remover ${a.nome} da turma`} className={cn(BOTAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        Remover
                      </button>
                      {termos.get(a.id)?.situacao !== "maior" && (
                        <button type="button" disabled={emLote || !!confirmando} onClick={() => setRegistrandoTermo(a.id)} aria-label={`Registrar termo do responsável de ${a.nome}`} className={cn(BOTAO, "block w-full text-right text-muted-foreground hover:text-foreground sm:hidden")}>
                          Termo recebido
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
