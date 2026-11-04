import type { Aberturas, Funcionalidade } from "./portoes";

/**
 * Para onde o Guardião pode levar o aluno. Os códigos vêm da API e têm paridade testada
 * com `DESTINOS_DO_APP` (`api/app/services/guia_do_app.py`); cada rota tem de existir em
 * `src/app`. Código desconhecido some: o app pode ser mais velho que a API.
 */
export const DESTINOS_DO_GUIA: Record<string, { rotulo: string; rota: string }> = {
  trilha: { rotulo: "Trilha", rota: "/(tabs)" },
  notificacoes: { rotulo: "Notificações", rota: "/(tabs)/notificacoes" },
  social: { rotulo: "Social", rota: "/(tabs)/social" },
  ranking: { rotulo: "Ranking", rota: "/(tabs)/ranking" },
  perfil: { rotulo: "Perfil", rota: "/(tabs)/perfil" },
  "perfil.loja": { rotulo: "Loja", rota: "/(tabs)/perfil/loja" },
  "perfil.conquistas": { rotulo: "Conquistas", rota: "/(tabs)/perfil/biblioteca-conquistas" },
  "perfil.molduras": { rotulo: "Molduras", rota: "/(tabs)/perfil/molduras" },
  "perfil.metricas": { rotulo: "Estilo das métricas", rota: "/(tabs)/perfil/metricas-estilo" },
  "perfil.modo_foco": { rotulo: "Modo foco e avisos", rota: "/(tabs)/perfil/modo-foco" },
  "perfil.lembrete": { rotulo: "Lembrete diário", rota: "/(tabs)/perfil/lembrete-diario" },
  "perfil.coleta": { rotulo: "Coleta e acessos", rota: "/(tabs)/perfil/coleta-dados" },
  "perfil.relatorio": { rotulo: "Relatório dos dados", rota: "/(tabs)/perfil/relatorio" },
  "perfil.erro": { rotulo: "Reportar um erro", rota: "/(tabs)/perfil/feedback" },
  "perfil.senha": { rotulo: "Redefinir senha", rota: "/(tabs)/perfil/resetar-senha" },
  "perfil.excluir": { rotulo: "Excluir conta", rota: "/(tabs)/perfil/excluir" },
};

/** O cadeado destas abas mora no `tabPress`; `router.push` passaria por cima dele. */
const PORTAO_DO_DESTINO: Record<string, Funcionalidade> = { social: "social", ranking: "rank" };

export type BotaoDeDestino = { rotulo: string; rota: string };

export function destinosParaBotoes(destinos: string[] | undefined, aberturas: Aberturas): BotaoDeDestino[] {
  const botoes: BotaoDeDestino[] = [];
  for (const destino of destinos ?? []) {
    const alvo = DESTINOS_DO_GUIA[destino];
    const portao = PORTAO_DO_DESTINO[destino];
    if (alvo && (!portao || aberturas[portao])) botoes.push(alvo);
  }
  return botoes;
}
