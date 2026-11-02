// Falas do boss que a IA gera em lote por conteúdo × perfil (`boss_falas`, migrations 20261101_09 e
// 20261102_19). O aluno as ouve na batalha do tópico; aqui o professor lê o que ele vai ouvir e pode
// desligar. Só liga e desliga: nome e falas são texto validado pela API e não se editam pelo console.

import { PROFILE_LABEL_MAP } from "../personalizacoes/personalizacaoFallback";

export type FalaDoBoss = {
  id: number;
  conteudo_id: number;
  perfil: string;
  nome: string;
  falas: unknown;
  ativa: boolean;
  desativada_em: string | null;
  gerado_em: string;
};

/** Na ordem em que acontecem na batalha. O app usa as mesmas chaves. */
export const MOMENTOS_DO_BOSS: { chave: string; rotulo: string }[] = [
  { chave: "entrada", rotulo: "Entrada" },
  { chave: "dano", rotulo: "Quando leva dano" },
  { chave: "metade_vida", rotulo: "Metade da vida" },
  { chave: "um_quarto_vida", rotulo: "Um quarto da vida" },
  { chave: "alerta_tempo", rotulo: "Alerta de tempo" },
  { chave: "contra_ataque", rotulo: "Contra-ataque" },
  { chave: "derrota", rotulo: "Se o aluno perde" },
  { chave: "vitoria", rotulo: "Se o aluno vence (narrador)" },
];

export type MomentoLido = { chave: string; rotulo: string; falas: string[] };

/**
 * Lê o JSONB sem confiar no formato: momento que não é lista de texto some, e fala vazia também. O
 * que sobra é o que o aluno de fato pode ouvir (o app aplica a mesma regra).
 */
export function lerMomentos(falas: unknown): MomentoLido[] {
  if (!falas || typeof falas !== "object" || Array.isArray(falas)) return [];
  const bruto = falas as Record<string, unknown>;
  return MOMENTOS_DO_BOSS.map(({ chave, rotulo }) => {
    const lista = bruto[chave];
    const textos = Array.isArray(lista)
      ? lista.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => t.length > 0)
      : [];
    return { chave, rotulo, falas: textos };
  }).filter((m) => m.falas.length > 0);
}

export function totalDeFalas(falas: unknown): number {
  return lerMomentos(falas).reduce((soma, m) => soma + m.falas.length, 0);
}

export function rotuloDoPerfil(perfil: string): string {
  return PROFILE_LABEL_MAP[perfil] ?? perfil;
}

/** Perfis na ordem fixa do produto, não na do banco: a tela não muda de lugar entre leituras. */
const ORDEM_DOS_PERFIS = ["survivor", "daredevil", "conqueror", "seeker", "mastermind", "socializer", "achiever"];

export function ordenarPorPerfil(linhas: FalaDoBoss[]): FalaDoBoss[] {
  const posicao = (perfil: string) => {
    const i = ORDEM_DOS_PERFIS.indexOf(perfil);
    return i === -1 ? ORDEM_DOS_PERFIS.length : i;
  };
  return [...linhas].sort((a, b) => posicao(a.perfil) - posicao(b.perfil) || a.id - b.id);
}

export function resumoDasFalas(linhas: FalaDoBoss[]): { total: number; desligadas: number } {
  return { total: linhas.length, desligadas: linhas.filter((l) => !l.ativa).length };
}

/** A tabela ou a coluna ainda não existe (migration pendente): o painel some em vez de mostrar erro. */
export function eMigracaoPendente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "42P01" ||
    erro.code === "42703" ||
    erro.code === "PGRST205" ||
    erro.code === "PGRST204" ||
    /boss_falas.*(does not exist|schema cache)|column .*ativa.* does not exist/i.test(erro.message ?? "")
  );
}
