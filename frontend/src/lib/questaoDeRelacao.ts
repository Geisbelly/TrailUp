/**
 * Os três formatos de relação no console do professor.
 *
 * `associacao` (ligar termo a definição), `ordenacao` (pôr em ordem) e
 * `multipla_resposta` (marcar todas as certas), que entraram na `20260921_04`.
 *
 * **O que o console grava é o gabarito, não a ordem de exibição.** O gatilho
 * `trg_questoes_alternativas_canonicas` reordena `alternativas` ao salvar, e é
 * ele quem garante que a resposta não fique numa posição fixa. Então o
 * professor monta a questão na ordem que faz sentido para ele — em `ordenacao`,
 * a ordem CERTA — e o banco embaralha a exibição.
 *
 * Isso inverte uma expectativa natural: a lista que o professor vê depois de
 * salvar **não** é a que ele digitou, e isso é o recurso funcionando.
 */

export type FormatoDeRelacao = "associacao" | "ordenacao" | "multipla_resposta";

export type ParDeAssociacao = { termo: string; definicao: string };

/** O que vai para `questoes.alternativas` e `questoes.resposta_correta`. */
export type PayloadDaQuestao = {
  alternativas: unknown;
  respostaCorreta: string;
};

function limpar(valor: unknown): string {
  return String(valor ?? "").trim();
}

/**
 * Associação: as duas listas vão SOLTAS para `alternativas`, e o pareamento vai
 * só para o gabarito.
 *
 * Guardar pares em `alternativas` entregaria a resposta — o aluno lê o JSON e
 * tem tudo. É o mesmo defeito que a `20260921_01` fechou para os outros
 * formatos, e ele voltaria por aqui.
 */
export function payloadDeAssociacao(pares: ParDeAssociacao[]): PayloadDaQuestao | null {
  const validos = pares
    .map((par) => ({ termo: limpar(par.termo), definicao: limpar(par.definicao) }))
    .filter((par) => par.termo && par.definicao);

  if (validos.length < 2) return null;

  // Termo repetido quebra a relação 1:1 e o aluno não teria como acertar: duas
  // linhas iguais competem pela mesma ligação.
  const termos = new Set(validos.map((par) => par.termo.toLowerCase()));
  const definicoes = new Set(validos.map((par) => par.definicao.toLowerCase()));
  if (termos.size !== validos.length || definicoes.size !== validos.length) return null;

  return {
    alternativas: {
      termos: validos.map((par) => par.termo),
      definicoes: validos.map((par) => par.definicao),
    },
    respostaCorreta: JSON.stringify(validos.map((par) => [par.termo, par.definicao])),
  };
}

/**
 * Ordenação: `alternativas` recebe os itens e o gabarito recebe a SEQUÊNCIA.
 *
 * Os dois saem da mesma lista, na ordem que o professor montou. O banco
 * reordena `alternativas` ao salvar; se não reordenasse, a tela do aluno
 * mostraria a resposta.
 */
export function payloadDeOrdenacao(itens: string[]): PayloadDaQuestao | null {
  const validos = itens.map(limpar).filter(Boolean);
  if (validos.length < 2) return null;
  if (new Set(validos.map((item) => item.toLowerCase())).size !== validos.length) {
    return null;
  }
  return {
    alternativas: validos,
    respostaCorreta: JSON.stringify(validos),
  };
}

/** Múltipla resposta: todas as opções em `alternativas`, as certas no gabarito. */
export function payloadDeMultiplaResposta(
  opcoes: Array<{ texto: string; correta: boolean }>
): PayloadDaQuestao | null {
  const validas = opcoes
    .map((opcao) => ({ texto: limpar(opcao.texto), correta: Boolean(opcao.correta) }))
    .filter((opcao) => opcao.texto);

  if (validas.length < 3) return null;
  const certas = validas.filter((opcao) => opcao.correta);

  // Uma certa só é múltipla escolha comum, e o aluno seria induzido a marcar
  // mais de uma. Todas certas não separa quem sabe de quem marca tudo.
  if (certas.length < 2 || certas.length === validas.length) return null;

  return {
    alternativas: validas.map((opcao) => opcao.texto),
    respostaCorreta: JSON.stringify(certas.map((opcao) => opcao.texto)),
  };
}

/** Mensagem para a tela quando o payload não fecha. */
export function motivoDaRecusa(formato: FormatoDeRelacao): string {
  if (formato === "associacao") {
    return "Ligue pelo menos 2 pares, sem repetir termo nem definição.";
  }
  if (formato === "ordenacao") {
    return "Informe pelo menos 2 etapas distintas, na ordem correta.";
  }
  return "Use pelo menos 3 alternativas e marque de 2 até todas menos uma como corretas.";
}

/** Lê de volta o que foi salvo, para reabrir a questão no editor. */
export function paresSalvos(
  alternativas: unknown,
  respostaCorreta: string | null
): ParDeAssociacao[] {
  // O pareamento vem do GABARITO, nunca de `alternativas` -- que guarda as
  // duas listas embaralhadas e sem vínculo, de propósito.
  try {
    const bruto = JSON.parse(String(respostaCorreta ?? ""));
    if (Array.isArray(bruto)) {
      return bruto
        .map((item): ParDeAssociacao | null => {
          if (Array.isArray(item)) {
            return { termo: limpar(item[0]), definicao: limpar(item[1]) };
          }
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            return { termo: limpar(obj.termo), definicao: limpar(obj.definicao) };
          }
          return null;
        })
        .filter((par): par is ParDeAssociacao => Boolean(par?.termo && par?.definicao));
    }
  } catch {
    // Gabarito não-JSON: questão antiga ou digitada à mão. Sem pares a mostrar.
  }
  return [];
}

/** Itens salvos de `ordenacao` / lista de `multipla_resposta`. */
export function listaSalva(respostaCorreta: string | null): string[] {
  try {
    const bruto = JSON.parse(String(respostaCorreta ?? ""));
    if (Array.isArray(bruto)) return bruto.map(limpar).filter(Boolean);
  } catch {
    // Reserva pela barra: é a forma que o banco também aceita.
    return String(respostaCorreta ?? "")
      .split("|")
      .map(limpar)
      .filter(Boolean);
  }
  return [];
}
