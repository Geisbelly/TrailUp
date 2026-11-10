import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Loader2, RefreshCw, RotateCcw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { COR_DO_PERFIL, NOME_DO_PERFIL } from "../dashboard/perfilCores";
import {
  agruparPorTopicoEPerfil,
  itensParaDecidir,
  mensagemDoErro,
  resumir,
  rotuloDaDecisao,
  textoDaConfirmacao,
  type Decisao,
  type EstadoDoGrupo,
  type GrupoAprovacao,
  type RegistroAprovacao,
} from "./aprovacao";
import { decidirAprovacao, lerAprovacoesDaTurma } from "./aprovacaoApi";

type Topico = { id: number; nome: string | null };

type PedidoDeDecisao = {
  decisao: Decisao;
  registros: RegistroAprovacao[];
  escopo: string;
};

const ESTADO_VISUAL: Record<EstadoDoGrupo, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Esperando sua aprovação", classe: "border-warning/50 text-warning" },
  aprovado: { rotulo: "Aprovado · aluno vê", classe: "border-success/50 text-success" },
  recusado: { rotulo: "Recusado · aluno não vê", classe: "border-destructive/50 text-destructive" },
  misto: { rotulo: "Parte aprovada", classe: "border-info/50 text-info" },
  em_geracao: { rotulo: "Gerando", classe: "text-muted-foreground" },
};

function nomeDoPerfil(perfil: string): string {
  return NOME_DO_PERFIL[perfil as BrainHexProfileKey] ?? perfil;
}

function corDoPerfil(perfil: string): string | undefined {
  return COR_DO_PERFIL[perfil as BrainHexProfileKey]?.marca;
}

