import {
  clampPercent,
  normalizeEventType,
  normalizeNullableNonNegativeNumber,
  normalizeReferencia,
} from "@/utils/dataValidation";
import { gerarUuid } from "@/utils/uuid";

/**
 * Construção do que vai ser gravado de progresso, tempo e pontos -- pura, sem
 * I/O.
 *
 * Existe por dois motivos.
 *
 * **Um lugar só para a forma da escrita.** Os gravadores estão espalhados em
 * `models/Conteudo`, `models/Atividade`, `models/Topico`, `models/Classe` e
 * `context/TrilhaContext`, e cada um montava o payload à mão. Foi assim que
 * `acertos_percentual: this.acertos_percentual ?? 0` entrou num caminho que só
 * queria registrar visita e passou a zerar a taxa de acertos do aluno.
 *
 * **Poder testar sem rede.** Nada aqui importa o cliente do Supabase nem o
 * AsyncStorage, então o teste roda em `node --import tsx --test` puro. O que
 * importa verificar é a FORMA: que o evento de pontos carrega chave de
 * idempotência, que ninguém escreve `tempo_gasto_min`, que a coluna que o
 * chamador não conhece fica de fora.
 *
 * ## A regra que governa este arquivo
 *
 * **Coluna que o chamador não conhece não entra no upsert.** O `ON CONFLICT`
 * só toca no que foi enviado, então omitir preserva o que está no banco --
 * enquanto mandar um palpite (zero, `?? 0`, o valor velho da memória do app)
 * sobrescreve o certo. Por isso cada campo opcional é testado com `in`: passar
 * `null` de propósito é diferente de não passar.
 */

export type StatusAtividade = "não iniciado" | "em andamento" | "concluido";

/**
 * A escrita pendente é guardada como INTENÇÃO serializável -- tabela, valores
 * e alvo do conflito -- e não como função. A fila vive em disco e sobrevive à
 * morte do app: um closure não sobreviveria.
 */
export type EscritaPendente =
  | {
      operacao: "upsert";
      tabela: string;
      valores: Record<string, unknown>;
      onConflict: string;
    }
  | {
      operacao: "insert";
      tabela: string;
      valores: Record<string, unknown>;
    };

export function resolverStatusPorPercentual(
  percentual: number,
): StatusAtividade {
  if (percentual >= 100) return "concluido";
  if (percentual > 0) return "em andamento";
  return "não iniciado";
}

/**
 * Converte o que o modelo tem em memória num rótulo do enum `status_atividade`.
 *
 * Os rótulos do enum têm acento (`não iniciado`, `em andamento`, `concluido`)
 * e o que chega aqui é `string | null`, vindo do banco ou de um palpite local.
 * Passar por esta função evita o `as StatusAtividade` no chamador, que calaria
 * um rótulo inválido em vez de descartá-lo, e devolve a grafia certa mesmo
 * para quem mandou `'nao iniciado'` -- que compila e só falha em produção, na
 * atribuição ao enum.
 *
 * Devolve `undefined` para o que não reconhece, e `undefined` significa "não
 * mando a coluna": preservar o que está no banco é sempre melhor do que
 * escrever um palpite.
 */
export function normalizarStatus(valor: unknown): StatusAtividade | undefined {
  const bruto = String(valor ?? "").trim().toLowerCase();

  if (!bruto) return undefined;
  if (bruto.startsWith("concl")) return "concluido";
  if (bruto.startsWith("em andamento")) return "em andamento";
  // As duas grafias: o rótulo do enum tem acento, mas código antigo e payload
  // vindo de fora já chegaram sem ele.
  if (bruto === "não iniciado" || bruto === "nao iniciado") return "não iniciado";

  return undefined;
}

