import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { COR_DO_PERFIL, NOME_DO_PERFIL } from "../dashboard/perfilCores";
import { CaixaDeSelecao } from "../turmas/CaixaDeSelecao";
import {
  TODOS_OS_PERFIS,
  enfileirarLote,
  lerConteudosDosTopicos,
  lerPerfisDaTurma,
  pedidoDaSelecao,
  perfisDoPedido,
  perfisNaOrdem,
  totalDeMateriais,
  unidadesDaTurma,
  type ConteudoDoLote,
  type RespostaDoLote,
  type TopicoDoLote,
  type UnidadeDoLote,
} from "./geracaoEmLote";

/** Acima disto, o resumo avisa que o pedido pesa na cota do dia. */
const MUITOS_MATERIAIS = 60;

type Props = {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  classeId: number;
  topicos: TopicoDoLote[];
  /** Tópico e conteúdo escolhidos na tela: o diálogo abre com eles marcados. */
  topicoInicial?: number | null;
  conteudoInicial?: number | null;
  onEnfileirado: (resposta: RespostaDoLote) => void;
};

const chave = (u: UnidadeDoLote) => `${u.topicoId}:${u.conteudoId ?? "-"}`;

export function GerarEmLoteDialog({ aberto, onAbertoChange, classeId, topicos, topicoInicial, conteudoInicial, onEnfileirado }: Props) {
  const id = useId();
  const [conteudos, setConteudos] = useState<ConteudoDoLote[]>([]);
  const [perfisDaTurma, setPerfisDaTurma] = useState<BrainHexProfileKey[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);

  const [escopo, setEscopo] = useState<"turma" | "escolher">("turma");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [perfis, setPerfis] = useState<Set<BrainHexProfileKey>>(new Set());

  const [enviando, setEnviando] = useState(false);
  const [erroAoEnviar, setErroAoEnviar] = useState<string | null>(null);

  // A seção recria `topicos` a cada recarga (o polling do andamento recarrega a cada poucos
  // segundos). Como dependência, ele refazia a carga e zerava a escolha no meio da seleção: o
  // efeito depende só dos ids, e o resto entra por ref, lido na hora em que abre.
  const idsDosTopicos = topicos.map((t) => t.id).join(",");
  const naHoraDeAbrir = useRef({ topicos, topicoInicial, conteudoInicial });
  naHoraDeAbrir.current = { topicos, topicoInicial, conteudoInicial };

  // Toda vez que abre: lê os conteúdos de todos os tópicos e os perfis da turma de agora.
  useEffect(() => {
    if (!aberto) return;
    const { topicos, topicoInicial, conteudoInicial } = naHoraDeAbrir.current;
    let ativo = true;
    setCarregando(true);
    setErroAoCarregar(null);
    setErroAoEnviar(null);
    void Promise.all([lerConteudosDosTopicos(topicos.map((t) => t.id)), lerPerfisDaTurma(classeId)])
      .then(([lidos, daTurma]) => {
        if (!ativo) return;
        setConteudos(lidos);
        setPerfisDaTurma(daTurma);
        // Turma sem aluno não tem perfil: começa com nenhum escolhido, e o resumo explica.
        setPerfis(new Set(daTurma));
        const inicial = unidadesDaTurma(topicos, lidos).filter((u) =>
          conteudoInicial ? u.conteudoId === conteudoInicial : topicoInicial ? u.topicoId === topicoInicial : false,
        );
        setEscopo(inicial.length > 0 ? "escolher" : "turma");
        setMarcadas(new Set(inicial.map(chave)));
        setAbertos(new Set(topicoInicial ? [topicoInicial] : []));
      })
      .catch((erro: unknown) => {
        if (ativo) setErroAoCarregar(erro instanceof Error ? erro.message : "Não foi possível carregar a trilha.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [aberto, classeId, idsDosTopicos]);

  const todas = useMemo(() => unidadesDaTurma(topicos, conteudos), [topicos, conteudos]);
  const escolhidas = useMemo(
    () => (escopo === "turma" ? todas : todas.filter((u) => marcadas.has(chave(u)))),
    [escopo, todas, marcadas],
  );
  const perfisEscolhidos = useMemo(() => perfisNaOrdem(perfis), [perfis]);
  const total = totalDeMateriais(escolhidas.length, perfisEscolhidos.length);
  const saoOsDaTurma = perfisDaTurma.length > 0 && perfisDoPedido(perfisEscolhidos, perfisDaTurma).length === 0;

  const alternarUnidade = (u: UnidadeDoLote) =>
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave(u))) nova.delete(chave(u));
      else nova.add(chave(u));
      return nova;
    });

  const alternarTopico = (topicoId: number, marcar: boolean) =>
    setMarcadas((atual) => {
      const nova = new Set(atual);
      for (const u of todas.filter((x) => x.topicoId === topicoId)) {
        if (marcar) nova.add(chave(u));
        else nova.delete(chave(u));
      }
      return nova;
    });

  const alternarPerfil = (perfil: BrainHexProfileKey) =>
    setPerfis((atual) => {
      const novo = new Set(atual);
      if (novo.has(perfil)) novo.delete(perfil);
      else novo.add(perfil);
      return novo;
    });

  const gerar = async () => {
    setEnviando(true);
    setErroAoEnviar(null);
    try {
      const pedido = escopo === "turma" ? { topicoIds: [], conteudoIds: [] } : pedidoDaSelecao(escolhidas, todas);
      const resposta = await enfileirarLote(classeId, pedido, perfisDoPedido(perfisEscolhidos, perfisDaTurma));
      onEnfileirado(resposta);
      onAbertoChange(false);
    } catch (erro) {
      setErroAoEnviar(erro instanceof Error ? erro.message : "Não foi possível enfileirar a geração.");
    } finally {
      setEnviando(false);
    }
  };

  const nomeDoConteudo = (u: UnidadeDoLote) =>
    conteudos.find((c) => c.id === u.conteudoId)?.titulo || `Conteúdo ${u.conteudoId}`;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && onAbertoChange(v)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[20px] bg-card p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle>Gerar em lote</DialogTitle>
          <DialogDescription>
            Escolha o que gerar e para quais perfis. Cada material sai com texto, áudio e apresentação, e o que já
            estiver pronto e atualizado não é gerado de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {carregando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando a trilha e os perfis da turma…
            </p>
          ) : erroAoCarregar ? (
            <p role="alert" className="text-sm text-destructive">{erroAoCarregar}</p>
          ) : (
            <>
              <section aria-labelledby={`${id}-o-que`} className="space-y-2">
                <h3 id={`${id}-o-que`} className="text-sm font-semibold">O que gerar</h3>
                <RadioGroup value={escopo} onValueChange={(v) => setEscopo(v as "turma" | "escolher")} className="gap-2">
                  <Label htmlFor={`${id}-turma`} className="flex cursor-pointer items-start gap-2 rounded-[12px] border border-border px-3 py-2 font-normal">
                    <RadioGroupItem id={`${id}-turma`} value="turma" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-semibold">A turma inteira</span>
                      <span className="block text-xs text-muted-foreground">
                        {topicos.length} {topicos.length === 1 ? "tópico" : "tópicos"}, {conteudos.length}{" "}
                        {conteudos.length === 1 ? "conteúdo" : "conteúdos"}
                      </span>
                    </span>
                  </Label>
                  <Label htmlFor={`${id}-escolher`} className="flex cursor-pointer items-start gap-2 rounded-[12px] border border-border px-3 py-2 font-normal">
                    <RadioGroupItem id={`${id}-escolher`} value="escolher" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-semibold">Tópicos ou conteúdos escolhidos</span>
                      <span className="block text-xs text-muted-foreground">Marque um tópico inteiro ou só alguns conteúdos dele.</span>
                    </span>
                  </Label>
                </RadioGroup>

                {escopo === "escolher" && (
                  <ul className="space-y-1 rounded-[12px] border border-border p-2" aria-label="Tópicos e conteúdos">
                    {topicos.map((t) => {
                      const doTopico = todas.filter((u) => u.topicoId === t.id);
                      const marcadosDele = doTopico.filter((u) => marcadas.has(chave(u))).length;
                      const estado = marcadosDele === 0 ? "nenhum" : marcadosDele === doTopico.length ? "todos" : "parcial";
                      const temConteudo = doTopico.some((u) => u.conteudoId != null);
                      const expandido = abertos.has(t.id);
                      return (
                        <li key={t.id}>
                          <div className="flex items-center gap-2 rounded-[10px] px-1 py-1 hover:bg-muted/50">
                            {/* Caixa nativa: o "parcial" do tópico aparece e é lido como misto. */}
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
                              <CaixaDeSelecao
                                estado={estado}
                                rotulo={t.nome || `Tópico ${t.id}`}
                                onChange={() => alternarTopico(t.id, estado !== "todos")}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{t.nome || `Tópico ${t.id}`}</span>
                                <span className="block text-[11px] font-normal text-muted-foreground">
                                  {temConteudo
                                    ? `${marcadosDele} de ${doTopico.length} ${doTopico.length === 1 ? "conteúdo" : "conteúdos"}`
                                    : "Sem conteúdo: gera o material do tópico"}
                                </span>
                              </span>
                            </label>
                            {temConteudo && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 rounded-full p-0"
                                aria-expanded={expandido}
                                aria-label={expandido ? `Esconder os conteúdos de ${t.nome ?? "tópico"}` : `Mostrar os conteúdos de ${t.nome ?? "tópico"}`}
                                onClick={() =>
                                  setAbertos((atual) => {
                                    const novo = new Set(atual);
                                    if (novo.has(t.id)) novo.delete(t.id);
                                    else novo.add(t.id);
                                    return novo;
                                  })
                                }
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${expandido ? "rotate-180" : ""}`} aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                          {temConteudo && expandido && (
                            <ul className="ml-7 space-y-0.5 border-l border-border pl-2">
                              {doTopico.map((u) => (
                                <li key={chave(u)} className="flex items-center gap-2 rounded-[10px] px-1 py-1 hover:bg-muted/50">
                                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px]">
                                    <CaixaDeSelecao
                                      estado={marcadas.has(chave(u)) ? "todos" : "nenhum"}
                                      rotulo={nomeDoConteudo(u)}
                                      onChange={() => alternarUnidade(u)}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{nomeDoConteudo(u)}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby={`${id}-perfis`} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`${id}-perfis`} className="text-sm font-semibold">Para quais perfis</h3>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full text-xs"
                      disabled={perfisDaTurma.length === 0}
                      onClick={() => setPerfis(new Set(perfisDaTurma))}
                    >
                      Os da turma ({perfisDaTurma.length})
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => setPerfis(new Set(TODOS_OS_PERFIS))}>
                      Todos os 7
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={() => setPerfis(new Set())}>
                      Limpar
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Perfis BrainHex">
                  {TODOS_OS_PERFIS.map((perfil) => {
                    const ativo = perfis.has(perfil);
                    return (
                      <button
                        key={perfil}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternarPerfil(perfil)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          ativo ? "border-transparent text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        style={ativo ? { background: `${COR_DO_PERFIL[perfil].marca}33`, borderColor: COR_DO_PERFIL[perfil].marca } : undefined}
                      >
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[perfil].marca }} />
                        {NOME_DO_PERFIL[perfil]}
                        {perfisDaTurma.includes(perfil) && <span className="sr-only"> (na turma)</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {perfisDaTurma.length === 0
                    ? "A turma ainda não tem aluno, então não tem perfil. Escolha os perfis que quer gerar."
                    : saoOsDaTurma
                      ? "Os perfis dos alunos da turma (principal ou representativo). Se um aluno sair antes da geração, o perfil que só ele tinha fica de fora."
                      : `Na turma hoje: ${perfisDaTurma.map((p) => NOME_DO_PERFIL[p]).join(", ")}. Perfil escolhido fora deles é gerado mesmo sem aluno.`}
                </p>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <div aria-live="polite" className="text-xs text-muted-foreground">
            {!carregando && !erroAoCarregar && (
              <>
                <span className="font-semibold text-foreground">
                  {total} {total === 1 ? "material" : "materiais"}
                </span>{" "}
                ({escolhidas.length} {escolhidas.length === 1 ? "item da trilha" : "itens da trilha"} × {perfisEscolhidos.length}{" "}
                {perfisEscolhidos.length === 1 ? "perfil" : "perfis"})
                {total > MUITOS_MATERIAIS && (
                  <span className="mt-1 flex items-center gap-1 text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                    Pedido grande: a cota diária do modelo pode acabar antes e o resto fica para o dia seguinte.
                  </span>
                )}
              </>
            )}
            {erroAoEnviar && <p role="alert" className="mt-1 text-destructive">{erroAoEnviar}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" disabled={enviando} onClick={() => onAbertoChange(false)}>
              Cancelar
            </Button>
            <Button type="button" className="rounded-full font-bold" disabled={carregando || Boolean(erroAoCarregar) || enviando || total === 0} onClick={() => void gerar()}>
              {enviando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
              Gerar {total > 0 ? total : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
