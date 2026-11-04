import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import fotoDaLumi from "@/assets/design/lumi.webp";
import { alvoNaTela, caminhoDoPasso, posicaoDoBalao, type Retangulo, type Tutorial } from "./tutoriais";

// A tela do passo é lazy e pode ler do banco: o alvo demora a aparecer.
const ESPERA_DO_ALVO_MS = 2500;
const INTERVALO_MS = 120;
const RESPIRO = 6;

function retanguloDoAlvo(alvo: string | undefined): Retangulo | null {
  if (!alvo) return null;
  const el = document.querySelector<HTMLElement>(`[data-tutorial="${alvo}"]`);
  if (!el) return null;
  const { top, left, width, height } = el.getBoundingClientRect();
  const r = { top, left, width, height };
  return alvoNaTela(r, { width: window.innerWidth, height: window.innerHeight }) ? r : null;
}

/**
 * O tutorial guiado da Lumi. Cobre a página de propósito, como o tutorial de
 * entrada do app: um formulário aberto por baixo prenderia o foco e o balão
 * deixaria de responder. Não grava nada; fechar é sempre seguro. Alvo que não
 * está na tela (turma vazia, menu em gaveta) não trava: o balão vai ao centro.
 */
export default function TutorialGuiado({ tutorial, turma, onFechar }: { tutorial: Tutorial; turma: string; onFechar: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [indice, setIndice] = useState(0);
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const balao = useRef<HTMLDivElement>(null);
  const avancar = useRef<HTMLButtonElement>(null);
  const passo = tutorial.passos[indice];
  const ultimo = indice === tutorial.passos.length - 1;

  useEffect(() => {
    const caminho = caminhoDoPasso(passo, turma);
    if (`${location.pathname}${location.search}` !== caminho) navigate(caminho);
    // Só ao trocar de passo: seguir a URL traria de volta quem usa o botão voltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo]);

  useEffect(() => {
    setAlvo(null);
    if (!passo.alvo) return;
    const inicio = Date.now();
    const procurar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tutorial="${passo.alvo}"]`);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        setAlvo(retanguloDoAlvo(passo.alvo));
      }
      if (el || Date.now() - inicio >= ESPERA_DO_ALVO_MS) window.clearInterval(id);
    };
    const id = window.setInterval(procurar, INTERVALO_MS);
    procurar();
    return () => window.clearInterval(id);
  }, [passo]);

  useEffect(() => {
    const atualizar = () => setAlvo(retanguloDoAlvo(passo.alvo));
    window.addEventListener("resize", atualizar);
    window.addEventListener("scroll", atualizar, true);
    return () => {
      window.removeEventListener("resize", atualizar);
      window.removeEventListener("scroll", atualizar, true);
    };
  }, [passo]);

  useLayoutEffect(() => {
    if (!balao.current) return;
    const { width, height } = balao.current.getBoundingClientRect();
    setPosicao(posicaoDoBalao(alvo, { width: window.innerWidth, height: window.innerHeight }, { width, height }));
  }, [alvo, indice]);

  // `visibility: hidden` não recebe foco, então espera o balão ter lugar. A troca de
  // tela também derruba o foco para o body: `alvo` muda depois dela e o devolve.
  const posicionado = posicao !== null;
  useEffect(() => {
    if (posicionado && !balao.current?.contains(document.activeElement)) avancar.current?.focus();
  }, [indice, posicionado, alvo, location.pathname]);

  const proximo = useCallback(() => {
    if (ultimo) onFechar();
    else setIndice((i) => i + 1);
  }, [ultimo, onFechar]);

  // Na janela, não no balão: com o foco no body as teclas nem passariam por ele.
  useEffect(() => {
    const noTeclado = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar();
        return;
      }
      if (!balao.current) return;
      const botoes = [...balao.current.querySelectorAll<HTMLElement>("button")];
      const atual = botoes.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Enter" && atual < 0) {
        e.preventDefault();
        proximo();
      } else if (e.key === "Tab") {
        e.preventDefault();
        botoes[(atual + (e.shiftKey ? botoes.length - 1 : 1)) % botoes.length]?.focus();
      }
    };
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [onFechar, proximo]);

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      {alvo ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-[hsl(var(--console-bronze-light))] transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: alvo.top - RESPIRO,
            left: alvo.left - RESPIRO,
            width: alvo.width + RESPIRO * 2,
            height: alvo.height + RESPIRO * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/60" />
      )}

      <div
        ref={balao}
        role="dialog"
        aria-modal="true"
        aria-label={`Tutorial: ${tutorial.titulo}`}
        className="fixed w-[min(320px,calc(100vw-32px))] rounded-[18px] border border-border bg-card p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        style={posicao ?? { visibility: "hidden" }}
      >
        <div className="flex items-center gap-2">
          <img src={fotoDaLumi} alt="" aria-hidden="true" className="h-7 w-7 flex-none rounded-full bg-muted object-cover" />
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">
            {tutorial.titulo} · {indice + 1} de {tutorial.passos.length}
          </p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Sair do tutorial"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>
        <div aria-live="polite">
          <h2 className="mt-2 text-[15px] font-bold text-foreground">{passo.titulo}</h2>
          <p className="mt-1 text-[13px] leading-normal text-foreground">{passo.texto}</p>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {indice > 0 && (
            <button
              type="button"
              onClick={() => setIndice((i) => i - 1)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Voltar
            </button>
          )}
          <button
            ref={avancar}
            type="button"
            onClick={proximo}
            className="rounded-full bg-[hsl(var(--console-bronze-light))] px-4 py-1.5 text-xs font-bold text-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
