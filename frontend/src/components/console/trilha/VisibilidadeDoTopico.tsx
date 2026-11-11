import { useEffect, useState } from "react";
import { CalendarClock, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  alteracaoDaPublicacao,
  paraCampoLocal,
  situacaoDoTopico,
  type AlteracaoDaPublicacao,
  type ComPublicacao,
  type Publicacao,
} from "./publicacaoDoTopico";

/** Selo do cartão do mapa: o que o aluno vê agora. */
export function SeloDaPublicacao({ topico }: { topico: ComPublicacao }) {
  const { estado, liberado, rotulo } = situacaoDoTopico(topico);
  const tom = liberado
    ? "bg-success/15 text-success"
    : estado === "agendado"
      ? "bg-info/15 text-info"
      : "bg-warning/15 text-warning";
  const Icone = liberado ? Eye : estado === "agendado" ? CalendarClock : EyeOff;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${tom}`}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {rotulo}
    </span>
  );
}

const OPCOES: Array<{ valor: Publicacao; titulo: string; descricao: string }> = [
  { valor: "rascunho", titulo: "Rascunho", descricao: "Só você vê. O aluno vê um card “em breve”, sem nome nem material." },
  { valor: "publicado", titulo: "Publicar agora", descricao: "Aparece na trilha do aluno assim que você confirmar." },
  { valor: "agendado", titulo: "Agendar", descricao: "Abre sozinho na data e hora escolhidas. Até lá o aluno vê só quando abre." },
];

/**
 * Escolher a visibilidade de um tópico. Publicar é a ação que mostra o material para a turma,
 * então só acontece com o clique em "Confirmar", nunca ao trocar a opção.
 */
export function VisibilidadeDoTopico({
  topico,
  aberto,
  onSalvar,
  onFechar,
}: {
  topico: (ComPublicacao & { nome: string }) | null;
  aberto: boolean;
  onSalvar: (alteracao: AlteracaoDaPublicacao) => Promise<void>;
  onFechar: () => void;
}) {
  const [escolha, setEscolha] = useState<Publicacao>("rascunho");
  const [quando, setQuando] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // O pai zera `topico` ao fechar; guardar o último evita o texto sumir durante a animação.
  const [exibido, setExibido] = useState(topico);
  if (topico && topico !== exibido) setExibido(topico);

  useEffect(() => {
    if (!aberto || !topico) return;
    const { estado, liberado } = situacaoDoTopico(topico);
    setEscolha(liberado ? "publicado" : estado);
    setQuando(estado === "agendado" && !liberado ? paraCampoLocal(topico.publicar_em) : "");
    setErro(null);
  }, [aberto, topico]);

  const confirmar = async () => {
    const alteracao = alteracaoDaPublicacao(escolha, quando);
    if ("erro" in alteracao) {
      setErro(alteracao.erro);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(alteracao);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : "Não foi possível salvar a visibilidade.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !salvando && onFechar()}>
      <AlertDialogContent className="max-w-[480px] rounded-[20px] bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>Visibilidade do tópico</AlertDialogTitle>
          <AlertDialogDescription>
            {exibido?.nome ? <strong className="text-foreground">{exibido.nome}</strong> : null}
            {exibido?.nome ? " · " : null}
            Situação atual: {exibido ? situacaoDoTopico(exibido).rotulo.toLowerCase() : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup value={escolha} onValueChange={(v) => { setEscolha(v as Publicacao); setErro(null); }} className="gap-2">
          {OPCOES.map((o) => (
            <Label
              key={o.valor}
              htmlFor={`publicacao-${o.valor}`}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${escolha === o.valor ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem id={`publicacao-${o.valor}`} value={o.valor} className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">{o.titulo}</span>
                <span className="block text-xs font-normal text-muted-foreground">{o.descricao}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {escolha === "agendado" && (
          <div className="space-y-1.5">
            <Label htmlFor="publicacao-quando">Abre em</Label>
            <Input
              id="publicacao-quando"
              type="datetime-local"
              value={quando}
              onChange={(e) => { setQuando(e.target.value); setErro(null); }}
            />
            <p className="text-[11px] text-muted-foreground">No horário deste navegador.</p>
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <Button onClick={() => void confirmar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Publicar de uma vez todos os rascunhos (e agendados) da turma: confirmação explícita. */
export function ConfirmarPublicarTodos({
  quantos,
  aberto,
  publicando,
  onConfirmar,
  onCancelar,
}: {
  quantos: number;
  aberto: boolean;
  publicando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && !publicando && onCancelar()}>
      <AlertDialogContent className="max-w-[460px] rounded-[20px] bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Publicar {quantos} {quantos === 1 ? "tópico" : "tópicos"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Os rascunhos e os agendados desta turma passam a aparecer agora na trilha de todos os alunos,
            com o material. Dá para voltar algum para rascunho depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={publicando}>Cancelar</AlertDialogCancel>
          <Button onClick={onConfirmar} disabled={publicando}>
            {publicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Publicar agora
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
