import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CampoDeBusca } from "../comum/FiltrosDaLista";
import { PerfilAvatar } from "../dashboard/PerfilVisual";
import { nomeExibidoDoPerfil } from "../dashboard/perfilCores";
import { CaixaDeSelecao } from "./CaixaDeSelecao";
import { alternarUm, alternarVisiveis, buscarAlunos, estadoDaSelecao, rotuloDaContagem, type AlunoCandidato } from "./matriculas";

/** Busca e marca vários de uma vez. Quem já está na turma aparece no fim, sem caixa, para explicar por que não dá para marcar. */
export function AdicionarPorBusca({
  candidatos,
  matriculadosIds,
  perfis,
  onMatricularVarios,
}: {
  candidatos: AlunoCandidato[];
  matriculadosIds: string[];
  perfis: Map<string, string>;
  onMatricularVarios: (alunoIds: string[]) => Promise<void>;
}) {
  const [termo, setTermo] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const resultados = useMemo(() => buscarAlunos(candidatos, termo, new Set(matriculadosIds)), [candidatos, termo, matriculadosIds]);
  const elegiveis = resultados.filter((a) => !a.jaMatriculado).map((a) => a.id);

  // Quem acabou de entrar na turma deixa de contar como marcado.
  useEffect(() => {
    setMarcados((atual) => new Set([...atual].filter((id) => !matriculadosIds.includes(id))));
  }, [matriculadosIds]);

  const matricular = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await onMatricularVarios([...marcados]);
      setMarcados(new Set());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none px-[26px] pb-3 pt-4">
        <CampoDeBusca rotulo="Buscar alunos para matricular" placeholder="Buscar por nome ou e-mail" valor={termo} onChange={setTermo} contagem={rotuloDaContagem(resultados.length, termo)} />
      </div>

      {candidatos.length === 0 ? (
        <p className="px-[26px] py-10 text-center text-[13px] text-muted-foreground">Nenhum aluno com acesso liberado para você ainda.</p>
      ) : resultados.length === 0 ? (
        <p className="px-[26px] py-10 text-center text-[13px] text-muted-foreground">Nenhum aluno encontrado com “{termo.trim()}”.</p>
      ) : (
        <>
          {elegiveis.length > 0 && (
            <label className="flex flex-none cursor-pointer items-center gap-3 border-b border-border px-[26px] pb-2.5 text-[12px] font-semibold text-muted-foreground">
              <CaixaDeSelecao estado={estadoDaSelecao(elegiveis, marcados)} rotulo={`Selecionar os ${elegiveis.length} alunos da lista`} onChange={() => setMarcados(alternarVisiveis(elegiveis, marcados))} />
              <span aria-hidden="true">Selecionar {elegiveis.length === 1 ? "o aluno" : `os ${elegiveis.length} alunos`} da lista</span>
            </label>
          )}
          <ul aria-label="Alunos que você pode matricular" className="min-h-0 flex-1 overflow-y-auto">
            {resultados.map((a) => {
              const perfil = perfis.get(a.id) ?? "";
              const conteudo = (
                <>
                  <PerfilAvatar nome={a.nome} perfil={perfil} tamanho={28} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13.5px] font-semibold", a.jaMatriculado ? "text-muted-foreground" : "text-foreground")}>{a.nome}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{[a.email, perfil ? nomeExibidoDoPerfil(perfil) : "sem perfil"].filter(Boolean).join(" · ")}</span>
                  </span>
                </>
              );
              return a.jaMatriculado ? (
                <li key={a.id} className="flex items-center gap-3 border-b border-border px-[26px] py-2.5 pl-[54px]">
                  {conteudo}
                  <span className="flex-none text-[11.5px] font-semibold text-muted-foreground">Já na turma</span>
                </li>
              ) : (
                <li key={a.id} className={cn("border-b border-border transition-colors", marcados.has(a.id) ? "bg-[hsl(var(--console-violet)/.07)]" : "hover:bg-muted/50")}>
                  <label className="flex cursor-pointer items-center gap-3 px-[26px] py-2.5">
                    <CaixaDeSelecao estado={marcados.has(a.id) ? "todos" : "nenhum"} rotulo={`Selecionar ${a.nome}`} onChange={() => setMarcados(alternarUm(a.id, marcados))} />
                    {conteudo}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {erro && <p role="alert" className="flex-none px-[26px] pt-2 text-[12px] text-[hsl(var(--destructive))]">{erro}</p>}
      {marcados.size > 0 && (
        <div className="flex flex-none flex-wrap items-center gap-3 border-t border-border px-[26px] py-3">
          <span aria-live="polite" className="text-[12.5px] font-semibold text-foreground">
            {marcados.size} {marcados.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <button type="button" disabled={salvando} onClick={() => setMarcados(new Set())} className="ml-auto rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Limpar
          </button>
          <button type="button" disabled={salvando} onClick={() => void matricular()} className="rounded-full bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {salvando ? "Matriculando…" : marcados.size === 1 ? "Matricular 1 aluno" : `Matricular ${marcados.size} alunos`}
          </button>
        </div>
      )}
    </div>
  );
}
