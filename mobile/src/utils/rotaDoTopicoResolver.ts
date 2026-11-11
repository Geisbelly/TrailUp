import { normalizeBrainHexProfile, type BrainHexProfile } from '@/constants/brainHexProfiles';
import type { ExposicaoLinha } from '@/services/personalizacao/misturaMaterial';
import {
  VERSAO_DO_ALOCADOR,
  assinaturaDaRota,
  candidatosPorConteudo,
  filtrarRegistrosDaRota,
  pesosDaRota,
  politicaDoTopico,
  rotaDoTopico,
  type ChaveDaMistura,
  type PerfilLike,
  type RegistroDaRota,
} from '@/utils/rotaDeMaterial';

/**
 * Os registros de material que o tópico usa, conteúdo a conteúdo (spec
 * `2026-11-11-mistura-de-material-por-conteudo-design.md`). Com a chave desligada, é o filtro de
 * hoje: só o perfil ativo. Com a alternância, a rota decide o perfil de cada conteúdo e cada
 * decisão vira uma linha de exposição.
 */
export function resolverRegistrosDoTopico<T extends RegistroDaRota>(p: {
  registros: T[];
  topico: { id: number; conteudos?: { id: number; ordem?: unknown }[] | null };
  alunoId: string;
  classeId: number;
  perfilAtivo: BrainHexProfile;
  perfis: PerfilLike[] | null | undefined;
  config: { chave: ChaveDaMistura; bonus: number };
  iniciados: Map<number, BrainHexProfile>;
  perfilDoRegistro: (registro: T) => BrainHexProfile | null;
}): { registros: T[]; exposicoes: ExposicaoLinha[]; assinatura: string } {
  const doAtivo = (registro: T) => p.perfilDoRegistro(registro) === p.perfilAtivo;
  if (p.config.chave !== 'alternancia') {
    return { registros: p.registros.filter(doAtivo), exposicoes: [], assinatura: p.perfilAtivo };
  }

  const { politica, probabilidade } = politicaDoTopico(p.config.chave, p.alunoId, p.topico.id);
  const pesos = pesosDaRota(p.perfis, p.perfilAtivo, p.config.bonus);
  const conteudos = ordemDosConteudos(p.topico.conteudos, p.registros);
  const rota = rotaDoTopico({
    conteudos,
    candidatos: candidatosPorConteudo(
      p.registros,
      pesos.map((item) => item.perfil),
      p.perfilDoRegistro,
    ),
    pesos,
    perfilAtivo: p.perfilAtivo,
    politica,
    iniciados: p.iniciados,
  });

  const escolhidos = new Set(filtrarRegistrosDaRota(p.registros, rota, p.perfilAtivo, p.perfilDoRegistro));
  // Conteúdo fora da rota (nenhum perfil com material utilizável) segue como hoje: com o registro
  // do ativo, se houver. Sem isso, a mistura tiraria da tela um material que hoje aparece.
  const registros = p.registros.filter((registro) => {
    if (escolhidos.has(registro)) return true;
    const conteudo = conteudoDo(registro);
    return conteudo !== null && !rota.has(conteudo) && doAtivo(registro);
  });

  const pesosRegistro = Object.fromEntries(pesos.map((item) => [item.perfil, Number(item.peso.toFixed(6))]));
  const exposicoes: ExposicaoLinha[] = [...rota].map(([conteudo, perfil]) => ({
    aluno_id: p.alunoId,
    classe_id: p.classeId,
    topico_id: p.topico.id,
    conteudo_id: conteudo,
    perfil,
    politica,
    prob_politica: probabilidade,
    pesos: pesosRegistro,
    versao_alocador: VERSAO_DO_ALOCADOR,
  }));

  return { registros, exposicoes, assinatura: assinaturaDaRota(politica, pesos) };
}

/**
 * O perfil em que o registro foi lido. O provider carimba `brainhex_profile_key` em cada registro
 * da leitura por vários perfis, inclusive no legado que só tinha o perfil no plano.
 */
export function perfilDoRegistroCarimbado(registro: object): BrainHexProfile | null {
  const perfil = (registro as { brainhex_profile_key?: unknown })?.brainhex_profile_key;
  return normalizeBrainHexProfile(String(perfil ?? '')) as BrainHexProfile | null;
}

/**
 * Se o registro pode pedir a mídia que falta. O pedido vai à API sem perfil e ela gera para o
 * dominante: registro de outro perfil da rota dispararia a geração no perfil errado, gastaria
 * cota e nunca seria reparado. Sem carimbo (leitura de um perfil só), vale o de antes: pede.
 */
export function podePedirMidiaDoRegistro(registro: object, perfilAtivo: BrainHexProfile): boolean {
  const perfil = perfilDoRegistroCarimbado(registro);
  return perfil === null || perfil === perfilAtivo;
}

function conteudoDo(registro: RegistroDaRota): number | null {
  const id = Number(registro?.conteudo_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * A ordem do professor (`ordem`, depois `id`) e, no fim, os conteúdos que só aparecem nos
 * registros. A ordem importa: o alocador é sequencial.
 */
function ordemDosConteudos(
  conteudos: { id: number; ordem?: unknown }[] | null | undefined,
  registros: RegistroDaRota[],
): number[] {
  const ordem = (valor: unknown) => {
    const numero = Number(valor);
    return Number.isFinite(numero) && valor !== null && valor !== '' ? numero : Number.MAX_SAFE_INTEGER;
  };
  const doTopico = [...(conteudos ?? [])]
    .filter((c) => Number.isInteger(Number(c?.id)) && Number(c.id) > 0)
    .sort((a, b) => ordem(a.ordem) - ordem(b.ordem) || Number(a.id) - Number(b.id))
    .map((c) => Number(c.id));
  const vistos = new Set(doTopico);
  const extras = [
    ...new Set(registros.map(conteudoDo).filter((id): id is number => id !== null && !vistos.has(id))),
  ].sort((a, b) => a - b);
  return [...doTopico, ...extras];
}
