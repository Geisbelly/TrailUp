// Coletor de saúde do cliente. Mesmo arquivo em `frontend/src/lib/saude/coletor.ts` e em
// `mobile/src/services/saude/coletor.ts`, conferido por `coletor.test.ts`: sem React, sem
// navegador e sem react-native, para valer nos três lugares e rodar em Node.
//
// Grava no aparelho antes de enviar: a falha some justamente quando a rede cai. Só contadores e erros
// agregados saem daqui, nunca texto digitado, stack ou URL com id. Destino e fim no banco:
// `cliente_saude_registrar` (migration 20261105_14).

export type Superficie = "console" | "web_aluno" | "app";
// `tratado`: o que o cliente já pegou e mostrou como aviso (`avisarFalha`). Não dispara e-mail.
export type TipoDeErro = "erro" | "promessa" | "tela" | "fatal" | "tratado";
export type Vital = "lcp_ms" | "inp_ms" | "cls" | "inicio_ms";

export type ErroAgregado = {
  assinatura: string;
  tipo: TipoDeErro;
  nome: string;
  mensagem: string | null;
  rota: string | null;
  em: string;
  vezes: number;
};

export type SessaoDeSaude = {
  id: string;
  superficie: Superficie;
  versao: string | null;
  plataforma: string | null;
  formato: "celular" | "desktop" | null;
  inicio: string;
  ultima_em: string;
  erros: number;
  chamadas: number;
  falhas_servidor: number;
  sem_resposta: number;
  criticas: number;
  criticas_falha: number;
  fallback_api: number;
  falhas_por_destino: Record<string, number>;
  lcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  inicio_ms?: number;
};

type Estado = { sessao: SessaoDeSaude; erros: ErroAgregado[]; anteriores: { sessao: SessaoDeSaude; erros: ErroAgregado[] }[] };

export type Armazenamento = {
  ler(chave: string): Promise<string | null> | string | null;
  gravar(chave: string, valor: string): Promise<void> | void;
};

export type DepsDoColetor = {
  superficie: Superficie;
  versao: string | null;
  plataforma: string | null;
  formato: "celular" | "desktop" | null;
  armazenamento: Armazenamento;
  /** Grava no banco. Rejeita ou devolve false quando não deu; o estado fica para a próxima. */
  enviar: (sessao: SessaoDeSaude, erros: ErroAgregado[]) => Promise<boolean>;
  /** Tem sessão e pode coletar? No aluno, inclui a coleta aceita. */
  podeEnviar: () => Promise<boolean> | boolean;
  novoId: () => string;
  agora?: () => number;
  destinoCritico?: (destino: string, metodo: string) => boolean;
};

export const CHAVE_DO_ESTADO = "trailup:saude:v1";
/** Sem uso por mais que isso, a volta é outra sessão (o corte do GA4). */
export const SESSAO_OCIOSA_MS = 30 * 60_000;
const MAX_ERROS = 20;
const MAX_ANTERIORES = 5;
const MAX_DESTINOS = 20;
const LIMITE_MENSAGEM = 160;

