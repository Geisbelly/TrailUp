import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, Copy, ListChecks, PanelRightClose, PanelRightOpen, Pencil, PlayCircle, Smartphone, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { PlayerDaPesquisa } from "@/components/pesquisa/VideosDaPesquisa";
import { ROTULO_DA_VIEW, consolePathForView, type ConsoleView } from "@/pages/consoleSections";
import { caminhoDoVideo, videoPorSlug } from "@/features/pesquisa/videosDaPesquisa";
import {
  ETAPAS_DO_ROTEIRO,
  LIMITE_DA_ANOTACAO,
  ONDE_E_A_ETAPA,
  SLUG_DO_VIDEO_DO_ROTEIRO,
  andamentoDoRoteiro,
  anotacoesEmTexto,
  anotacoesPorEtapa,
  depoisDaTarefa,
  etapaDaView,
  etapaPorId,
  proximaEtapa,
  textoDaAnotacao,
  type Anotacao,
  type EtapaDoRoteiro,
  type MeuRoteiro,
} from "@/features/pesquisa/roteiroDaPesquisa";
import {
  EVENTO_DO_ROTEIRO,
  anotar,
  apagarAnotacao,
  carregarAnotacoes,
  carregarMeuRoteiro,
  desmarcarEtapa,
  editarAnotacao,
  marcarEtapa,
} from "@/features/pesquisa/roteiroApi";

const CHAVE_DA_LATERAL = "trailup:roteiro:lateral";
const SEM_ETAPA = "__sem_etapa__";

function lerLateralAberta(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DA_LATERAL) !== "fechada";
  } catch {
    return true;
  }
}

function gravarLateralAberta(aberta: boolean) {
  try {
    window.localStorage.setItem(CHAVE_DA_LATERAL, aberta ? "aberta" : "fechada");
  } catch {
    // Sem armazenamento, a lateral só volta aberta na próxima visita.
  }
}

