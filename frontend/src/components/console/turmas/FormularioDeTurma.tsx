import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_NOME, validarFormulario, type CamposDaTurma, type DadosDaTurma, type ErrosDoFormulario, type ModoDoFormulario } from "./formulario";

type Materia = { id: number; nome: string | null };

const CAMPO =
  "mt-2 w-full rounded-[14px] border border-border bg-muted px-[15px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-[hsl(var(--console-violet))] focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive";

/**
 * Criar e editar turma no mesmo card inline (valor padrão 1 da análise 03).
 * Select nativo de propósito: o do Radix abre em portal e o Esc dele
 * chegaria até aqui, cancelando o formulário quando o professor só queria
 * fechar a lista.
 */
export function FormularioDeTurma({
  modo,
  inicial,
  materias,
  salvando,
  onSalvar,
  onCancelar,
}: {
  modo: ModoDoFormulario;
  inicial: CamposDaTurma;
  materias: Materia[];
  salvando: boolean;
  onSalvar: (dados: DadosDaTurma) => void;
  onCancelar: () => void;
}) {
  const [campos, setCampos] = useState(inicial);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const primeiro = useRef<HTMLInputElement>(null);
  const id = useId();
  const titulo = modo === "criar" ? "Nova turma" : "Editar turma";

  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  const mudar = (campo: keyof CamposDaTurma, valor: string) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (campo === "nome") setErros((e) => ({ ...e, nome: undefined }));
    else setErros((e) => ({ ...e, materia: undefined }));
  };

  const enviar = () => {
    const v = validarFormulario(campos, modo);
    // "in" em vez de !v.ok: o projeto não roda em strict, e aí o TS não estreita pela flag.
    if ("erros" in v) {
      setErros(v.erros);
      if (v.erros.nome) primeiro.current?.focus();
      return;
    }
    onSalvar(v.dados);
  };

  const noTeclado = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancelar();
    }
  };

  return (
    <form
      aria-labelledby={`${id}-titulo`}
      onKeyDown={noTeclado}
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      noValidate
      className="rounded-[20px] border border-[hsl(var(--console-violet))] bg-card px-[26px] py-6"
    >
      <div className="flex items-center gap-3">
        <h3 id={`${id}-titulo`} className="text-[19px] text-foreground">
          {titulo}
        </h3>
        <button
          type="button"
          onClick={onCancelar}
          aria-label={`Fechar: ${titulo.toLowerCase()}`}
          className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        <div>
          <label htmlFor={`${id}-nome`} className="console-label-sm block">
            Nome da turma
          </label>
          <input
            ref={primeiro}
            id={`${id}-nome`}
            value={campos.nome}
            maxLength={MAX_NOME + 20}
            onChange={(e) => mudar("nome", e.target.value)}
            placeholder="Ex.: Programação Web · 2026/1"
            aria-required="true"
            aria-invalid={!!erros.nome}
            aria-describedby={erros.nome ? `${id}-erro-nome` : undefined}
            className={CAMPO}
          />
          {erros.nome && (
            <p id={`${id}-erro-nome`} className="mt-1.5 text-xs text-[hsl(var(--destructive))]">
              {erros.nome}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-materia`} className="console-label-sm block">
            Matéria
          </label>
          <select
            id={`${id}-materia`}
            value={campos.materiaId}
            onChange={(e) => mudar("materiaId", e.target.value)}
            aria-invalid={!!erros.materia}
            aria-describedby={erros.materia ? `${id}-erro-materia` : undefined}
            className={cn(CAMPO, "appearance-auto")}
          >
            <option value="">Geral / sem matéria</option>
            {materias.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.nome?.trim() || `Matéria ${m.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {modo === "criar" && (
        <fieldset className="mt-4 rounded-[14px] border border-border px-4 pb-4 pt-2">
          <legend className="console-label-sm px-1">
            Nova matéria <span className="normal-case tracking-normal text-muted-foreground">(opcional)</span>
          </legend>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <div>
              <label htmlFor={`${id}-nova-nome`} className="sr-only">
                Nome da matéria nova
              </label>
              <input
                id={`${id}-nova-nome`}
                value={campos.novaMateriaNome}
                onChange={(e) => mudar("novaMateriaNome", e.target.value)}
                placeholder="Nome da matéria"
                aria-invalid={!!erros.materia}
                className={CAMPO}
              />
            </div>
            <div>
              <label htmlFor={`${id}-nova-descricao`} className="sr-only">
                Descrição da matéria nova
              </label>
              <input
                id={`${id}-nova-descricao`}
                value={campos.novaMateriaDescricao}
                onChange={(e) => mudar("novaMateriaDescricao", e.target.value)}
                placeholder="Descrição da matéria"
                className={CAMPO}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Use só se a matéria ainda não existir na lista acima.</p>
        </fieldset>
      )}
      {erros.materia && (
        <p id={`${id}-erro-materia`} role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
          {erros.materia}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {modo === "criar" && (
          <p className="max-w-[420px] text-[12.5px] leading-normal text-muted-foreground">
            Você pode matricular alunos agora ou depois, pelo botão "Matrículas" no card da turma.
          </p>
        )}
        <div className="ml-auto flex gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-full border border-border px-5 py-[11px] text-[13.5px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-full bg-primary px-[22px] py-[11px] text-[13.5px] font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar turma"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Faixa verde depois de criar (protótipo 75-86), com o próximo passo de verdade. */
export function FaixaTurmaCriada({
  nome,
  aviso,
  onMatricular,
  onFechar,
}: {
  nome: string;
  aviso: string | null;
  onMatricular: () => void;
  onFechar: () => void;
}) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-[hsl(var(--success)/.4)] bg-[hsl(var(--success)/.14)] px-5 py-4">
      <span aria-hidden="true" className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[hsl(var(--success))] text-sm font-black text-background">
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-foreground">Turma criada</div>
        <p className="mt-0.5 text-[12.5px] text-foreground">
          {nome} já aparece na lista. O próximo passo é matricular os alunos.
        </p>
        {aviso && <p className="mt-1 text-[12.5px] text-[hsl(var(--console-warning-text))]">{aviso}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onMatricular}
          className="rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Matricular alunos
        </button>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-full px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
