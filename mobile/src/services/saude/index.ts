import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import { supabase } from "@/database/supabase";
import { getTelemetryConsentRecord } from "@/utils/telemetryConsent";

import { criarColetor, gerarUuid, type Coletor } from "./coletor";
import { definirColetor, destinoCriticoDoAluno } from "./medicao";
import { ligarVitais } from "./vitais";

// Adaptador do app e da web do aluno (mesmo código, `Platform` separa). Um crash nativo mata o processo
// antes do JS: quem vê isso é um SDK nativo, que não está aqui. Ver docs/architecture/monitoramento.md.

const INTERVALO_MS = 60_000;
const ESPERA_DO_FATAL_MS = 500;

let coletor: Coletor | null = null;
let inicioMarcado = false;

type ManipuladorGlobal = (erro: unknown, fatal?: boolean) => void;
type UtilidadesDeErro = { getGlobalHandler(): ManipuladorGlobal; setGlobalHandler(h: ManipuladorGlobal): void };
type GlobaisDoHermes = {
  ErrorUtils?: UtilidadesDeErro;
  HermesInternal?: {
    enablePromiseRejectionTracker?: (opcoes: { allRejections: boolean; onUnhandled: (id: number, erro: unknown) => void }) => void;
  };
};

function versaoDoApp(): string | null {
  try {
    return Constants.expoConfig?.version ?? null;
  } catch {
    return null;
  }
}

function formato(): "celular" | "desktop" {
  if (Platform.OS !== "web") return "celular";
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "celular" : "desktop";
}

/** Sem sessão ou sem a coleta de desempenho aceita, nada sai do aparelho. */
async function podeEnviar(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const consentimento = await getTelemetryConsentRecord();
  return consentimento?.status === "accepted" && consentimento.preferences.performanceEnabled;
}

function capturarNoAparelho(ativo: Coletor): void {
  const globais = globalThis as unknown as GlobaisDoHermes;
  const utilidades = globais.ErrorUtils;
  if (utilidades) {
    const anterior = utilidades.getGlobalHandler();
    utilidades.setGlobalHandler((erro, fatal) => {
      ativo.registrarErro(erro, fatal ? "fatal" : "erro");
      if (!fatal) return anterior(erro, fatal);
      // O manipulador padrão encerra o app: dá tempo de o erro chegar ao disco, sem segurar a saída.
      const espera = new Promise((pronto) => setTimeout(pronto, ESPERA_DO_FATAL_MS));
      void Promise.race([ativo.guardar(), espera]).finally(() => anterior(erro, fatal));
    });
  }
  try {
    globais.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, erro) => ativo.registrarErro(erro, "promessa"),
    });
  } catch {
    // Sem o rastreador, promessa rejeitada só não é contada.
  }
}

function capturarNoNavegador(ativo: Coletor): void {
  const rota = () => window.location.pathname;
  window.addEventListener("error", (e) => ativo.registrarErro(e.error ?? e.message, "erro", rota()));
  window.addEventListener("unhandledrejection", (e) => ativo.registrarErro(e.reason, "promessa", rota()));
  window.addEventListener("pagehide", () => void ativo.descarregar());
}

export function iniciarSaude(): void {
  // O export da web renderiza este módulo no Node: lá não há `window` nem aluno para medir.
  if (coletor || __DEV__ || (Platform.OS === "web" && typeof window === "undefined")) return;
  const ativo = criarColetor({
    superficie: Platform.OS === "web" ? "web_aluno" : "app",
    versao: versaoDoApp(),
    plataforma: Platform.OS,
    formato: formato(),
    armazenamento: { ler: (c) => AsyncStorage.getItem(c), gravar: (c, v) => AsyncStorage.setItem(c, v) },
    novoId: gerarUuid,
    destinoCritico: destinoCriticoDoAluno,
    podeEnviar,
    enviar: async (sessao, erros) => {
      const { error } = await supabase.rpc("cliente_saude_registrar", { p_sessao: sessao, p_erros: erros });
      return !error;
    },
  });
  coletor = ativo;
  definirColetor(ativo);
  if (Platform.OS === "web") capturarNoNavegador(ativo);
  else capturarNoAparelho(ativo);
  void ativo.carregar();

  setInterval(() => void ativo.descarregar(), INTERVALO_MS);
  AppState.addEventListener("change", (estado) => {
    if (estado === "active") ativo.retomar();
    else void ativo.descarregar();
  });
  ligarVitais(ativo);
}

export function registrarErroDeTela(erro: unknown): void {
  coletor?.registrarErro(erro, "tela", Platform.OS === "web" ? window.location.pathname : null);
}

/** Início do app até a sessão resolvida. Mede a abertura, não a tela com dado. Só no aparelho e uma vez. */
export function marcarInicio(): void {
  if (inicioMarcado || Platform.OS === "web") return;
  inicioMarcado = true;
  coletor?.registrarVital("inicio_ms", performance.now());
}
