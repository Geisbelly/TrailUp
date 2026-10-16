import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/apiTraiupClient";
import { cn } from "@/lib/utils";
import {
  historicoParaEnvio,
  MENSAGEM_INICIAL,
  mensagemDeErro,
  nomeDaTurma,
  SUGESTOES,
  TODAS,
  turmaInicial,
  type Mensagem,
  type TurmaDoProfessor,
} from "./conversa";

// Cabe o acordar da API no plano gratuito (a primeira chamada depois de um
// tempo parado leva dezenas de segundos) mais a resposta do modelo.
const TEMPO_LIMITE_MS = 75_000;
// A partir daqui o "pensando" avisa que o servidor pode estar acordando.
const AVISO_DE_DEMORA_MS = 8_000;

const FOCAVEIS = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type Resposta = { resposta: string; turmas: number[] };

/**
 * Escriba: botão flutuante bronze + painel de conversa, em todas as telas do
 * console menos Aprovações (quem decide é o ConsoleShell). A conversa vive só
 * aqui; a API não grava nada. Com a API fora do ar o resto do console segue
 * normal — o erro fica dentro do painel.
 */
export default function Escriba() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [turmas, setTurmas] = useState<TurmaDoProfessor[] | null>(null);
  const [turma, setTurma] = useState<string>(TODAS);
  const [mensagens, setMensagens] = useState<Mensagem[]>([{ id: 0, papel: "escriba", texto: MENSAGEM_INICIAL }]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [demorando, setDemorando] = useState(false);
  const proximoId = useRef(1);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, pensando]);

  useEffect(() => {
    if (!pensando) return setDemorando(false);
    const t = window.setTimeout(() => setDemorando(true), AVISO_DE_DEMORA_MS);
    return () => window.clearTimeout(t);
  }, [pensando]);

  const fechar = useCallback(() => {
    setAberto(false);
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
        setMensagens((m) => [...m, { id: proximoId.current++, papel: "escriba", texto: r?.resposta?.trim() || "Não consegui formular uma resposta." }]);
      } catch (e) {
        setMensagens((m) => [...m, { id: proximoId.current++, papel: "escriba", texto: mensagemDeErro(e), erro: true }]);
      } finally {
        setPensando(false);
      }
    },
    [mensagens, pensando, turma],
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
      fechar();
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
    <div className="escriba fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-7 sm:right-8">
      {aberto && (
        <div
          ref={painel}
          id={idPainel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          onKeyDown={noTeclado}
          className="absolute bottom-[70px] right-0 flex max-h-[min(560px,calc(100dvh-120px))] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          {/* Bronze claro com texto escuro: o branco sobre o degradê do protótipo fica em ~2,6:1. */}
          <div className="flex items-center gap-3 bg-[hsl(var(--console-bronze-light))] px-[18px] py-4 text-[hsl(var(--background))]">
            <span aria-hidden="true" className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-black/15">
              <BookOpen size={17} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={idTitulo} className="font-['Cinzel',serif] text-sm font-bold leading-tight">
                Escriba <span className="font-sans text-[11px] font-semibold">· O guia do professor</span>
              </h2>
              <p className="text-[11px] font-medium">Lê os dados das suas turmas</p>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar o Escriba"
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

          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversa com o Escriba" className="flex min-h-[140px] flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
            {mensagens.map((m) => (
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
                <span className="sr-only">{m.papel === "professor" ? "Você: " : "Escriba: "}</span>
                {m.texto}
              </p>
            ))}
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
              Pergunte ao Escriba
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
              placeholder="Pergunte ao Escriba…"
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
      )}

      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        aria-label={aberto ? "Fechar o Escriba" : "Pergunte ao Escriba, o guia do professor"}
        title="Pergunte ao Escriba"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--console-bronze-light)),hsl(var(--console-bronze)))] text-[hsl(var(--background))] shadow-[0_12px_30px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {aberto ? <X size={22} /> : <BookOpen size={24} strokeWidth={1.7} />}
      </button>
    </div>
  );
}
