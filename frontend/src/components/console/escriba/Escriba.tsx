import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Maximize2, Minimize2, PlayCircle, Send, X } from "lucide-react";
import fotoDaLumi from "@/assets/design/lumi.webp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/apiTraiupClient";
import { cn } from "@/lib/utils";
import {
  historicoParaEnvio,
  MENSAGEM_INICIAL,
  mensagemDaResposta,
  mensagemDeErro,
  nomeDaTurma,
  SUGESTOES,
  TODAS,
  turmaInicial,
  type Destino,
  type Mensagem,
  type TurmaDoProfessor,
} from "./conversa";
import TutorialGuiado from "./TutorialGuiado";
import { tutorialPorId, type Tutorial } from "./tutoriais";

// Cabe o acordar da API no plano gratuito (a primeira chamada depois de um
// tempo parado leva dezenas de segundos) mais a resposta do modelo.
const TEMPO_LIMITE_MS = 75_000;
// A partir daqui o "pensando" avisa que o servidor pode estar acordando.
const AVISO_DE_DEMORA_MS = 8_000;

const FOCAVEIS = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type Resposta = Parameters<typeof mensagemDaResposta>[1];

/**
 * Lumi (antes Escriba): botão flutuante bronze + painel de conversa, em todas as telas do
 * console menos Aprovações (quem decide é o ConsoleShell). A conversa vive só
 * aqui; a API não grava nada. Com a API fora do ar o resto do console segue
 * normal — o erro fica dentro do painel.
 */
