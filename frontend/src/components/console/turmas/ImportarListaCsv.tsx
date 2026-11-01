import { useId, useState } from "react";
import { FileUp } from "lucide-react";
import { lerEmailsDoCsv, planejarImportacao, type PlanoDeImportacao } from "./csvTurma";
import type { AlunoCandidato } from "./matriculas";

const botao = "rounded-full px-[14px] py-[7px] text-[12px] font-semibold transition-colors disabled:opacity-60";

/**
 * Importar a turma por CSV (#146): uma lista de e-mails vira matrículas. Só entra quem já é aluno
 * do professor (os mesmos da busca ao lado); a tela mostra o plano antes de matricular e nada é
 * criado para quem não tem conta.
 */
export function ImportarListaCsv({
  candidatos,
  matriculadosIds,
  onMatricularVarios,
}: {
  candidatos: AlunoCandidato[];
  matriculadosIds: string[];
  onMatricularVarios: (alunoIds: string[]) => Promise<void>;
}) {
  const id = useId();
  const [plano, setPlano] = useState<PlanoDeImportacao | null>(null);
  const [invalidas, setInvalidas] = useState<number[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ler = async (arquivo: File | undefined) => {
    setErro(null);
    setPlano(null);
    if (!arquivo) return;
    const lista = lerEmailsDoCsv(await arquivo.text());
    setInvalidas(lista.invalidas);
    if (lista.emails.length === 0) {
      setErro("Nenhum e-mail encontrado no arquivo. Use uma coluna \"email\" ou um e-mail por linha.");
      return;
    }
    setPlano(planejarImportacao(lista.emails, candidatos, new Set(matriculadosIds)));
  };

  const confirmar = async () => {
    if (!plano || plano.matricular.length === 0) return;
    setSalvando(true);
    try {
      await onMatricularVarios(plano.matricular.map((a) => a.id));
      setPlano(null);
      setInvalidas([]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-titulo`} className="mb-5 rounded-[14px] border border-border bg-background px-[15px] py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`${id}-titulo`} className="text-[13px] font-semibold text-foreground">Importar lista (CSV)</h3>
        <label className={`${botao} ml-auto inline-flex cursor-pointer items-center gap-1.5 border border-border text-foreground hover:bg-muted`}>
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          Escolher arquivo
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              void ler(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Uma coluna "email" (ou um e-mail por linha). Entram só alunos que já têm conta e acesso liberado para você.
      </p>

      {plano && (
        <div className="mt-3 space-y-1.5 text-[12.5px] text-foreground" aria-live="polite">
          <p>
            <strong>{plano.matricular.length}</strong> {plano.matricular.length === 1 ? "aluno será matriculado" : "alunos serão matriculados"}
            {plano.jaMatriculados.length > 0 && <> · {plano.jaMatriculados.length} já {plano.jaMatriculados.length === 1 ? "está" : "estão"} na turma</>}
          </p>
          {plano.naoEncontrados.length > 0 && (
            <p className="text-muted-foreground">
              Sem conta ou sem acesso liberado ({plano.naoEncontrados.length}): {plano.naoEncontrados.slice(0, 5).join(", ")}
              {plano.naoEncontrados.length > 5 && ` e mais ${plano.naoEncontrados.length - 5}`}
            </p>
          )}
          {invalidas.length > 0 && <p className="text-muted-foreground">Linhas sem e-mail válido: {invalidas.slice(0, 8).join(", ")}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={salvando || plano.matricular.length === 0} onClick={() => void confirmar()} className={`${botao} bg-primary text-primary-foreground`}>
              {salvando ? "Matriculando…" : `Matricular ${plano.matricular.length}`}
            </button>
            <button type="button" disabled={salvando} onClick={() => setPlano(null)} className={`${botao} border border-border text-muted-foreground hover:text-foreground`}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-[12px] text-[hsl(var(--destructive))]">
          {erro}
        </p>
      )}
    </section>
  );
}