const quando = (iso: string) => {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const tituloDaEtapa = (etapa: EtapaDoRoteiro) => (etapa.tarefa ? `${etapa.tarefa}. ${etapa.titulo}` : etapa.titulo);

/**
 * Painel lateral do avaliador da pesquisa com professores: o roteiro etapa por etapa e as anotações,
 * em todas as abas do console, inclusive na de responder à avaliação. Para quem não é avaliador,
 * `pesquisa_meu_roteiro()` devolve null e o painel não desenha nada.
 */
export default function PainelDoRoteiro({ view }: { view: ConsoleView }) {
  const [roteiro, setRoteiro] = useState<MeuRoteiro | null | undefined>(undefined);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [lateralAberta, setLateralAberta] = useState(lerLateralAberta);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  const recarregar = useCallback(async () => {
    const meu = await carregarMeuRoteiro();
    setRoteiro(meu);
    if (!meu) return;
    try {
      setAnotacoes(await carregarAnotacoes());
    } catch {
      setErro("Não consegui carregar as anotações agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
    // O que se marca ou anota no app aparece aqui quando o avaliador volta para esta aba. Sem
    // Realtime de propósito: o eco do Realtime já derrubou o banco (trilha aberta, 17/11).
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar();
    };
    const aoMudar = () => void recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener(EVENTO_DO_ROTEIRO, aoMudar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener(EVENTO_DO_ROTEIRO, aoMudar);
    };
  }, [recarregar]);

  if (!roteiro) return null;

  const alternarLateral = () => {
    setLateralAberta(atual => {
      gravarLateralAberta(!atual);
      return !atual;
    });
  };

  const conteudo = (
    <ConteudoDoRoteiro
      view={view}
      roteiro={roteiro}
      setRoteiro={setRoteiro}
      anotacoes={anotacoes}
      setAnotacoes={setAnotacoes}
      erro={erro}
      setErro={setErro}
      aoNavegar={() => setGavetaAberta(false)}
    />
  );
  const { feitas, total } = andamentoDoRoteiro(roteiro.marcadas);

  return (
    <>
      <aside
        className="roteiro-lateral hidden min-h-0 w-[52px] shrink-0 border-l border-border bg-card/80 backdrop-blur data-[aberta=true]:w-[360px] xl:flex xl:flex-col"
        data-aberta={lateralAberta}
        aria-label="Roteiro da avaliação e anotações"
      >
        {lateralAberta ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ListChecks size={18} className="text-primary" aria-hidden="true" /> Roteiro da avaliação
              </h2>
              <button type="button" className="console-icon-button" onClick={alternarLateral} aria-label="Recolher o roteiro" title="Recolher o roteiro">
                <PanelRightClose size={18} />
              </button>
            </div>
            {/* pb-24: a Lumi flutua no canto de baixo e cobriria a última anotação. */}
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">{conteudo}</div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-3">
            <button type="button" className="console-icon-button" onClick={alternarLateral} aria-label="Abrir o roteiro" title="Abrir o roteiro">
              <PanelRightOpen size={18} />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground [writing-mode:vertical-rl]">
              Roteiro · {feitas} de {total}
            </span>
          </div>
        )}
      </aside>

      {/* Abaixo de 1280 px não cabe uma terceira coluna: o roteiro vira gaveta, aberta por um botão fixo. */}
      {/* O `display` do journey-button venceria o xl:hidden no próprio botão: quem some é o contêiner. */}
      <div className="fixed bottom-24 right-4 z-40 xl:hidden">
        <button
          type="button"
          className="journey-button journey-button-coral inline-flex shadow-lg"
          onClick={() => setGavetaAberta(true)}
          aria-haspopup="dialog"
        >
          <ListChecks size={18} aria-hidden="true" /> Roteiro · {feitas}/{total}
        </button>
      </div>
      <Sheet open={gavetaAberta} onOpenChange={setGavetaAberta}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <ListChecks size={18} className="text-primary" aria-hidden="true" /> Roteiro da avaliação
            </SheetTitle>
            <SheetDescription className="text-xs">Marque o que já fez e anote o que quiser lembrar na hora de responder.</SheetDescription>
          </SheetHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">{conteudo}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ConteudoDoRoteiro({
  view,
  roteiro,
  setRoteiro,
  anotacoes,
  setAnotacoes,
  erro,
  setErro,
  aoNavegar,
}: {
  view: ConsoleView;
  roteiro: MeuRoteiro;
  setRoteiro: (r: MeuRoteiro) => void;
  anotacoes: Anotacao[];
  setAnotacoes: (fn: (atuais: Anotacao[]) => Anotacao[]) => void;
  erro: string | null;
  setErro: (erro: string | null) => void;
  aoNavegar: () => void;
}) {
  const daView = etapaDaView(view);
  const proxima = proximaEtapa(roteiro.marcadas);
  const [foco, setFoco] = useState<string | null>(null);
  // Trocar de aba volta o foco para a etapa daquela aba.
  useEffect(() => setFoco(null), [view]);
  const emFoco = etapaPorId(foco) ?? daView ?? proxima ?? ETAPAS_DO_ROTEIRO[ETAPAS_DO_ROTEIRO.length - 1];
  const { feitas, total, porcento } = andamentoDoRoteiro(roteiro.marcadas);

  async function alternarMarca(etapa: EtapaDoRoteiro, marcar: boolean) {
    const antes = roteiro.marcadas;
    const depois = new Set(antes);
    if (marcar) depois.add(etapa.id);
    else depois.delete(etapa.id);
    setRoteiro({ ...roteiro, marcadas: depois });
    setErro(null);
    try {
      await (marcar ? marcarEtapa(etapa.id) : desmarcarEtapa(etapa.id));
    } catch {
      setRoteiro({ ...roteiro, marcadas: antes });
      setErro("Não consegui salvar a marcação. Tente de novo.");
    }
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Etapas feitas</span>
          <strong className="text-foreground" aria-live="polite">{feitas} de {total}</strong>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas} aria-label="Andamento do roteiro">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcento}%` }} />
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          {erro}
        </p>
      )}

      <EtapaEmFoco
        etapa={emFoco}
        view={view}
        rotulo={emFoco === daView ? "Você está nesta etapa" : emFoco === proxima ? "Próxima etapa" : "Etapa escolhida"}
        feita={roteiro.marcadas.has(emFoco.id)}
        aoMarcar={marcar => alternarMarca(emFoco, marcar)}
        aoNavegar={aoNavegar}
      />

      <section aria-labelledby="roteiro-etapas" className="flex flex-col gap-2">
        <h3 id="roteiro-etapas" className="text-xs font-semibold uppercase text-muted-foreground">Todas as etapas</h3>
        <ol className="flex flex-col gap-1">
          {ETAPAS_DO_ROTEIRO.map(etapa => {
            const feita = roteiro.marcadas.has(etapa.id);
            const ativa = etapa.id === emFoco.id;
            return (
              <li key={etapa.id} className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${ativa ? "bg-primary/10" : ""}`}>
                <Checkbox
                  id={`roteiro-${etapa.id}`}
                  checked={feita}
                  onCheckedChange={v => alternarMarca(etapa, v === true)}
                  aria-label={`${tituloDaEtapa(etapa)}: ${feita ? "feita" : "não feita"}`}
                />
                <button
                  type="button"
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left ${feita ? "text-muted-foreground line-through" : "text-foreground"}`}
                  onClick={() => setFoco(etapa.id)}
                  aria-current={ativa ? "step" : undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{tituloDaEtapa(etapa)}</span>
                  {etapa.onde === "app" && <Smartphone size={14} className="shrink-0 text-muted-foreground" aria-label="no app" />}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <Anotacoes view={view} etapaPadrao={emFoco} anotacoes={anotacoes} setAnotacoes={setAnotacoes} setErro={setErro} />
    </div>
  );
}

function EtapaEmFoco({
  etapa,
  view,
  rotulo,
  feita,
  aoMarcar,
  aoNavegar,
}: {
  etapa: EtapaDoRoteiro;
  view: ConsoleView;
  rotulo: string;
  feita: boolean;
  aoMarcar: (marcar: boolean) => void;
  aoNavegar: () => void;
}) {
  const video = etapa.id === "video" ? videoPorSlug(SLUG_DO_VIDEO_DO_ROTEIRO) : null;
  const destino = etapa.views?.[0];
  const jaEsta = destino ? etapa.views?.includes(view) : false;
  return (
    <section aria-labelledby="roteiro-foco" className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-background/60 p-3">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase text-primary">{rotulo} · {ONDE_E_A_ETAPA[etapa.onde]}</span>
        <h3 id="roteiro-foco" className="text-base font-semibold text-foreground">{tituloDaEtapa(etapa)}</h3>
      </div>
      <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
        {etapa.passos.map(passo => <li key={passo}>{passo}</li>)}
      </ul>
      {etapa.observar && (
        <p className="text-muted-foreground">
          <strong className="text-foreground">Repare:</strong> {etapa.observar}
        </p>
      )}
      {video && (
        <div className="flex flex-col gap-2">
          <PlayerDaPesquisa video={video} />
          <Link className="inline-flex items-center gap-1 self-center text-xs text-primary underline" to={caminhoDoVideo(video)} target="_blank" rel="noopener noreferrer">
            <PlayCircle size={14} aria-hidden="true" /> Abrir o vídeo numa página só dele
          </Link>
        </div>
      )}
      {etapa.onde === "app" && (
        <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Smartphone size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Esta etapa é no app, com o aluno de teste. O mesmo roteiro e as mesmas anotações aparecem lá.
        </p>
      )}
      {etapa.tarefa && etapa.onde === "console" && view !== "avaliacao" && (
        <p className="text-xs text-muted-foreground">{depoisDaTarefa(etapa.tarefa)}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="roteiro-foco-feita" className="inline-flex cursor-pointer items-center gap-2 text-foreground">
          <Checkbox id="roteiro-foco-feita" checked={feita} onCheckedChange={v => aoMarcar(v === true)} />
          {feita ? "Feita" : "Marcar como feita"}
        </label>
        {destino && !jaEsta && (
          <Link className="inline-flex items-center gap-1 text-primary underline" to={consolePathForView(destino)} onClick={aoNavegar}>
            Ir para {ROTULO_DA_VIEW[destino]} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        {etapa.tarefa && etapa.onde === "console" && view !== "avaliacao" && (
          <Link className="inline-flex items-center gap-1 text-primary underline" to={consolePathForView("avaliacao")} onClick={aoNavegar}>
            Responder <ClipboardList size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}

function Anotacoes({
  view,
  etapaPadrao,
  anotacoes,
  setAnotacoes,
  setErro,
}: {
  view: ConsoleView;
  etapaPadrao: EtapaDoRoteiro;
  anotacoes: Anotacao[];
  setAnotacoes: (fn: (atuais: Anotacao[]) => Anotacao[]) => void;
  setErro: (erro: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [etapa, setEtapa] = useState<string>(etapaPadrao.id);
  const [gravando, setGravando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setEtapa(etapaPadrao.id), [etapaPadrao.id]);
  const grupos = useMemo(() => anotacoesPorEtapa(anotacoes), [anotacoes]);

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    const limpo = textoDaAnotacao(texto);
    if (!limpo || gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const nova = await anotar(limpo, etapa === SEM_ETAPA ? null : etapa, "console");
      setAnotacoes(atuais => [...atuais, nova]);
      setTexto("");
      campo.current?.focus();
    } catch {
      setErro("Não consegui salvar a anotação. O texto continua no campo.");
    } finally {
      setGravando(false);
    }
  }

  async function copiarTudo() {
    try {
      await navigator.clipboard.writeText(anotacoesEmTexto(anotacoes));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("O navegador não deixou copiar. Selecione o texto das anotações e copie à mão.");
    }
  }

  return (
    <section aria-labelledby="roteiro-anotacoes" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="roteiro-anotacoes" className="text-xs font-semibold uppercase text-muted-foreground">Anotações</h3>
        {anotacoes.length > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-xs text-primary underline" onClick={copiarTudo}>
            {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span aria-live="polite">{copiado ? "Copiadas" : "Copiar todas"}</span>
          </button>
        )}
      </div>
      {view === "avaliacao" && anotacoes.length > 0 && (
        <p className="text-xs text-muted-foreground">Releia antes de responder. Se uma anotação servir para uma pergunta, escreva ou cole lá.</p>
      )}

      <form className="flex flex-col gap-2" onSubmit={enviar}>
        <label htmlFor="roteiro-nova-anotacao" className="sr-only">Nova anotação</label>
        <textarea
          id="roteiro-nova-anotacao"
          ref={campo}
          value={texto}
          maxLength={LIMITE_DA_ANOTACAO}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
          }}
          rows={3}
          placeholder="O que travou, confundiu ou chamou a atenção?"
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="roteiro-etapa-da-anotacao" className="sr-only">Etapa da anotação</label>
          <select
            id="roteiro-etapa-da-anotacao"
            value={etapa}
            onChange={e => setEtapa(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            {ETAPAS_DO_ROTEIRO.map(e => <option key={e.id} value={e.id}>{tituloDaEtapa(e)}</option>)}
            <option value={SEM_ETAPA}>Sem etapa</option>
          </select>
          <button type="submit" className="journey-button inline-flex shrink-0" disabled={!textoDaAnotacao(texto) || gravando}>
            {gravando ? "Salvando…" : "Anotar"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Só você vê, no console e no app. A equipe não lê: o que contar para a pesquisa, escreva no formulário.
        </p>
      </form>

      {grupos.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">Nenhuma anotação ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map(({ etapa: daEtapa, anotacoes: delas }) => (
            <div key={daEtapa?.id ?? SEM_ETAPA} className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold text-foreground">{daEtapa ? tituloDaEtapa(daEtapa) : "Sem etapa"}</h4>
              <ul className="flex flex-col gap-1.5">
                {delas.map(anotacao => (
                  <ItemDaAnotacao key={anotacao.id} anotacao={anotacao} setAnotacoes={setAnotacoes} setErro={setErro} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ItemDaAnotacao({
  anotacao,
  setAnotacoes,
  setErro,
}: {
  anotacao: Anotacao;
  setAnotacoes: (fn: (atuais: Anotacao[]) => Anotacao[]) => void;
  setErro: (erro: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(anotacao.texto);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    const limpo = textoDaAnotacao(rascunho);
    if (!limpo) return;
    setOcupado(true);
    setErro(null);
    try {
      const editada = await editarAnotacao(anotacao.id, limpo, anotacao.etapa);
      setAnotacoes(atuais => atuais.map(a => (a.id === editada.id ? editada : a)));
      setEditando(false);
    } catch {
      setErro("Não consegui salvar a edição.");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    setErro(null);
    try {
      await apagarAnotacao(anotacao.id);
      setAnotacoes(atuais => atuais.filter(a => a.id !== anotacao.id));
    } catch {
      setErro("Não consegui apagar a anotação.");
      setOcupado(false);
    }
  }

  return (
    <li className="rounded-md border border-border bg-background/60 px-3 py-2">
      {editando ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`anotacao-${anotacao.id}`} className="sr-only">Editar anotação</label>
          <textarea
            id={`anotacao-${anotacao.id}`}
            value={rascunho}
            maxLength={LIMITE_DA_ANOTACAO}
            onChange={e => setRascunho(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setEditando(false); setRascunho(anotacao.texto); }}>
              Cancelar
            </button>
            <button type="button" className="text-xs font-semibold text-primary underline" onClick={salvar} disabled={ocupado || !textoDaAnotacao(rascunho)}>
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-foreground">{anotacao.texto}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {anotacao.plataforma === "app" && <Smartphone size={12} aria-hidden="true" />}
              {anotacao.plataforma === "app" ? "no app" : "no console"} · {quando(anotacao.criadaEm)}
            </span>
            {confirmandoApagar ? (
              <span className="inline-flex items-center gap-2">
                Apagar?
                <button type="button" className="font-semibold text-destructive underline" onClick={apagar} disabled={ocupado}>Sim</button>
                <button type="button" className="underline" onClick={() => setConfirmandoApagar(false)} aria-label="Não apagar"><X size={12} aria-hidden="true" /></button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <button type="button" className="rounded p-1 hover:text-foreground" onClick={() => setEditando(true)} aria-label="Editar anotação" title="Editar">
                  <Pencil size={13} />
                </button>
                <button type="button" className="rounded p-1 hover:text-destructive" onClick={() => setConfirmandoApagar(true)} aria-label="Apagar anotação" title="Apagar">
                  <Trash2 size={13} />
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}
