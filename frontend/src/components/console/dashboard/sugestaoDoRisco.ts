// O que o professor pode fazer por um aluno em risco, a partir do sinal que pesou.
//
// É REGRA, não modelo de linguagem: cada sinal tem um fato medido (dias sem estudar, o tópico onde
// parou, prazos vencidos, o que pesou no modelo de evasão) e uma ação fixa que cita esse fato. Por
// isso mora no cliente, sem API (regra de fronteira do CLAUDE.md), aparece mesmo com a API fora do ar
// e nunca se apresenta como texto da IA. O que a IA sugeriu fica em `intervencoes`, à parte.
//
// O texto fala do estudo, nunca de emoção ou saúde (DAT-45: o sistema não mede emoção), e usa o
// primeiro nome do aluno em vez de pronome.

import type { FatorDeRisco } from "./riscoReprovacao";
import type { Fator, MotivoDoModelo, Risco } from "./risco";

/** Nome no começo da frase: "o aluno" (sem nome) vira "O aluno". */
const noInicio = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

const POR_MOTIVO_DO_MODELO: Record<MotivoDoModelo, (nome: string) => string> = {
  entregas_perdidas: (nome) =>
    `Combine com ${nome} uma nova data para as atividades vencidas, ou divida a próxima entrega em partes menores.`,
  uso_caiu: (nome) =>
    `O uso de ${nome} caiu nesta semana: pergunte se a rotina mudou e combine um horário curto de estudo.`,
  entrega_atrasada: (nome) =>
    `${noInicio(nome)} entrega com atraso: lembre o prazo da próxima atividade alguns dias antes e confira se ela cabe na semana.`,
  sem_nota: (nome) =>
    `${noInicio(nome)} ainda não tem nota: acompanhe de perto a primeira atividade avaliada e dê retorno logo depois da entrega.`,
  nota_baixa: (nome) =>
    `Veja na trilha de ${nome} as atividades que baixaram a nota e retome o conteúdo delas antes da próxima avaliação.`,
};

/** Risco do modelo sem rótulo (banco sem a 20261110_01, ou nenhuma entrada se destacou). */
const ABANDONO_SEM_MOTIVO = (nome: string) =>
  `Converse com ${nome} sobre como está o estudo e combine o próximo passo da trilha.`;

/** A ação para um sinal da lista "Precisam de atenção" e do detalhe do aluno. */
export function sugestaoDoFator(fator: Fator, nome: string): string {
  switch (fator.criterio) {
    case "abandono":
      return fator.motivoDoModelo ? POR_MOTIVO_DO_MODELO[fator.motivoDoModelo](nome) : ABANDONO_SEM_MOTIVO(nome);
    case "evasao":
      return (
        `Procure ${nome} fora do app, numa conversa em aula ou por mensagem: ` +
        `${fator.dias === undefined ? "há semanas" : `há ${fator.dias} dias`} sem estudar, um aviso só no app não chega.`
      );
    case "inatividade":
      return `Mande para ${nome} um convite para retomar com um passo curto da trilha, e combine um dia para ver o andamento.`;
    case "estagnacao":
      return (
        `Abra ${fator.topico ? fator.topico : "o tópico parado"} com ${nome}: pergunte em que ponto travou e ofereça ` +
        "o próximo material em outro formato (áudio ou apresentação)."
      );
    case "nota":
      return POR_MOTIVO_DO_MODELO.nota_baixa(nome);
  }
}

/**
 * O sinal que pesou mais, para a linha "O que fazer" da lista. A ordem dos fatores já é a do peso
 * (`avaliarRisco`: modelo, dias sem estudar, tópico parado, nota). O risco do modelo sem rótulo não
 * diz o que fazer, então cede a vez ao próximo fato, se houver.
 */
export function fatorPrincipal(risco: Risco): Fator {
  const [primeiro, ...resto] = risco.fatores;
  if (primeiro.criterio === "abandono" && !primeiro.motivoDoModelo && resto.length > 0) return resto[0];
  return primeiro;
}

const POR_FATOR_DE_REPROVACAO: Record<string, (nome: string) => string> = {
  queda_de_atividade: POR_MOTIVO_DO_MODELO.uso_caiu,
  acertos_baixos: (nome) =>
    `Retome com ${nome} as questões erradas dos últimos 30 dias, com um exemplo resolvido antes da próxima atividade.`,
  faltas: (nome) => `Converse com ${nome} sobre as faltas e indique na trilha o material das aulas perdidas.`,
  prazos_perdidos: POR_MOTIVO_DO_MODELO.entregas_perdidas,
  abandono_recorrente: (nome) =>
    `${noInicio(nome)} abre atividades e não termina: divida a próxima em partes menores ou reduza o tamanho da entrega.`,
};

/** A ação para um fator do risco de reprovação; fator desconhecido (banco mais novo) fica sem. */
export function sugestaoDoFatorDeReprovacao(fator: FatorDeRisco, nome: string): string | null {
  return POR_FATOR_DE_REPROVACAO[fator.fator]?.(nome) ?? null;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || "o aluno";
