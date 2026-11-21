/**
 * O modo de cuidado no aparelho, sem React (spec `2026-11-20-modo-de-cuidado-design.md`, seção 4).
 *
 * Quem liga:
 * - o detector de sobrecarga (`sinaisDeSobrecarga.ts`), com os sinais da IA e o tempo na trilha;
 * - o Guia, quando a resposta do chat traz `modo_cuidado` (`ligarPeloGuia`);
 * - o banco, ao abrir: `cuidado_ativo` diz se há um momento valendo (reabrir o app não o perde).
 *
 * O alívio liga NA HORA, antes de qualquer rede: a RPC só grava o momento e devolve o prazo do
 * servidor. Sem consentimento (`sem_consentimento`), sem turma ou com a rede fora, o alívio fica
 * só no aparelho, com `cuidado_duracao_min`, e não há momento para responder.
 *
 * O que o modo NÃO faz, por decisão da autora: não para o cronômetro da tentativa já aberta (o
 * prazo é do servidor, #136). A tela esconde a contagem durante todo o modo, inclusive nessa
 * atividade; a próxima tentativa já vem `cronometrada === false` do servidor.
 */
import type { IATriggerSignal } from "@/interfaces/personalizacao/IAContracts";
import type {
  AcoesDoCuidado,
  ConfigDoCuidado,
  CuidadoAtivo,
  OrigemDoCuidado,
  RegistroDoCuidado,
} from "@/services/cuidadoNoBanco";
import { criarDetectorDeSobrecarga, type DetectorDeSobrecarga, type FatosDeSobrecarga } from "@/utils/sinaisDeSobrecarga";

export type NivelDoGuia = "desconforto" | "crise" | "risco";

export type EstadoDoModoDeCuidado = {
  ativo: boolean;
  /** Até quando o alívio vale (ms). */
  expiraEm: number | null;
  origem: OrigemDoCuidado | null;
  /** O aviso "Você está há um tempo nisso." do sinal de uso. */
  avisoVisivel: boolean;
  tecnicasVisiveis: boolean;
  /** O momento gravado no banco; nulo sem consentimento ou sem rede. */
  momentoId: number | null;
};

export type DependenciasDoModo = {
  registrar(params: {
    classeId: number;
    topicoId: number | null;
    fatos: FatosDeSobrecarga;
    acoes: AcoesDoCuidado;
  }): Promise<RegistroDoCuidado>;
  lerAtivo(classeId: number): Promise<CuidadoAtivo | null>;
  responder(momentoId: number, resposta: "pausou" | "continuou"): Promise<boolean>;
  agora(): number;
};

/**
 * Só quando a duração ainda não chegou do banco e o Guia ligou o modo sem prazo (aluno sem
 * consentimento). É o mesmo padrão que o banco usa se a chave faltar
 * (`fn_cuidado_config_int('cuidado_duracao_min', 120)`). O detector, ao contrário, nunca dispara
 * sem os limites do banco.
 */
const DURACAO_SEM_CONFIG_MIN = 120;

const ACOES_DO_SINAL_DE_USO: AcoesDoCuidado = { pausa_sugerida: true, cronometro_desligado: true };

const DESLIGADO: EstadoDoModoDeCuidado = {
  ativo: false,
  expiraEm: null,
  origem: null,
  avisoVisivel: false,
  tecnicasVisiveis: false,
  momentoId: null,
};

export type ModoDeCuidado = {
  estado(): EstadoDoModoDeCuidado;
  assinar(ouvinte: () => void): () => void;
  /** Limites e duração lidos de `app_config`. Sem eles, o detector fica desarmado. */
  definirConfig(config: ConfigDoCuidado | null): void;
  /** A turma atual. Pergunta ao banco se há modo valendo nela. */
  definirTurma(classeId: number | null): Promise<void>;
  registrarSinal(sinal: IATriggerSignal): void;
  registrarMinutosNaTrilha(minutosSemParar: number): void;
  ligarPeloGuia(nivel: NivelDoGuia, expiraEmIso: string | null): void;
  fazerPausa(): void;
  continuar(): void;
  abrirTecnicas(): void;
  fecharTecnicas(): void;
  /** Desliga se o prazo passou. Chamado num intervalo e quando o app volta ao primeiro plano. */
  conferirExpiracao(): void;
  /** Troca de aluno: esquece tudo. */
  zerar(): void;
};

