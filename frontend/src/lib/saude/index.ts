import type { Metric } from "web-vitals";
import { criarColetor, gerarUuid, medirFetch, type Coletor, type SessaoDeSaude } from "./coletor";

// Adaptador do console. O `fetch` medido é instalado em `integrations/supabase/client.ts` antes de o coletor
// existir, por isso `saudeDoConsole` começa nulo: chamada anterior a `iniciarSaude` simplesmente não conta.
let saudeDoConsole: Coletor | null = null;

const INTERVALO_MS = 60_000;

declare const __TRAILUP_VERSAO__: string | null;

/** O que a professora faz e não pode falhar calada: login, salvar trilha e duplicar. */
const ESCRITA_CRITICA = new Set(["topicos", "conteudos", "atividades", "questoes", "cards"]);

export function destinoCriticoDoConsole(destino: string, metodo: string): boolean {
  if (destino === "auth/token") return true;
  if (destino.startsWith("rpc/duplicar_")) return true;
  return metodo !== "GET" && ESCRITA_CRITICA.has(destino);
}

export const fetchMedido = medirFetch(
  (entrada, init) => globalThis.fetch(entrada, init),
  (destino, metodo, status) => saudeDoConsole?.registrarChamada(destino, metodo, status),
);

export function registrarErroDeTela(erro: unknown): void {
  saudeDoConsole?.registrarErro(erro, "tela", window.location.pathname);
}

export function registrarFallbackDaApi(): void {
  saudeDoConsole?.registrarFallbackDaApi();
}

function formato(): "celular" | "desktop" {
  return window.matchMedia?.("(pointer: coarse)").matches ? "celular" : "desktop";
}

function armazenamentoLocal() {
  return {
    ler: (chave: string) => {
      try {
        return window.localStorage.getItem(chave);
      } catch {
        return null;
      }
    },
    gravar: (chave: string, valor: string) => {
      try {
        window.localStorage.setItem(chave, valor);
      } catch {
        // Sem armazenamento, a sessão vive só em memória.
      }
    },
  };
}

type ClienteDoBanco = {
  auth: { getSession(): Promise<{ data: { session: unknown } }> };
  rpc(nome: never, args: never): PromiseLike<{ error: unknown }>;
};

/** Liga a captura. `web-vitals` é carregado depois, para não pesar na primeira tela que ele mede. */
export async function iniciarSaude(banco: ClienteDoBanco): Promise<void> {
  if (saudeDoConsole || import.meta.env.DEV) return;
  const coletor = criarColetor({
    superficie: "console",
    versao: typeof __TRAILUP_VERSAO__ === "string" ? __TRAILUP_VERSAO__ : null,
    plataforma: "web",
    formato: formato(),
    armazenamento: armazenamentoLocal(),
    novoId: gerarUuid,
    destinoCritico: destinoCriticoDoConsole,
    podeEnviar: async () => Boolean((await banco.auth.getSession()).data.session),
    enviar: async (sessao: SessaoDeSaude, erros) => {
      const { error } = await banco.rpc("cliente_saude_registrar" as never, { p_sessao: sessao, p_erros: erros } as never);
      return !error;
    },
  });
  saudeDoConsole = coletor;
  await coletor.carregar();

  window.addEventListener("error", (evento) => coletor.registrarErro(evento.error ?? evento.message, "erro", window.location.pathname));
  window.addEventListener("unhandledrejection", (evento) => coletor.registrarErro(evento.reason, "promessa", window.location.pathname));

  const descarregar = () => void coletor.descarregar();
  window.setInterval(descarregar, INTERVALO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") descarregar();
    else coletor.retomar();
  });
  window.addEventListener("pagehide", descarregar);

  const { onCLS, onINP, onLCP } = await import("web-vitals");
  const registrar = (vital: "cls" | "inp_ms" | "lcp_ms") => (metrica: Metric) => coletor.registrarVital(vital, metrica.value);
  onLCP(registrar("lcp_ms"));
  onINP(registrar("inp_ms"));
  onCLS(registrar("cls"));
}