/** Tira do texto o que pode identificar alguém. O banco repete a limpeza. */
export function limparTexto(texto: unknown, limite = LIMITE_MENSAGEM): string | null {
  if (typeof texto !== "string") return null;
  const limpo = texto
    .replace(/[^\s@]+@[^\s@]+/g, "<email>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\d{4,}/g, "<n>")
    .trim()
    .slice(0, limite);
  return limpo || null;
}

/** `/turma/123/aluno/3f2b...?x=1` vira `/turma/:id/aluno/:id`. */
export function normalizarRota(rota: unknown): string | null {
  if (typeof rota !== "string" || !rota) return null;
  const caminho = rota.split(/[?#]/)[0];
  const partes = caminho.split("/").map((p) => (/^\d+$|^[0-9a-f-]{16,}$/i.test(p) ? ":id" : p));
  return limparTexto(partes.join("/"), 80);
}

/** `.../rest/v1/rpc/loja_saldo?x=1` vira `rpc/loja_saldo`; `.../rest/v1/topicos` vira `topicos`. */
export function normalizarDestino(url: string): string | null {
  const m = /\/(rest|auth|functions|storage)\/v1\/([^?#]*)/.exec(url);
  if (!m) return null;
  const caminho = m[2].toLowerCase();
  const destino = m[1] === "rest" ? caminho : m[1] === "functions" ? `fn/${caminho}` : `${m[1]}/${caminho.split("/")[0]}`;
  const limpo = destino.replace(/[^a-z0-9_/-]/g, "").slice(0, 80);
  return limpo || null;
}

/** Hash curto e estável: não precisa ser seguro, só juntar o mesmo erro. */
export function assinaturaDe(partes: (string | null)[]): string {
  let hash = 5381;
  for (const c of partes.join("|")) hash = ((hash * 33) ^ c.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

/** UUID v4. Hermes não tem `crypto.randomUUID`, e o id só separa sessões: `Math.random` basta. */
export function gerarUuid(): string {
  const nativo = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (nativo) return nativo.call(globalThis.crypto);
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export type DescricaoDoErro = { nome: string; mensagem: string | null };

export function descreverErro(erro: unknown): DescricaoDoErro {
  if (erro instanceof Error) return { nome: limparTexto(erro.name, 60) ?? "Error", mensagem: limparTexto(erro.message) };
  if (typeof erro === "string") return { nome: "Error", mensagem: limparTexto(erro) };
  // O erro do Supabase (`PostgrestError`, `AuthError` serializado) é objeto comum, não `Error`: sem isto
  // toda RPC recusada chegava como `Desconhecido`, sem mensagem. O código (`P0001`, `42501`) não entra no
  // nome: a limpeza troca 4 dígitos por `<n>`, aqui e no banco. A mensagem já diz o que houve.
  if (eObjeto(erro) && typeof erro.message === "string") {
    const nome = typeof erro.name === "string" && erro.name ? erro.name : "Supabase";
    return { nome: limparTexto(nome, 60) ?? "Supabase", mensagem: limparTexto(erro.message) };
  }
  return { nome: "Desconhecido", mensagem: null };
}

/** Erro sem informação nenhuma, de script de outra origem ou de extensão: nada para agir. */
export function eRuido(descricao: DescricaoDoErro): boolean {
  return /^(Script error\.?|ResizeObserver loop)/.test(descricao.mensagem ?? "");
}

function eObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function criarColetor(deps: DepsDoColetor) {
  const agora = deps.agora ?? (() => Date.now());
  const iso = (ms: number) => new Date(ms).toISOString();
  const novaSessao = (): SessaoDeSaude => ({
    id: deps.novoId(),
    superficie: deps.superficie,
    versao: deps.versao,
    plataforma: deps.plataforma,
    formato: deps.formato,
    inicio: iso(agora()),
    ultima_em: iso(agora()),
    erros: 0,
    chamadas: 0,
    falhas_servidor: 0,
    sem_resposta: 0,
    criticas: 0,
    criticas_falha: 0,
    fallback_api: 0,
    falhas_por_destino: {},
  });

  const estado: Estado = { sessao: novaSessao(), erros: [], anteriores: [] };
  let sujo = false;
  let enviando = false;

  const persistir = async (): Promise<void> => {
    try {
      await deps.armazenamento.gravar(CHAVE_DO_ESTADO, JSON.stringify(estado));
    } catch {
      // Armazenamento bloqueado: a sessão segue em memória.
    }
  };

  const tocar = () => {
    estado.sessao.ultima_em = iso(agora());
    sujo = true;
  };

  return {
    /** Lê o que ficou de antes: a sessão interrompida (travou, sem rede) vai junto no próximo envio. */
    async carregar(): Promise<void> {
      try {
        const bruto = await deps.armazenamento.ler(CHAVE_DO_ESTADO);
        if (!bruto) return;
        const lido = JSON.parse(bruto) as Partial<Estado>;
        const antigas = Array.isArray(lido.anteriores) ? lido.anteriores : [];
        if (eObjeto(lido.sessao) && typeof lido.sessao.id === "string") {
          antigas.push({ sessao: lido.sessao, erros: Array.isArray(lido.erros) ? lido.erros : [] });
        }
        estado.anteriores = [...antigas, ...estado.anteriores].slice(-MAX_ANTERIORES);
        sujo = estado.anteriores.length > 0;
      } catch {
        // Estado corrompido não pode impedir o app de abrir.
      }
    },

    registrarErro(erro: unknown, tipo: TipoDeErro, rota?: string | null): void {
      const descricao = descreverErro(erro);
      if (eRuido(descricao)) return;
      const rotaLimpa = normalizarRota(rota);
      // Na falha tratada a rota é o lugar do código (`questao/confirmar`): a mesma recusa em dois lugares são
      // dois problemas. Nos outros tipos a assinatura fica como era, para não partir o que já foi contado.
      const assinatura = assinaturaDe(tipo === "tratado" ? [descricao.nome, descricao.mensagem, tipo, rotaLimpa] : [descricao.nome, descricao.mensagem, tipo]);
      estado.sessao.erros += 1;
      const existente = estado.erros.find((e) => e.assinatura === assinatura);
      if (existente) existente.vezes += 1;
      else if (estado.erros.length < MAX_ERROS) {
        estado.erros.push({ assinatura, tipo, nome: descricao.nome, mensagem: descricao.mensagem, rota: rotaLimpa, em: iso(agora()), vezes: 1 });
      }
      tocar();
      // Grava na hora: o erro fatal pode ser a última coisa que este processo faz.
      void persistir();
    },

    /** Para quem precisa esperar a gravação antes de deixar o processo morrer. */
    guardar: persistir,

    registrarChamada(destino: string, metodo: string, status: number | null): void {
      const s = estado.sessao;
      s.chamadas += 1;
      const critica = deps.destinoCritico?.(destino, metodo) ?? false;
      if (critica) s.criticas += 1;
      if (status === null) {
        s.sem_resposta += 1;
      } else {
        const falhaDeServidor = status >= 500;
        if (falhaDeServidor) s.falhas_servidor += 1;
        if (critica && (status < 200 || status >= 300)) s.criticas_falha += 1;
        if (falhaDeServidor && (destino in s.falhas_por_destino || Object.keys(s.falhas_por_destino).length < MAX_DESTINOS)) {
          s.falhas_por_destino[destino] = (s.falhas_por_destino[destino] ?? 0) + 1;
        }
      }
      tocar();
    },

    registrarVital(vital: Vital, valor: number): void {
      if (!Number.isFinite(valor) || valor < 0) return;
      estado.sessao[vital] = vital === "cls" ? Math.round(valor * 1000) / 1000 : Math.round(valor);
      tocar();
    },

    registrarFallbackDaApi(): void {
      estado.sessao.fallback_api += 1;
      tocar();
    },

    /** Volta do segundo plano. Passou do corte, o que veio antes vira sessão anterior. */
    retomar(): void {
      if (agora() - Date.parse(estado.sessao.ultima_em) < SESSAO_OCIOSA_MS) return;
      estado.anteriores = [...estado.anteriores, { sessao: estado.sessao, erros: estado.erros }].slice(-MAX_ANTERIORES);
      estado.sessao = novaSessao();
      estado.erros = [];
      sujo = true;
      void persistir();
    },

    /** Envia o acumulado. Só apaga o que o banco confirmou. Sem sujeira, não gasta rede. */
    async descarregar(): Promise<boolean> {
      if (enviando || !sujo) return false;
      enviando = true;
      try {
        await persistir();
        if (!(await deps.podeEnviar())) return false;
        while (estado.anteriores.length > 0) {
          const proxima = estado.anteriores[0];
          if (!(await deps.enviar(proxima.sessao, proxima.erros))) return false;
          estado.anteriores = estado.anteriores.slice(1);
        }
        const enviados = estado.erros;
        const fotografia: SessaoDeSaude = { ...estado.sessao, falhas_por_destino: { ...estado.sessao.falhas_por_destino } };
        sujo = false;
        if (!(await deps.enviar(fotografia, enviados))) {
          sujo = true;
          return false;
        }
        estado.erros = estado.erros.filter((e) => !enviados.includes(e));
        await persistir();
        return true;
      } catch {
        sujo = true;
        return false;
      } finally {
        enviando = false;
      }
    },

    /** Só para teste e para o painel de depuração. */
    fotografia(): Estado {
      return estado;
    },
  };
}

export type Coletor = ReturnType<typeof criarColetor>;

/** Embrulha o `fetch` do cliente Supabase. Nunca muda a resposta, só conta. */
export function medirFetch(
  base: typeof fetch,
  aoChamar: (destino: string, metodo: string, status: number | null) => void,
): typeof fetch {
  return async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const destino = normalizarDestino(url);
    const metodo = (init?.method ?? (typeof entrada === "object" && "method" in entrada ? entrada.method : "GET")).toUpperCase();
    // A própria gravação fica de fora: contar a si mesma faria toda sessão ter chamada para sempre.
    const medir = destino !== null && destino !== "rpc/cliente_saude_registrar";
    try {
      const resposta = await base(entrada, init);
      if (medir) aoChamar(destino, metodo, resposta.status);
      return resposta;
    } catch (erro) {
      const abortada = eObjeto(erro) && erro.name === "AbortError";
      if (medir && !abortada) aoChamar(destino, metodo, null);
      throw erro;
    }
  };
}