export function criarModoDeCuidado(deps: DependenciasDoModo): ModoDeCuidado {
  let estado: EstadoDoModoDeCuidado = DESLIGADO;
  let config: ConfigDoCuidado | null = null;
  let detector: DetectorDeSobrecarga | null = null;
  let classeId: number | null = null;
  let ultimoTopicoId: number | null = null;
  let respondido = false;
  // Cada ligação nova invalida a resposta de rede da anterior.
  let geracao = 0;
  const ouvintes = new Set<() => void>();

  const mudar = (parcial: Partial<EstadoDoModoDeCuidado>) => {
    estado = { ...estado, ...parcial };
    ouvintes.forEach((ouvinte) => ouvinte());
  };

  const duracaoMs = () => (config?.duracaoMin ?? DURACAO_SEM_CONFIG_MIN) * 60_000;

  const desligar = () => {
    geracao += 1;
    respondido = false;
    detector?.zerar();
    mudar(DESLIGADO);
  };

  const responder = (resposta: "pausou" | "continuou") => {
    const momentoId = estado.momentoId;
    if (momentoId == null || respondido) return;
    respondido = true;
    // Sem esperar: a tela não trava pela rede, e falhar aqui não desfaz a pausa.
    void deps.responder(momentoId, resposta).catch(() => undefined);
  };

  const ligarPeloUso = (fatos: FatosDeSobrecarga) => {
    const minha = ++geracao;
    respondido = false;
    mudar({
      ativo: true,
      origem: "sinais_de_uso",
      expiraEm: deps.agora() + duracaoMs(),
      avisoVisivel: true,
      tecnicasVisiveis: false,
      momentoId: null,
    });
    if (classeId == null) return;
    void deps
      .registrar({ classeId, topicoId: ultimoTopicoId, fatos, acoes: ACOES_DO_SINAL_DE_USO })
      .then((registro) => {
        if (minha !== geracao || !estado.ativo) return;
        // `sem_consentimento`, `intervalo` ou falha: o alívio segue só no aparelho.
        if (!registro.ok) return;
        mudar({
          momentoId: registro.momentoId,
          expiraEm: registro.expiraEm ?? estado.expiraEm,
        });
      })
      .catch(() => undefined);
  };

  return {
    estado: () => estado,

    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },

    definirConfig(novo) {
      config = novo;
      detector = novo ? criarDetectorDeSobrecarga(novo.limites) : null;
    },

    async definirTurma(novaClasseId) {
      classeId = novaClasseId;
      if (novaClasseId == null) return;
      const minha = geracao;
      const doBanco = await deps.lerAtivo(novaClasseId).catch(() => null);
      if (classeId !== novaClasseId || minha !== geracao) return;
      if (!doBanco?.ativo || doBanco.expiraEm == null || doBanco.expiraEm <= deps.agora()) return;
      // Restaurar não mostra o aviso de novo: ele é do momento em que o sinal apareceu.
      mudar({
        ativo: true,
        origem: doBanco.origem ?? estado.origem,
        expiraEm: Math.max(doBanco.expiraEm, estado.expiraEm ?? 0),
      });
    },

    registrarSinal(sinal) {
      if (sinal.topicoId != null) ultimoTopicoId = sinal.topicoId;
      // Já em cuidado, não há o que detectar: o aviso não se repete.
      if (estado.ativo || !detector) return;
      const fatos = detector.registrarSinal(sinal);
      if (fatos) ligarPeloUso(fatos);
    },

    registrarMinutosNaTrilha(minutos) {
      if (!detector) return;
      const fatos = detector.registrarMinutosNaTrilha(minutos);
      if (fatos && !estado.ativo) ligarPeloUso(fatos);
    },

    ligarPeloGuia(_nivel, expiraEmIso) {
      // O momento é gravado pela API; aqui só o alívio. O nível não fica no aparelho.
      const doServidor = expiraEmIso ? Date.parse(expiraEmIso) : NaN;
      const expiraEm = Number.isFinite(doServidor) ? doServidor : deps.agora() + duracaoMs();
      geracao += 1;
      mudar({
        ativo: true,
        origem: "aluno_disse",
        expiraEm: Math.max(expiraEm, estado.ativo ? estado.expiraEm ?? 0 : 0),
        avisoVisivel: false,
      });
    },

    fazerPausa() {
      detector?.pausou();
      responder("pausou");
      mudar({ avisoVisivel: false, tecnicasVisiveis: true });
    },

    continuar() {
      responder("continuou");
      // "Continuar" fecha o aviso; o alívio continua até expirar.
      mudar({ avisoVisivel: false });
    },

    abrirTecnicas() {
      mudar({ tecnicasVisiveis: true });
    },

    fecharTecnicas() {
      mudar({ tecnicasVisiveis: false });
    },

    conferirExpiracao() {
      if (estado.ativo && estado.expiraEm != null && estado.expiraEm <= deps.agora()) desligar();
    },

    zerar() {
      classeId = null;
      ultimoTopicoId = null;
      desligar();
    },
  };
}