export function AprovacaoPersonalizacoes({
  classeId,
  topicos,
  onVerMaterial,
  onResumo,
}: {
  classeId: number | null;
  topicos: Topico[];
  /** Abre o material do tópico na aba "Por perfil" para o professor conferir antes de decidir. */
  onVerMaterial?: (topicoId: number) => void;
  /** Avisa a seção de quantos esperam decisão (o selo da aba). */
  onResumo?: (pendentes: number) => void;
}) {
  const [registros, setRegistros] = useState<RegistroAprovacao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<PedidoDeDecisao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [decidindo, setDecidindo] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(async () => {
    if (!classeId) {
      setRegistros([]);
      return;
    }
    const minha = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const lidos = await lerAprovacoesDaTurma(classeId);
      if (minha === requisicao.current) setRegistros(lidos);
    } catch (e) {
      if (minha === requisicao.current) setErro(mensagemDoErro(e));
    } finally {
      if (minha === requisicao.current) setCarregando(false);
    }
  }, [classeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeDoTopico = useMemo(() => {
    const mapa = new Map(topicos.map((t) => [t.id, t.nome || `Tópico ${t.id}`] as const));
    return (id: number | null) => (id === null ? "Sem tópico" : mapa.get(id) ?? `Tópico ${id}`);
  }, [topicos]);

  const grupos = useMemo(
    () => agruparPorTopicoEPerfil(registros, topicos.map((t) => t.id)),
    [registros, topicos],
  );
  const resumo = useMemo(() => resumir(registros), [registros]);

  useEffect(() => {
    onResumo?.(resumo.pendentes);
  }, [onResumo, resumo.pendentes]);

  const gruposPorTopico = useMemo(() => {
    const mapa = new Map<number | null, GrupoAprovacao[]>();
    for (const g of grupos) mapa.set(g.topicoId, [...(mapa.get(g.topicoId) ?? []), g]);
    return [...mapa.entries()];
  }, [grupos]);

  const pedir = (decisao: Decisao, alvo: RegistroAprovacao[], escopo: string) => {
    if (itensParaDecidir(alvo, decisao).length === 0) return;
    setMotivo("");
    setPedido({ decisao, registros: alvo, escopo });
  };

  const confirmar = async () => {
    if (!pedido) return;
    const itens = itensParaDecidir(pedido.registros, pedido.decisao);
    setDecidindo(true);
    try {
      const n = await decidirAprovacao(itens, pedido.decisao, motivo);
      toast.success(
        pedido.decisao === "aprovado"
          ? `${n === 1 ? "1 material aprovado" : `${n} materiais aprovados`}: já aparece${n === 1 ? "" : "m"} para os alunos.`
          : pedido.decisao === "recusado"
            ? `${n === 1 ? "1 material recusado" : `${n} materiais recusados`}.`
            : `${n === 1 ? "1 material voltou" : `${n} materiais voltaram`} para pendente.`,
      );
      setPedido(null);
    } catch (e) {
      toast.error(mensagemDoErro(e));
      // Versão vista ficou velha (ou outra falha): a lista precisa refletir o banco antes da próxima decisão.
      setPedido(null);
    } finally {
      setDecidindo(false);
      void carregar();
    }
  };

  if (!classeId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Escolha uma classe para ver o material que espera sua aprovação.
        </CardContent>
      </Card>
    );
  }

  const quantosNoPedido = pedido ? itensParaDecidir(pedido.registros, pedido.decisao).length : 0;

  return (
    <div className="space-y-4">
      <Card className="rounded-[20px]">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Aprovação do material personalizado
            </CardTitle>
            <CardDescription className="max-w-2xl">
              O aluno só vê o material que você aprovar. Até lá, ele estuda pelo seu material. Todo material
              que a IA gerar ou regerar volta para cá esperando a sua decisão.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => void carregar()} disabled={carregando}>
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
              {carregando ? "" : "Atualizar"}
            </Button>
            <Button
              className="rounded-full font-bold"
              disabled={decidindo || resumo.prontosParaAprovar === 0}
              onClick={() => pedir("aprovado", registros, "toda a turma")}
            >
              <Check className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Aprovar tudo da turma ({resumo.prontosParaAprovar})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs" role="status">
          <Badge variant="outline" className={ESTADO_VISUAL.pendente.classe}>{resumo.pendentes} esperando</Badge>
          <Badge variant="outline" className={ESTADO_VISUAL.aprovado.classe}>{resumo.aprovados} aprovados</Badge>
          <Badge variant="outline" className={ESTADO_VISUAL.recusado.classe}>{resumo.recusados} recusados</Badge>
          {resumo.emGeracao > 0 && <Badge variant="outline">{resumo.emGeracao} gerando</Badge>}
        </CardContent>
      </Card>

      {erro && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive" role="alert">{erro}</CardContent>
        </Card>
      )}

      {!erro && !carregando && grupos.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Ainda não há material personalizado nesta turma.
          </CardContent>
        </Card>
      )}

      {gruposPorTopico.map(([topicoId, doTopico]) => {
        const todos = doTopico.flatMap((g) => g.registros);
        const prontos = itensParaDecidir(todos, "aprovado").length;
        const nome = nomeDoTopico(topicoId);
        return (
          <Card key={String(topicoId)} className="rounded-[20px]">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">{nome}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {onVerMaterial && topicoId !== null && (
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => onVerMaterial(topicoId)}>
                    <Eye className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Ver material
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={decidindo || prontos === 0}
                  onClick={() => pedir("aprovado", todos, `“${nome}”`)}
                >
                  <Check className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Aprovar o tópico ({prontos})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {doTopico.map((g) => {
                  const visual = ESTADO_VISUAL[g.estado];
                  const escopo = `“${nome}” · ${nomeDoPerfil(g.perfil)}`;
                  const porAluno = g.registros.filter((r) => r.alunoId).length;
                  const motivoRecusa = g.registros.find((r) => r.aprovacao === "recusado" && r.aprovacaoMotivo)?.aprovacaoMotivo;
                  return (
                    <li key={g.chave} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 space-y-1">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: corDoPerfil(g.perfil) }} />
                          {nomeDoPerfil(g.perfil)}
                          <Badge variant="outline" className={visual.classe}>{visual.rotulo}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {g.registros.length === 1 ? "1 material" : `${g.registros.length} materiais`}
                          {porAluno > 0 && ` (${porAluno} adequado${porAluno === 1 ? "" : "s"} a alunos)`}
                          {g.pendentes > 0 && ` · ${g.pendentes} esperando`}
                          {g.emGeracao > 0 && ` · ${g.emGeracao} gerando`}
                        </p>
                        {motivoRecusa && <p className="text-xs text-muted-foreground">Motivo da recusa: {motivoRecusa}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-full font-bold"
                          disabled={decidindo || itensParaDecidir(g.registros, "aprovado").length === 0}
                          onClick={() => pedir("aprovado", g.registros, escopo)}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={decidindo || itensParaDecidir(g.registros, "recusado").length === 0}
                          onClick={() => pedir("recusado", g.registros, escopo)}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Recusar
                        </Button>
                        {g.aprovados > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            disabled={decidindo}
                            onClick={() => pedir("pendente", g.registros.filter((r) => r.aprovacao === "aprovado"), escopo)}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Tirar do ar
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={pedido !== null} onOpenChange={(aberto) => !aberto && !decidindo && setPedido(null)}>
        <AlertDialogContent className="max-w-[480px] rounded-[20px] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px]">
              {pedido ? `${rotuloDaDecisao(pedido.decisao)} ${quantosNoPedido === 1 ? "1 material" : `${quantosNoPedido} materiais`}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-[13px] leading-relaxed">
              {pedido ? textoDaConfirmacao(pedido.decisao, quantosNoPedido, pedido.escopo) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pedido?.decisao === "recusado" && (
            <div className="space-y-1">
              <label htmlFor="motivo-recusa" className="text-xs font-semibold">Motivo (opcional)</label>
              <Textarea
                id="motivo-recusa"
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: o tom não combina com a turma"
              />
            </div>
          )}
          <AlertDialogFooter className="gap-3 sm:justify-between">
            <AlertDialogCancel disabled={decidindo} className="mt-0 rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={decidindo || quantosNoPedido === 0}
              onClick={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              className={`rounded-full font-bold ${pedido?.decisao === "aprovado" ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}`}
            >
              {decidindo ? "Registrando…" : pedido ? `Confirmar: ${rotuloDaDecisao(pedido.decisao).toLowerCase()}` : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
