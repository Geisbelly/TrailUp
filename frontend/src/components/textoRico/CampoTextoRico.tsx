/**
 * Campo de texto do console com fórmula, química e código (spec A): o `Textarea` de sempre, uma
 * barra (Fórmula, Química, Código) e, no rico, a prévia abaixo, desenhada como o app desenha.
 *
 * Inserir fórmula ou código liga o rico (`onFormatoChange('rico')`). O interruptor "Texto rico"
 * desfaz; se o texto já tiver fórmula ou cerca, pede confirmação, porque o aluno passaria a ver os
 * delimitadores crus.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Code2, FlaskConical, Sigma } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { temMarcacaoRica, type FormatoTexto } from "@/lib/textoRico/formatoTexto";
import { cn } from "@/lib/utils";

import { inserirCerca, inserirFormula, LINGUAGENS_DO_EDITOR, PALETA_DE_FORMULA, type Edicao } from "./edicao";
import { Formula } from "./Formula";
import { TextoRico } from "./TextoRico";

type Props = {
  id?: string;
  valor: string;
  onChange: (valor: string) => void;
  formato: FormatoTexto;
  onFormatoChange: (formato: FormatoTexto) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Classe do `Textarea` (o tema escuro do drawer). */
  classeDoCampo?: string;
  /** Alternativa curta: barra compacta e sem o interruptor (o formato é o da questão). */
  compacto?: boolean;
  "aria-label"?: string;
};

const SEM_LINGUAGEM = "__nenhuma__";

