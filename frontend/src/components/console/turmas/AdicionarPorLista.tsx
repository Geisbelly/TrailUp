import { useId, useState } from "react";
import { Copy, Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { baixarArquivo } from "./baixarCsv";
import { lerEmailsColados, lerEmailsDoCsv, modeloDaLista, planejarImportacao, type PlanoDeImportacao } from "./csvTurma";
import { resumirNomes, type AlunoCandidato } from "./matriculas";

const BOTAO = "rounded-full px-[14px] py-[7px] text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

type Conferencia = { plano: PlanoDeImportacao; ignorados: string[] };

/**
 * Uma lista de e-mails vira matrículas (#146): colada ou de um arquivo, as duas passam pela mesma
 * conferência. Só entra quem já é aluno do professor; nada é criado para quem não tem conta, e a tela
 * mostra o que vai acontecer com cada e-mail antes de gravar.
 */
export function AdicionarPorLista({
  candidatos,
  matriculadosIds,
  onMatricularVarios,
}: {
  candidatos: AlunoCandidato[];
  matriculadosIds: string[];
  onMatricularVarios: (alunoIds: string[]) => Promise<void>;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const conferir = (emails: string[], ignorados: string[]) => {
    if (emails.length === 0) {
      setConferencia(null);
      setErro('Nenhum e-mail encontrado. Cole um e-mail por linha ou use um arquivo com a coluna "email".');
      return;
    }
    setErro(null);
    setAviso(null);
    setConferencia({ plano: planejarImportacao(emails, candidatos, new Set(matriculadosIds)), ignorados });
  };

  const lerArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    const lista = lerEmailsDoCsv(await arquivo.text());
    conferir(lista.emails, lista.invalidas.map((n) => `linha ${n}`));
  };

  const confirmar = async () => {
    if (!conferencia || conferencia.plano.matricular.length === 0) return;
    setSalvando(true);
    try {
      await onMatricularVarios(conferencia.plano.matricular.map((a) => a.id));
      // Fica na tela o que não entrou: é a lista que ainda pede alguma ação do professor.
      const { naoEncontrados } = conferencia.plano;
      setTexto(naoEncontrados.join("\n"));
      setConferencia(null);
      if (naoEncontrados.length === 1) setAviso("1 e-mail ficou de fora e continua na lista: sem conta ou sem acesso liberado.");
      else if (naoEncontrados.length > 1) setAviso(`${naoEncontrados.length} e-mails ficaram de fora e continuam na lista: sem conta ou sem acesso liberado.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async (emails: string[]) => {
    try {
      await navigator.clipboard.writeText(emails.join("\n"));
      toast.success("E-mails copiados.");
    } catch {
      toast.error("Não foi possível copiar. Selecione os e-mails na lista.");
    }
  };

  if (conferencia) {
    const { plano, ignorados } = conferencia;
    const entram = plano.matricular.length;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-[26px] py-4" aria-live="polite">
          <h3 className="text-[13.5px] font-semibold text-foreground">Confira antes de matricular</h3>
          <GrupoDaConferencia titulo={entram === 1 ? "Vai entrar" : "Vão entrar"} quantos={entram} tom="bom" detalhe={entram > 0 ? resumirNomes(plano.matricular.map((a) => a.nome), 8) : "Ninguém desta lista pode entrar agora."} />
          {plano.jaMatriculados.length > 0 && <GrupoDaConferencia titulo="Já na turma" quantos={plano.jaMatriculados.length} tom="neutro" detalhe={resumirNomes(plano.jaMatriculados, 5)} />}
          {plano.naoEncontrados.length > 0 && (
            <GrupoDaConferencia titulo="Sem conta ou sem acesso liberado" quantos={plano.naoEncontrados.length} tom="alerta" detalhe={resumirNomes(plano.naoEncontrados, 5)}>
              <button type="button" onClick={() => void copiar(plano.naoEncontrados)} className={cn(BOTAO, "mt-2 inline-flex items-center gap-1.5 border border-border text-foreground hover:bg-muted")}>
                <Copy className="h-3 w-3" aria-hidden="true" /> Copiar estes e-mails
              </button>
            </GrupoDaConferencia>
          )}
          {ignorados.length > 0 && <GrupoDaConferencia titulo="Sem e-mail válido" quantos={ignorados.length} tom="neutro" detalhe={resumirNomes(ignorados, 5)} />}
          {erro && <p role="alert" className="text-[12px] text-[hsl(var(--destructive))]">{erro}</p>}
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-2.5 border-t border-border px-[26px] py-3">
          <button type="button" disabled={salvando} onClick={() => setConferencia(null)} className={cn(BOTAO, "border border-border text-muted-foreground hover:text-foreground")}>
            Voltar e editar
          </button>
          <button type="button" disabled={salvando || entram === 0} onClick={() => void confirmar()} className={cn(BOTAO, "bg-primary font-bold text-primary-foreground")}>
            {salvando ? "Matriculando…" : entram === 1 ? "Matricular 1 aluno" : `Matricular ${entram} alunos`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-4">
        <label htmlFor={`${id}-lista`} className="block text-[13px] font-semibold text-foreground">Cole os e-mails</label>
        <p id={`${id}-ajuda`} className="mt-0.5 text-[12px] text-muted-foreground">
          Da planilha ou de um e-mail, um por linha ou separados por vírgula. Entram só alunos que já têm conta e acesso liberado para você.
        </p>
        <textarea
          id={`${id}-lista`}
          aria-describedby={`${id}-ajuda`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          placeholder={"ana@escola.com\nbruno@escola.com"}
          className="mt-2.5 w-full resize-y rounded-[14px] border border-border bg-muted px-3.5 py-2.5 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground focus:border-[hsl(var(--console-violet))] focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={cn(BOTAO, "inline-flex cursor-pointer items-center gap-1.5 border border-border text-foreground focus-within:ring-2 focus-within:ring-ring hover:bg-muted")}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            Usar um arquivo CSV
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                void lerArquivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={() => baixarArquivo("modelo-lista-de-alunos.csv", modeloDaLista())} className={cn(BOTAO, "inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground")}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar modelo
          </button>
        </div>
        {erro && <p role="alert" className="mt-2.5 text-[12px] text-[hsl(var(--destructive))]">{erro}</p>}
        {aviso && <p role="status" className="mt-2.5 text-[12px] text-foreground">{aviso}</p>}
      </div>
      <div className="flex flex-none justify-end border-t border-border px-[26px] py-3">
        <button
          type="button"
          disabled={!texto.trim()}
          onClick={() => {
            const lida = lerEmailsColados(texto);
            conferir(lida.emails, lida.ignorados);
          }}
          className={cn(BOTAO, "bg-primary font-bold text-primary-foreground")}
        >
          Conferir lista
        </button>
      </div>
    </div>
  );
}

function GrupoDaConferencia({ titulo, quantos, tom, detalhe, children }: { titulo: string; quantos: number; tom: "bom" | "neutro" | "alerta"; detalhe: string; children?: React.ReactNode }) {
  return (
    <section className={cn("rounded-[14px] border px-3.5 py-3", tom === "bom" ? "border-[hsl(var(--success)/.5)] bg-[hsl(var(--success)/.08)]" : tom === "alerta" ? "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/.1)]" : "border-border bg-muted")}>
      <h4 className="flex items-baseline gap-2 font-sans text-[12.5px] font-semibold text-foreground">
        {titulo} <span className="font-bold">{quantos}</span>
      </h4>
      <p className="mt-1 break-words text-[12px] text-muted-foreground">{detalhe}</p>
      {children}
    </section>
  );
}
