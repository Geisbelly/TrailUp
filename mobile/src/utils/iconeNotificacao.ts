import type { MaterialCommunityIcons } from "@expo/vector-icons";

type Icone = keyof typeof MaterialCommunityIcons.glyphMap;

// Por palavra do tipo (ou do título, quando o tipo falta). A primeira regra que casa vence.
const REGRAS: [(palavra: string) => boolean, Icone][] = [
  [(p) => p.startsWith("conquist"), "trophy-outline"],
  [(p) => p.startsWith("rank") || p === "posicao", "podium"],
  [(p) => /^(convite|amizad|amig|social|guild)/.test(p), "account-group-outline"],
  [(p) => p.startsWith("revis"), "book-open-page-variant-outline"],
  [(p) => p.startsWith("pausa"), "coffee-outline"],
  [(p) => /^(retomad|lembret|estud|horario|prazo)/.test(p), "clock-outline"],
  [(p) => ["ia", "mentor", "guia", "chat", "mensagem"].includes(p), "message-text-outline"],
];

const palavras = (texto: string | null | undefined) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Ícone de cada notificação na web em tela larga (#346, protótipo v4): relógio
 * para lembretes, troféu para conquistas, pódio para ranking, conversa para o
 * guia etc. O `tipo` vem de várias origens (rotinas do banco, convites sociais,
 * conquistas), então a escolha é por palavra, com o sino como padrão.
 */
export function iconeDaNotificacao(tipo: string | null | undefined, titulo?: string | null): Icone {
  for (const fonte of [palavras(tipo), palavras(titulo)]) {
    for (const [casa, icone] of REGRAS) if (fonte.some(casa)) return icone;
  }
  return "bell-outline";
}