/**
 * O status que dá para AFIRMAR a partir do que o modelo tem em memória.
 *
 * Nunca inventa `em andamento`. Foi assim que uma atividade concluída voltou a
 * ficar "em andamento" em produção: `registrarVisita` mandava
 * `this.status ?? "em andamento"`, e quando o modelo local estava sem o rótulo
 * carregado o palpite ia por cima da linha concluída. O `percentual_concluido`
 * ficou em 100 e o status caiu -- os dois discordando na mesma linha, que é
 * como a divergência foi encontrada.
 *
 * A regra: se o rótulo é reconhecível, vale ele; se não é mas o percentual
 * prova conclusão, vale `concluido`; senão devolve `undefined`, e `undefined`
 * significa não mandar a coluna. Abrir uma atividade e não fazer nada não é
 * progresso -- quem declara que começou é `marcarIniciada`, que é outra
 * chamada, e o default da coluna (`não iniciado`) cobre a linha nova.
 */
export function statusConhecido(params: {
  status?: unknown;
  percentual?: number | null;
}): StatusAtividade | undefined {
  const doRotulo = normalizarStatus(params.status);
  if (doRotulo) return doRotulo;

  const percentual = Number(params.percentual ?? Number.NaN);
  if (Number.isFinite(percentual) && percentual >= 100) return "concluido";

  return undefined;
}

/**
 * `tempo_gasto_min` é derivada por trigger a partir da telemetria em
 * `conteudo_aluno`, `atividade_aluno` e `topico_aluno` (`20260826_19`) --
 * nenhum cliente escreve essa coluna, e nenhuma função deste arquivo a emite.
 *
 * Não é preferência de estilo. O contador do cliente era leitura-soma-escrita
 * e perdia todo intervalo cuja escrita falhasse: media 29x a menos que a soma
 * real, e o tópico chegava a marcar menos tempo que um conteúdo dentro dele.
 * Um upsert com essa coluna, ainda que com o valor da memória do app, apaga o
 * que o trigger calculou.
 */
export const COLUNAS_DERIVADAS = ["tempo_gasto_min"] as const;

type CamposDeProgresso = {
  status?: StatusAtividade;
  percentual?: number;
};

/**
 * Emite `status` e `percentual_concluido` só quando o chamador os conhece.
 *
 * Quando vem percentual sem status, o status sai dele: guardar os dois
 * discordando entre si é como uma atividade termina "em andamento" com 100%.
 */
function camposDeProgresso(params: CamposDeProgresso): Record<string, unknown> {
  const percentual =
    "percentual" in params && params.percentual != null
      ? clampPercent(params.percentual)
      : null;

  const status =
    params.status ??
    (percentual == null ? undefined : resolverStatusPorPercentual(percentual));

  return {
    ...(status === undefined ? {} : { status }),
    ...(percentual == null ? {} : { percentual_concluido: percentual }),
  };
}

export function construirEscritaDeConteudo(
  params: CamposDeProgresso & {
    alunoId: string;
    conteudoId: number;
    agora?: string;
  },
): EscritaPendente {
  const agora = params.agora ?? new Date().toISOString();

  return {
    operacao: "upsert",
    tabela: "conteudo_aluno",
    onConflict: "aluno_id,conteudo_id",
    valores: {
      aluno_id: params.alunoId,
      conteudo_id: params.conteudoId,
      ...camposDeProgresso(params),
      ultima_visualizacao: agora,
      updated_at: agora,
    },
  };
}