export function CampoTextoRico({
  id,
  valor,
  onChange,
  formato,
  onFormatoChange,
  placeholder,
  rows = 4,
  className,
  classeDoCampo,
  compacto = false,
  "aria-label": rotuloAcessivel,
}: Props) {
  const idGerado = useId();
  const idDoCampo = id ?? idGerado;
  const campo = useRef<HTMLTextAreaElement>(null);
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);
  const [selecaoPendente, setSelecaoPendente] = useState<Edicao | null>(null);
  const rico = formato === "rico";

  // Depois de inserir, devolve o foco e o cursor (ou a seleção) para onde a edição deixou.
  useEffect(() => {
    if (!selecaoPendente || !campo.current) return;
    campo.current.focus();
    campo.current.setSelectionRange(selecaoPendente.inicio, selecaoPendente.fim);
    setSelecaoPendente(null);
  }, [selecaoPendente]);

  const aplicar = (editar: (texto: string, inicio: number, fim: number) => Edicao) => {
    const el = campo.current;
    const inicio = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    const edicao = editar(valor, inicio, fim);
    onChange(edicao.texto);
    if (!rico) onFormatoChange("rico");
    setSelecaoPendente(edicao);
  };

  const alternarRico = (ligar: boolean) => {
    if (ligar) onFormatoChange("rico");
    else if (temMarcacaoRica(valor)) setConfirmarDesligar(true);
    else onFormatoChange("texto");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Fórmula, química e código">
        <PopoverDeFormula
          rotulo="Fórmula"
          icone={<Sigma className="h-4 w-4" />}
          inicial=""
          compacto={compacto}
          onInserir={(tex, emBloco) => aplicar((t, i, f) => inserirFormula(t, i, f, tex, emBloco))}
        />
        <PopoverDeFormula
          rotulo="Química"
          icone={<FlaskConical className="h-4 w-4" />}
          inicial="\ce{}"
          compacto={compacto}
          onInserir={(tex, emBloco) => aplicar((t, i, f) => inserirFormula(t, i, f, tex, emBloco))}
        />
        <PopoverDeCodigo compacto={compacto} onInserir={(linguagem) => aplicar((t, i, f) => inserirCerca(t, i, f, linguagem))} />
        {!compacto && (
          <div className="ml-auto flex items-center gap-2">
            <Switch id={`${idDoCampo}-rico`} checked={rico} onCheckedChange={alternarRico} />
            <Label htmlFor={`${idDoCampo}-rico`} className="text-xs text-muted-foreground">
              Texto rico
            </Label>
          </div>
        )}
      </div>

      <Textarea
        ref={campo}
        id={idDoCampo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-label={rotuloAcessivel}
        className={cn(classeDoCampo, rico && "font-mono text-[13px]")}
      />

      {rico && valor.trim() !== "" && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3" aria-live="polite">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prévia (como o aluno vê)</p>
          <TextoRico texto={valor} formato="rico" className="text-sm" />
        </div>
      )}

      <AlertDialog open={confirmarDesligar} onOpenChange={setConfirmarDesligar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o texto rico?</AlertDialogTitle>
            <AlertDialogDescription>
              Este texto tem fórmula ou código. Sem o texto rico, o aluno vê os delimitadores (\( \), ```) como estão escritos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter rico</AlertDialogCancel>
            <AlertDialogAction onClick={() => onFormatoChange("texto")}>Desligar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PopoverDeFormula({
  rotulo,
  icone,
  inicial,
  compacto,
  onInserir,
}: {
  rotulo: string;
  icone: ReactNode;
  inicial: string;
  compacto: boolean;
  onInserir: (tex: string, emBloco: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [tex, setTex] = useState(inicial);
  const [emBloco, setEmBloco] = useState(false);
  const idBase = useId();

  const inserir = () => {
    if (tex.trim() === "") return;
    onInserir(tex.trim(), emBloco);
    setAberto(false);
    setTex(inicial);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
          {icone}
          {!compacto && rotulo}
          {compacto && <span className="sr-only">{rotulo}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="flex flex-wrap gap-1">
          {PALETA_DE_FORMULA.map((item) => (
            <Button
              key={item.titulo}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              title={`${item.titulo}: ${item.tex}`}
              aria-label={item.titulo}
              onClick={() => setTex((atual) => (atual === inicial ? item.tex : `${atual} ${item.tex}`))}
            >
              {item.rotulo}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-tex`} className="text-xs">
            LaTeX
          </Label>
          <Textarea
            id={`${idBase}-tex`}
            value={tex}
            rows={2}
            className="font-mono text-xs"
            onChange={(e) => setTex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) inserir();
            }}
          />
        </div>
        <div className="min-h-10 rounded border border-border bg-background p-2 text-center" aria-live="polite">
          {tex.trim() && tex.trim() !== "\\ce{}" ? <Formula tex={tex.trim()} emBloco={emBloco} /> : <span className="text-xs text-muted-foreground">Prévia</span>}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id={`${idBase}-bloco`} checked={emBloco} onCheckedChange={(v) => setEmBloco(v === true)} />
            <Label htmlFor={`${idBase}-bloco`} className="text-xs">
              Em bloco (linha própria)
            </Label>
          </div>
          <Button type="button" size="sm" onClick={inserir} disabled={tex.trim() === ""}>
            Inserir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PopoverDeCodigo({ compacto, onInserir }: { compacto: boolean; onInserir: (linguagem: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [linguagem, setLinguagem] = useState("python");
  const idBase = useId();

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Code2 className="h-4 w-4" />
          {!compacto && "Código"}
          {compacto && <span className="sr-only">Código</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-linguagem`} className="text-xs">
            Linguagem
          </Label>
          <Select value={linguagem || SEM_LINGUAGEM} onValueChange={(v) => setLinguagem(v === SEM_LINGUAGEM ? "" : v)}>
            <SelectTrigger id={`${idBase}-linguagem`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINGUAGENS_DO_EDITOR.map((item) => (
                <SelectItem key={item.rotulo || SEM_LINGUAGEM} value={item.rotulo || SEM_LINGUAGEM} className="text-xs">
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">O texto selecionado no campo vai para dentro do bloco.</p>
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={() => {
            onInserir(linguagem);
            setAberto(false);
          }}
        >
          Inserir bloco de código
        </Button>
      </PopoverContent>
    </Popover>
  );
}
