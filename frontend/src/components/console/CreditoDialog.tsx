import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, History, Sparkles, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  agruparHistorico,
  descreverResultado,
  exigeMotivo,
  exigeValor,
  montarPedidoDeCredito,
  registrarCredito,
  rotularTipo,
  type ClienteRpc,
  type GrupoDoHistorico,
  type LinhaDoHistorico,
  type TipoConcessao,
} from "@/lib/creditoDaTurma";

type Aluno = { id: string; nome: string };

type Props = {
  classeId: number | null;
  classeDescricao?: string | null;
  alunos: Aluno[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function hojeLocal(): string {
  // `toISOString()` converteria para UTC e, a noite, registraria a aula do dia
  // seguinte.
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function formatarData(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "sem data";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function CreditoDialog({
  classeId,
  classeDescricao,
  alunos,
  open,
  onOpenChange,
}: Props) {
  const [aba, setAba] = useState<"registrar" | "historico">("registrar");
  const [tipo, setTipo] = useState<TipoConcessao>("presenca_aula");
  const [data, setData] = useState(hojeLocal);
  const [pontos, setPontos] = useState("");
  const [motivo, setMotivo] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [teto, setTeto] = useState<number | null>(null);
  const [historico, setHistorico] = useState<GrupoDoHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  // A turma inteira presente e o caso comum; quem faltou o professor desmarca.
  useEffect(() => {
    if (!open) return;
    setSelecionados(new Set(alunos.map((a) => a.id)));
    setAba("registrar");
    setTipo("presenca_aula");
    setData(hojeLocal());
    setPontos("");
    setMotivo("");
  }, [open, alunos]);

  // O teto vem do banco (`app_config.credito_extra_maximo`), nao de uma
  // constante aqui: dois lugares com o mesmo limite divergem.
  useEffect(() => {
    if (!open) return;
    let vivo = true;

    void (async () => {
      const { data: linha } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "credito_extra_maximo")
        .maybeSingle();

      if (!vivo) return;
      const lido = Number(String(linha?.valor ?? "").replace(/[^0-9]/g, ""));
      setTeto(Number.isFinite(lido) && lido > 0 ? lido : null);
    })();

    return () => {
      vivo = false;
    };
  }, [open]);

  const carregarHistorico = useCallback(async () => {
    if (!classeId) return;
    setCarregandoHistorico(true);

    const { data: linhas, error } = await supabase
      .from("vw_creditos_concedidos")
      .select("id, aluno_id, nome_aluno, tipo, valor, motivo, data_credito")
      .eq("classe_id", classeId)
      .order("criado_em", { ascending: false })
      .limit(500);

    setCarregandoHistorico(false);

    if (error) {
      toast.error("Não foi possível carregar o histórico.");
      setHistorico([]);
      return;
    }

    setHistorico(agruparHistorico((linhas ?? []) as LinhaDoHistorico[]));
  }, [classeId]);

  useEffect(() => {
    if (!open || aba !== "historico") return;
    void carregarHistorico();
  }, [open, aba, carregarHistorico]);

  const todosMarcados = alunos.length > 0 && selecionados.size === alunos.length;
  const precisaDeValor = exigeValor(tipo);
  const precisaDeMotivo = exigeMotivo(tipo);

  const ajudaDoValor = useMemo(() => {
    if (tipo === "participacao_extra") {
      return teto
        ? `Quanto vale esta atividade, até ${teto} pontos.`
        : "Quanto vale esta atividade.";
    }
    if (tipo === "participacao_aula") {
      return "Participação é sempre discricionária: informe quanto vale.";
    }
    return "Em branco usa o padrão configurado da turma.";
  }, [tipo, teto]);

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function registrar() {
    const valorDigitado = pontos.trim() === "" ? null : Number(pontos);
    if (valorDigitado !== null && Number.isNaN(valorDigitado)) {
      toast.error("Pontos precisam ser um número.");
      return;
    }

    const pedido = montarPedidoDeCredito({
      classeId,
      tipo,
      // `null` = turma inteira, resolvida no banco; a lista explícita registra
      // exatamente quem o professor viu marcado.
      alunosSelecionados: todosMarcados ? null : Array.from(selecionados),
      valor: valorDigitado,
      data,
      hoje: hojeLocal(),
      motivo,
      tetoDeValor: teto,
    });

    if (pedido.erro || !pedido.pedido) {
      toast.error(pedido.erro ?? "Não foi possível montar o registro.");
      return;
    }

    setEnviando(true);
    const { concedidos, erro } = await registrarCredito(
      supabase as unknown as ClienteRpc,
      pedido.pedido,
    );
    setEnviando(false);

    if (erro) {
      toast.error(erro);
      return;
    }

    const pedidos = todosMarcados ? alunos.length : selecionados.size;
    toast.success(descreverResultado(concedidos, pedidos));

    // Não fecha depois de um ponto extra: lançar duas atividades da mesma aula
    // é o caso comum, e reabrir o diálogo perderia a data e a seleção.
    if (tipo === "participacao_extra") {
      setMotivo("");
      setPontos("");
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" /> Créditos da turma
          </DialogTitle>
          <DialogDescription>
            Turma: <span className="font-semibold">{classeDescricao ?? "—"}</span>. Os
            pontos entram no ranking como qualquer outra atividade.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1">
          <Button
            type="button"
            variant={aba === "registrar" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-8"
            onClick={() => setAba("registrar")}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Registrar
          </Button>
          <Button
            type="button"
            variant={aba === "historico" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-8"
            onClick={() => setAba("historico")}
          >
            <History className="w-3.5 h-3.5 mr-1.5" /> Histórico
          </Button>
        </div>

        {aba === "historico" ? (
          <div className="space-y-1.5">
            <ScrollArea className="h-[22rem] rounded-md border">
              <div className="p-2 space-y-1">
                {carregandoHistorico ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Carregando…
                  </p>
                ) : historico.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum crédito concedido nesta turma ainda.
                  </p>
                ) : (
                  historico.map((grupo) => (
                    <div
                      key={`${grupo.data}|${grupo.tipo}|${grupo.motivo ?? ""}`}
                      className="rounded-md border p-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {rotularTipo(grupo.tipo)}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">
                          +{grupo.pontos} pts
                        </span>
                      </div>
                      {grupo.motivo ? (
                        <p className="text-xs mt-0.5">{grupo.motivo}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatarData(grupo.data)} ·{" "}
                        {grupo.alunos === 1 ? "1 aluno" : `${grupo.alunos} alunos`}
                        {grupo.alunos === 1 ? ` · ${grupo.nomes[0]}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Cada lançamento aparece uma vez, com a soma dos pontos da turma.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="credito-tipo">O que registrar</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoConcessao)}>
                  <SelectTrigger id="credito-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presenca_aula">Presença</SelectItem>
                    <SelectItem value="participacao_aula">Participação</SelectItem>
                    <SelectItem value="participacao_extra">
                      Atividade em sala
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="credito-data">Dia da aula</Label>
                <Input
                  id="credito-data"
                  type="date"
                  value={data}
                  max={hojeLocal()}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>

            {precisaDeMotivo ? (
              <div className="space-y-1.5">
                <Label htmlFor="credito-motivo">O que foi feito</Label>
                <Input
                  id="credito-motivo"
                  placeholder="Ex.: exercício de fixação, seminário em grupo"
                  value={motivo}
                  maxLength={120}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O aluno vê esse rótulo, e é ele que separa duas atividades do mesmo
                  dia.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="credito-pontos">Pontos</Label>
              <Input
                id="credito-pontos"
                type="number"
                min={1}
                max={teto ?? undefined}
                inputMode="numeric"
                placeholder={precisaDeValor ? "obrigatório" : "padrão da turma"}
                value={pontos}
                onChange={(e) => setPontos(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{ajudaDoValor}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {precisaDeMotivo ? "Quem participou" : "Quem esteve presente"}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setSelecionados(
                      todosMarcados ? new Set() : new Set(alunos.map((a) => a.id)),
                    )
                  }
                >
                  {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                </Button>
              </div>

              <ScrollArea className="h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {alunos.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum aluno matriculado nesta turma.
                    </p>
                  ) : (
                    alunos.map((aluno) => (
                      <label
                        key={aluno.id}
                        className="flex items-center gap-3 rounded-md p-2 hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selecionados.has(aluno.id)}
                          onCheckedChange={() => alternar(aluno.id)}
                        />
                        <span className="text-sm">{aluno.nome}</span>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={registrar}
                disabled={enviando || alunos.length === 0 || selecionados.size === 0}
              >
                {enviando ? "Registrando..." : "Registrar"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CreditoDialog;