export function construirEscritaDeAtividade(
  params: CamposDeProgresso & {
    alunoId: string;
    atividadeId: number;
    acertosPercentual?: number | null;
    pontuacaoObtida?: number | null;
    pontuacaoMaxima?: number | null;
    avaliacaoMetadata?: Record<string, unknown> | null;
    agora?: string;
  },
): EscritaPendente {
  const agora = params.agora ?? new Date().toISOString();

  return {
    operacao: "upsert",
    tabela: "atividade_aluno",
    onConflict: "aluno_id,atividade_id",
    valores: {
      aluno_id: params.alunoId,
      atividade_id: params.atividadeId,
      ...camposDeProgresso(params),
      // Zero é "errou tudo"; nulo é "não há nota". Quem registra visita não
      // sabe a nota e por isso não manda a chave -- se mandasse zero, reabrir
      // a atividade derrubaria a taxa de acertos do aluno.
      ...("acertosPercentual" in params
        ? {
            acertos_percentual:
              params.acertosPercentual == null
                ? null
                : clampPercent(params.acertosPercentual),
          }
        : {}),
      ...("pontuacaoObtida" in params
        ? { pontuacao_obtida: params.pontuacaoObtida ?? null }
        : {}),
      ...("pontuacaoMaxima" in params
        ? { pontuacao_maxima: params.pontuacaoMaxima ?? null }
        : {}),
      ...("avaliacaoMetadata" in params
        ? { avaliacao_metadata: params.avaliacaoMetadata ?? {} }
        : {}),
      ultima_visualizacao: agora,
      updated_at: agora,
    },
  };
}

/**
 * Registro de visita ao tópico: qual foi a última atividade tocada e quando.
 *
 * Não aceita `percentual` de propósito. O percentual do tópico sai de
 * `trailup_recalcular_topico_aluno`, cujo denominador é o material
 * personalizado (`20260826_18`); a conta local só enxerga o material do
 * professor e roda DEPOIS do trigger, então gravá-la aqui escreve um número
 * menor por cima do certo -- e ele fica de pé até que alguma OUTRA escrita
 * dispare o recálculo, podendo ser nunca.
 *
 * `status` é aceito porque a conclusão do tópico ainda é declarada pelo
 * cliente (`Topico.marcarConcluido`): é dela que sai o desbloqueio dos
 * próximos tópicos depois de o app ser reaberto. Quem só registra visita não
 * manda.
 */
export function construirEscritaDeTopico(params: {
  alunoId: string;
  topicoId: number;
  status?: StatusAtividade;
  ultimaAtividadeId?: number | null;
  agora?: string;
}): EscritaPendente {
  const agora = params.agora ?? new Date().toISOString();

  return {
    operacao: "upsert",
    tabela: "topico_aluno",
    onConflict: "aluno_id,topico_id",
    valores: {
      aluno_id: params.alunoId,
      topico_id: params.topicoId,
      ...(params.status === undefined ? {} : { status: params.status }),
      // Mandar null apagaria o ponto de retomada do aluno, então a coluna só
      // entra quando o chamador diz alguma coisa sobre ela.
      ...("ultimaAtividadeId" in params
        ? { ultima_atividade: params.ultimaAtividadeId ?? null }
        : {}),
      ultima_visualizacao: agora,
      updated_at: agora,
    },
  };
}

export function construirEscritaDePontos(params: {
  alunoId: string;
  tipo?: string;
  referencia?: string | number | null;
  valor?: number | null;
  chave?: string;
}): EscritaPendente {
  return {
    operacao: "insert",
    tabela: "eventos_aluno",
    valores: {
      aluno_id: params.alunoId,
      tipo: normalizeEventType(params.tipo ?? "atividade", "atividade"),
      referencia: normalizeReferencia(params.referencia ?? null),
      valor: normalizeNullableNonNegativeNumber(params.valor ?? 0) ?? 0,
      // A chave nasce AQUI, antes da primeira tentativa, e viaja com a escrita
      // para o disco. É isso que torna a retentativa segura: a segunda entrega
      // da mesma escrita bate no índice `eventos_aluno_idempotencia_unico`,
      // devolve 23505, e a fila trata 23505 como definitivo -- sai da fila em
      // vez de pagar de novo.
      //
      // Gerá-la na hora de REENVIAR faria o oposto: cada tentativa teria chave
      // nova e duplicaria o ponto. Para os tipos creditados (presença,
      // participação, conquista) o índice parcial já protegia; para
      // `atividade` -- o default -- não havia proteção nenhuma.
      idempotencia_key: params.chave ?? gerarUuid(),
    },
  };
}