export default function Escriba() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [turmas, setTurmas] = useState<TurmaDoProfessor[] | null>(null);
  const [turma, setTurma] = useState<string>(TODAS);
  const [mensagens, setMensagens] = useState<Mensagem[]>([{ id: 0, papel: "escriba", texto: MENSAGEM_INICIAL }]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [demorando, setDemorando] = useState(false);
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const proximoId = useRef(1);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const inicioDaResposta = useRef<HTMLDivElement>(null);
  const idPainel = useId();
  const idTitulo = useId();
  const turmaNaUrl = searchParams.get("turma");

  // As turmas só são lidas quando o painel abre pela primeira vez.
  useEffect(() => {
    if (!aberto || turmas !== null || !user?.id) return;
    void supabase
      .from("classe")
      .select("id, descricao")
      .eq("professor_id", user.id)
      .order("id")
      .then(({ data }) => {
        const lista = (data ?? []) as TurmaDoProfessor[];
        setTurmas(lista);
        setTurma(turmaInicial(lista, turmaNaUrl));
      });
  }, [aberto, turmas, user?.id, turmaNaUrl]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  // Resposta nova abre pelo começo: em resposta longa, rolar até o fim esconderia as primeiras seções.
  useEffect(() => {
    const respondeu = !pensando && mensagens.length > 1 && mensagens[mensagens.length - 1].papel === "escriba";
    if (respondeu) inicioDaResposta.current?.scrollIntoView({ block: "start" });
    else fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, pensando]);

  useEffect(() => {
    if (!pensando) return setDemorando(false);
    const t = window.setTimeout(() => setDemorando(true), AVISO_DE_DEMORA_MS);
    return () => window.clearTimeout(t);
  }, [pensando]);

  const fechar = useCallback(() => {
    setAberto(false);
    setTelaCheia(false);
    botao.current?.focus();
  }, []);

  const enviar = useCallback(
    async (texto: string, anteriores: Mensagem[] = mensagens) => {
      const limpa = texto.trim().slice(0, 500);
      if (!limpa || pensando) return;
      const historico = historicoParaEnvio(anteriores);
      setMensagens([...anteriores, { id: proximoId.current++, papel: "professor", texto: limpa }]);
      setPergunta("");
      setPensando(true);
      try {
        const r = await apiRequest<Resposta>(
          "/api/v1/escriba/perguntar",
          "",
          {
            method: "POST",
            body: JSON.stringify({ pergunta: limpa, classe_id: turma === TODAS ? null : Number(turma), historico }),
          },
          TEMPO_LIMITE_MS,
        );
        setMensagens((m) => [...m, mensagemDaResposta(proximoId.current++, r, turma)]);
      } catch (e) {
        setMensagens((m) => [...m, { id: proximoId.current++, papel: "escriba", texto: mensagemDeErro(e), erro: true }]);
      } finally {
        setPensando(false);
      }
    },
    [mensagens, pensando, turma],
  );

  // O painel sai da frente da tela que o professor pediu para ver; a conversa fica.
  const iniciarTutorial = (escolhido: Tutorial | null) => {
    if (!escolhido) return;
    setAberto(false);
    setTelaCheia(false);
    setTutorial(escolhido);
  };

  const botaoDeDestino = (d: Destino) => (
    <Link
      key={d.caminho}
      to={d.caminho}
      onClick={fechar}
      className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--console-bronze-text))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--console-bronze-text))] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {d.rotulo}
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );

  const trocarTurma = (valor: string) => {
    setTurma(valor);
    // Outra turma, outra conversa: o histórico falaria de dados que o modelo não vai receber.
    setMensagens([{ id: 0, papel: "escriba", texto: MENSAGEM_INICIAL }]);
  };

  // Foco preso no painel aberto; Esc fecha e devolve o foco ao botão.
  const noTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (telaCheia) setTelaCheia(false);
      else fechar();
      return;
    }
    if (e.key !== "Tab" || !painel.current) return;
    const focaveis = [...painel.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  const ultimaPergunta = [...mensagens].reverse().find((m) => m.papel === "professor")?.texto;
  const conversou = mensagens.length > 1;

  return (
    <>
      {aberto && createPortal(
        <div
          ref={painel}
          id={idPainel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          onKeyDown={noTeclado}
          className={cn(
            "fixed z-[100] flex flex-col overflow-hidden bg-card",
            telaCheia
              ? "inset-0 h-[100dvh] w-screen rounded-none border-0 shadow-none"
              : "escriba-panel-floating max-h-[min(560px,calc(100dvh-120px))] w-[min(360px,calc(100vw-32px))] rounded-[20px] border border-border shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
          )}
        >
          {/* Bronze claro com texto escuro: o branco sobre o degradê do protótipo fica em ~2,6:1. */}
          <div className="flex items-center gap-3 bg-[hsl(var(--console-bronze-light))] px-[18px] py-4 text-[hsl(var(--background))]">
            <img src={fotoDaLumi} alt="" aria-hidden="true" className="h-[38px] w-[38px] flex-none rounded-full bg-[hsl(var(--card))] object-cover ring-2 ring-black/15" />
            <div className="min-w-0 flex-1">
              <h2 id={idTitulo} className="font-['Cinzel',serif] text-sm font-bold leading-tight">
                Lumi <span className="font-sans text-[11px] font-semibold">· A guia do professor</span>
              </h2>
              <p className="text-[11px] font-medium">Lê os dados das suas turmas</p>
            </div>
            <button
              type="button"
              onClick={() => setTelaCheia((expandida) => !expandida)}
              aria-label={telaCheia ? "Reduzir conversa" : "Expandir conversa em tela cheia"}
              title={telaCheia ? "Reduzir conversa" : "Tela cheia"}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--background))]"
            >
              {telaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar a Lumi"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--background))]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-border px-[18px] py-2.5">
            <label htmlFor={`${idPainel}-turma`} className="text-[11.5px] text-muted-foreground">
              Turma
            </label>
            <select
              id={`${idPainel}-turma`}
              value={turma}
              disabled={turmas === null || pensando}
              onChange={(e) => trocarTurma(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {turmas === null ? (
                <option value={TODAS}>Carregando turmas…</option>
              ) : (
                <>
                  {turmas.length !== 1 && <option value={TODAS}>Todas as minhas turmas</option>}
                  {turmas.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {nomeDaTurma(t)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversa com a Lumi" className="flex min-h-[140px] flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
            {mensagens.map((m) => {
              const comSecoes = Boolean(m.secoes?.length);
              const fala = (comSecoes ? m.introducao : m.texto) ? (
                <p
                  key={m.id}
                  className={cn(
                    "whitespace-pre-wrap text-[13px] leading-normal",
                    m.papel === "professor"
                      ? "ml-8 self-end rounded-[14px] rounded-br-sm bg-muted px-3 py-2 text-foreground"
                      : m.erro
                        ? "rounded-[14px] border border-destructive/50 px-3 py-2 text-foreground"
                        : "text-foreground",
                  )}
                >
                  <span className="sr-only">{m.papel === "professor" ? "Você: " : "Lumi: "}</span>
                  {comSecoes ? m.introducao : m.texto}
                </p>
              ) : null;
              if (m.papel === "professor") return fala;
              return (
                <div key={m.id} ref={m === mensagens[mensagens.length - 1] ? inicioDaResposta : undefined} className="flex scroll-mt-1 items-start gap-2">
                  <img src={fotoDaLumi} alt="" aria-hidden="true" className="mt-0.5 h-6 w-6 flex-none rounded-full bg-muted object-cover" />
                  <div className="min-w-0 flex-1">
                    {fala}
                    {comSecoes && (
                      <ul className="mt-2 flex list-none flex-col gap-2">
                        {m.secoes?.map((s) => (
                          <li key={s.titulo} className="rounded-[14px] border border-border bg-muted/40 px-3 py-2.5">
                            <h3 className="text-[13px] font-semibold text-[hsl(var(--console-bronze-text))]">{s.titulo}</h3>
                            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-normal text-foreground">{s.texto}</p>
                            {s.destino && <div className="mt-2">{botaoDeDestino(s.destino)}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.destinos && m.destinos.length > 0 && (
                      <nav aria-label="Ir para o console" className="mt-2 flex flex-wrap gap-2">
                        {m.destinos.map(botaoDeDestino)}
                      </nav>
                    )}
                    {m.tutorial && (
                      <button
                        type="button"
                        onClick={() => iniciarTutorial(m.tutorial ?? null)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--console-bronze-light))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PlayCircle size={14} aria-hidden="true" />
                        Me mostre: {m.tutorial.titulo}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {pensando && (
              <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--console-bronze-text))]" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
                {demorando ? "Pensando… o servidor pode estar acordando, isso leva até um minuto." : "Pensando…"}
              </p>
            )}
            {!conversou && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => iniciarTutorial(tutorialPorId("conhecer_console"))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--console-bronze-light))] px-3 py-[7px] text-xs font-bold text-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PlayCircle size={14} aria-hidden="true" />
                  Conhecer o console
                </button>
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pensando || turmas === null}
                    onClick={() => void enviar(s)}
                    className="rounded-full border border-border bg-muted px-3 py-[7px] text-xs text-foreground hover:border-[hsl(var(--console-bronze-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensagens[mensagens.length - 1]?.erro && ultimaPergunta && !pensando && (
              <button
                type="button"
                // Tira a pergunta que falhou e o erro, e manda de novo sobre a mesma base.
                onClick={() => void enviar(ultimaPergunta, mensagens.slice(0, -2))}
                className="self-start rounded-full border border-border px-3 py-[7px] text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Tentar de novo
              </button>
            )}
            <div ref={fim} />
          </div>

          <form
            className="flex items-end gap-2.5 border-t border-border px-3.5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(pergunta);
            }}
          >
            <label htmlFor={`${idPainel}-pergunta`} className="sr-only">
              Pergunte à Lumi
            </label>
            <textarea
              ref={campo}
              id={`${idPainel}-pergunta`}
              rows={1}
              maxLength={500}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                // Enter envia; Shift+Enter quebra linha.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enviar(pergunta);
                }
              }}
              placeholder="Pergunte à Lumi…"
              className="max-h-28 min-w-0 flex-1 resize-none rounded-[18px] border border-input bg-background px-3.5 py-[9px] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={pensando || !pergunta.trim() || turmas === null}
              aria-label="Enviar pergunta"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[hsl(var(--console-bronze-light))] text-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Send size={15} strokeWidth={2} />
            </button>
          </form>
        </div>
      , document.body)}

      {tutorial && <TutorialGuiado tutorial={tutorial} turma={turma} onFechar={() => setTutorial(null)} />}

      <div className="escriba fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-7 sm:right-8">
        <button
          ref={botao}
          type="button"
          onClick={() => (aberto ? fechar() : setAberto(true))}
          aria-expanded={aberto}
          aria-controls={aberto ? idPainel : undefined}
          aria-hidden={telaCheia}
          tabIndex={telaCheia ? -1 : 0}
          aria-label={aberto ? "Fechar a Lumi" : "Pergunte à Lumi, a guia do professor"}
          title="Pergunte à Lumi"
          className={cn("flex h-14 w-14 items-center justify-center overflow-hidden rounded-full p-[3px] bg-[linear-gradient(135deg,hsl(var(--console-bronze-light)),hsl(var(--console-bronze)))] text-[hsl(var(--background))] shadow-[0_12px_30px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", telaCheia && "pointer-events-none opacity-0")}
        >
          {aberto ? (
            <X size={22} />
          ) : (
            <img src={fotoDaLumi} alt="" aria-hidden="true" className="h-full w-full rounded-full bg-[hsl(var(--card))] object-cover" />
          )}
        </button>
      </div>
    </>
  );
}