/**
 * Minutos na trilha sem parar, contando só tempo visível (trilha aberta e app em primeiro plano).
 * Ficar fora disso por `pausaMinMs` ou mais é uma pausa e recomeça a conta; sair e voltar logo,
 * não.
 */
export function criarContadorSemParar(pausaMinMs: number) {
  let acumuladoMs = 0;
  let ultimoMs: number | null = null;
  let visivel = false;
  let foraDesdeMs: number | null = null;

  return {
    marcar(visivelAgora: boolean, agoraMs: number): number {
      if (visivel && ultimoMs != null) acumuladoMs += Math.max(0, agoraMs - ultimoMs);
      if (visivelAgora) {
        if (foraDesdeMs != null && agoraMs - foraDesdeMs >= pausaMinMs) acumuladoMs = 0;
        foraDesdeMs = null;
      } else if (foraDesdeMs == null) {
        foraDesdeMs = agoraMs;
      } else if (agoraMs - foraDesdeMs >= pausaMinMs) {
        acumuladoMs = 0;
      }
      visivel = visivelAgora;
      ultimoMs = agoraMs;
      return acumuladoMs / 60_000;
    },
    zerar() {
      acumuladoMs = 0;
      ultimoMs = null;
      visivel = false;
      foraDesdeMs = null;
    },
  };
}

// ── O que o IAContext lê ─────────────────────────────────────────────────────
// O provider do modo fica DENTRO do IAProvider (precisa de `subscribeToSignals`), então o
// IAContext não pode ler o contexto dele. Esta chave pública de um bit é a ponte.

let modoAtivoGlobal = false;
const ouvintesGlobais = new Set<() => void>();

export function publicarModoDeCuidadoAtivo(ativo: boolean): void {
  if (ativo === modoAtivoGlobal) return;
  modoAtivoGlobal = ativo;
  ouvintesGlobais.forEach((ouvinte) => ouvinte());
}

export function modoDeCuidadoEstaAtivo(): boolean {
  return modoAtivoGlobal;
}

export function assinarModoDeCuidadoAtivo(ouvinte: () => void): () => void {
  ouvintesGlobais.add(ouvinte);
  return () => {
    ouvintesGlobais.delete(ouvinte);
  };
}
