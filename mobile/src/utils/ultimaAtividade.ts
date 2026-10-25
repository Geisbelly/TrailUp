type EventoLike = { id: number | string; tipo: string; valor: number | null; criado_em: string | null };

export type LinhaAtividade = {
  id: string;
  texto: string;
  pontos: number;
  quando: string;
  icone:
    | "check"
    | "check-decagram"
    | "book-open-variant"
    | "trophy-outline"
    | "star-four-points-outline"
    | "refresh"
    | "pencil-outline"
    | "map-marker-path"
    | "flag-checkered"
    | "account-check-outline";
};

// A ordem importa: a primeira que casa vence (ex.: "topico_atividade_acertada" é acerto).
const FRASES: [RegExp, string, LinhaAtividade["icone"]][] = [
  [/acertad|acerto/, "Acertou uma atividade", "check-decagram"],
  [/errad/, "Tentou uma atividade", "pencil-outline"],
  [/revis/, "Revisou uma atividade", "refresh"],
  [/topico.*conclu/, "Concluiu um tópico", "flag-checkered"],
  [/topico.*inici/, "Começou um tópico", "map-marker-path"],
  [/presenca/, "Presença registrada em aula", "account-check-outline"],
  [/atividade.*conclu/, "Concluiu uma atividade", "check"],
  [/conteudo.*conclu/, "Concluiu um conteúdo", "book-open-variant"],
  [/conquista/, "Desbloqueou uma conquista", "trophy-outline"],
  // Crédito de "Pontos do evento" ao encerrar um evento da turma (#141).
  [/^evento_classe/, "Pontos de um evento da turma", "trophy-outline"],
];

const dois = (n: number) => String(n).padStart(2, "0");

/** "Hoje, 18:40", "Ontem" ou "27/09", como em "Última atividade" do protótipo v4. */
export function quandoCurto(iso: string | null, agora: Date): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (diff === 0) return `Hoje, ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  if (diff === 1) return "Ontem";
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}

/**
 * As últimas atividades do aluno a partir de `eventos_aluno`, mais recentes
 * primeiro: uma frase por tipo de evento (o tipo cru, legível, quando não há
 * frase), os pontos e quando foi. Usado no Perfil da web em tela larga (#346).
 */
export function ultimasAtividades(eventos: readonly EventoLike[], agora: Date, limite = 3): LinhaAtividade[] {
  return [...eventos]
    .filter((e) => e.criado_em)
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
    .slice(0, limite)
    .map((e) => {
      const tipo = String(e.tipo ?? "").toLowerCase();
      const achou = FRASES.find(([re]) => re.test(tipo));
      const legivel = tipo.replace(/_/g, " ").trim();
      return {
        id: String(e.id),
        texto: achou ? achou[1] : legivel ? legivel[0].toUpperCase() + legivel.slice(1) : "Atividade registrada",
        pontos: Number(e.valor ?? 0) || 0,
        quando: quandoCurto(e.criado_em, agora),
        icone: achou ? achou[2] : "star-four-points-outline",
      };
    });
}
