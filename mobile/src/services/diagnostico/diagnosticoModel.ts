/**
 * Diagnóstico curto antes do tópico (`diagnostico_topico`, migração `20261105_22`, #137).
 *
 * O banco pede, guarda, corrige e decide o nível; a IA (API) só escreve as perguntas. O app lê a própria
 * linha e chama as RPCs `diagnostico_pedir`, `diagnostico_responder` e `diagnostico_dispensar`. O gabarito
 * nunca chega aqui: quem corrige é o banco.
 *
 * Tudo aqui é função pura (sem rede, sem React), para travar com teste o que a tela promete ao aluno:
 * é opcional, não vale nota e nunca bloqueia o tópico.
 */

export type NivelDoDiagnostico = "inicial" | "intermediario" | "avancado";

export type StatusDoDiagnostico = "pendente" | "pronto" | "respondido" | "sem_ia" | "dispensado";

/** Resposta de `diagnostico_pedir`: `retido` e `ja_iniciado` não criam linha nenhuma. */
export type PedidoDeDiagnostico = {
  id?: string | null;
  status: StatusDoDiagnostico | "retido" | "ja_iniciado";
};

export type PerguntaDoDiagnostico = { id: number; enunciado: string; opcoes: string[] };

export type LinhaDoDiagnostico = {
  id: string;
  status: StatusDoDiagnostico;
  perguntas: unknown;
  nivel: NivelDoDiagnostico | null;
};

export type FaseDoDiagnostico = "nada" | "preparando" | "pronto" | "respondido";

export const COLUNAS_DIAGNOSTICO = "id,status,perguntas,nivel";

/** Consulta a linha de novo enquanto a IA escreve: 4 s, 8 s, 12 s... no máximo 20 s entre as consultas. */
export const MAX_CONSULTAS = 10;

export function intervaloDaConsulta(tentativa: number): number {
  return Math.min(20_000, 4_000 * (Math.max(1, tentativa)));
}

/**
 * Perguntas como o banco guardou (`[{id, enunciado, opcoes}]`). O que não for texto ou vier incompleto é
 * descartado em vez de quebrar a tela: o diagnóstico é um extra e nunca pode derrubar o tópico.
 */
export function lerPerguntas(bruto: unknown): PerguntaDoDiagnostico[] {
  if (!Array.isArray(bruto)) return [];
  const perguntas: PerguntaDoDiagnostico[] = [];
  for (const item of bruto) {
    const p = item as { id?: unknown; enunciado?: unknown; opcoes?: unknown } | null;
    if (!p || typeof p.enunciado !== "string" || !Array.isArray(p.opcoes)) continue;
    const opcoes = p.opcoes.filter((o): o is string => typeof o === "string" && o.trim().length > 0);
    if (opcoes.length < 2) continue;
    perguntas.push({ id: Number.isFinite(Number(p.id)) ? Number(p.id) : perguntas.length, enunciado: p.enunciado, opcoes });
  }
  return perguntas;
}

/** O que a tela mostra a partir do que o banco devolveu. Só `pronto` e `preparando` ocupam a tela. */
export function faseDoDiagnostico(pedido: PedidoDeDiagnostico | null, linha: LinhaDoDiagnostico | null): FaseDoDiagnostico {
  const status = linha?.status ?? (pedido && pedido.status !== "retido" && pedido.status !== "ja_iniciado" ? pedido.status : null);
  if (status === "pendente") return "preparando";
  if (status === "pronto") return lerPerguntas(linha?.perguntas).length >= 1 ? "pronto" : "nada";
  if (status === "respondido") return "respondido";
  // retido, ja_iniciado, sem_ia, dispensado: o aluno segue o tópico como sempre, sem aviso.
  return "nada";
}

/**
 * A tela própria do diagnóstico abre sozinha quando o aluno entra no tópico (07/11): enquanto a IA escreve,
 * com as perguntas prontas e com o resultado, até o aluno tocar em "Começar o tópico". Não há botão
 * "Responder" antes: as perguntas aparecem direto. Pular (ou fechar a tela) leva a fase a "nada".
 */
export function telaDoDiagnosticoAberta(fase: FaseDoDiagnostico, resultadoVisto: boolean): boolean {
  if (fase === "respondido") return !resultadoVisto;
  return fase === "preparando" || fase === "pronto";
}

/** Só vale continuar consultando enquanto a IA escreve. */
export function continuaConsultando(status: StatusDoDiagnostico | null | undefined): boolean {
  return status === "pendente";
}

/** A lista de índices que o banco espera, na ordem das perguntas; `null` é pergunta pulada. */
export function respostasParaEnviar(escolhas: readonly (number | null | undefined)[], total: number): (number | null)[] {
  return Array.from({ length: total }, (_, i) => {
    const escolha = escolhas[i];
    return typeof escolha === "number" && Number.isInteger(escolha) && escolha >= 0 ? escolha : null;
  });
}

/**
 * Texto do resultado. Descreve o ponto de partida e não promete nada que o app ainda não faça: o nível
 * está registrado, e usar esse nível para adaptar o tópico é uma etapa à parte. Sem nota, sem acertos.
 */
export function textoDoNivel(nivel: NivelDoDiagnostico | null | undefined): string {
  switch (nivel) {
    case "avancado":
      return "Você já conhece bastante deste assunto.";
    case "intermediario":
      return "Você já conhece uma parte deste assunto.";
    case "inicial":
      return "Este assunto é novo para você, e tudo bem começar por aqui.";
    default:
      return "Obrigado por responder.";
  }
}

export const TITULO_DO_CARTAO = "Antes de começar";
export const AVISO_DO_CARTAO = "Algumas perguntas rápidas sobre o assunto. Não vale nota e você pode pular.";
