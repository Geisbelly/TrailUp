import type { BrainHexProfile } from '@/constants/brainHexProfiles';
import type { ChaveDaMistura, PoliticaDaRota } from '@/utils/rotaDeMaterial';

/**
 * O lado Supabase da mistura de material por conteúdo (spec
 * `2026-11-11-mistura-de-material-por-conteudo-design.md`): a chave em `app_config`, os conteúdos
 * em que o aluno já tem progresso e o registro de exposição. Direto no Supabase, sem a API: nada
 * aqui tem modelo de linguagem (regra de fronteira). Toda falha cai no comportamento de hoje.
 */

export type ClienteDaMistura = { from: (tabela: string) => any };

export type ExposicaoLinha = {
  aluno_id: string;
  classe_id: number;
  topico_id: number;
  conteudo_id: number;
  perfil: BrainHexProfile;
  politica: PoliticaDaRota;
  prob_politica: number;
  pesos: Record<string, number>;
  versao_alocador: string;
};

const CHAVE = 'mistura_material';
const CHAVE_BONUS = 'mistura_material_bonus_ativo';
const BONUS_PADRAO = 0.5;
const DESLIGADA = { chave: 'desligada' as ChaveDaMistura, bonus: BONUS_PADRAO };

/** A chave e o bônus do perfil ativo. Ausência, valor desconhecido ou erro: desligada. */
export async function lerConfigDaMistura(client: ClienteDaMistura): Promise<{ chave: ChaveDaMistura; bonus: number }> {
  try {
    const { data, error } = await client.from('app_config').select('chave, valor').in('chave', [CHAVE, CHAVE_BONUS]);
    if (error || !Array.isArray(data)) return DESLIGADA;
    const valor = (chave: string) => String(data.find((linha: { chave?: string }) => linha?.chave === chave)?.valor ?? '').trim();
    const bonus = Number(valor(CHAVE_BONUS));
    return {
      chave: valor(CHAVE) === 'alternancia' ? 'alternancia' : 'desligada',
      bonus: valor(CHAVE_BONUS) !== '' && Number.isFinite(bonus) && bonus >= 0 ? bonus : BONUS_PADRAO,
    };
  } catch {
    return DESLIGADA;
  }
}

/**
 * `conteudo_id → perfil` dos conteúdos em que o aluno já tem progresso, lido do banco na hora — não
 * do estado do app, que pode chegar depois da hidratação e deixar a rota trocar o perfil de um
 * conteúdo já começado (e zerar o progresso dele).
 */
export async function lerConteudosIniciados(
  client: ClienteDaMistura,
  alunoId: string,
  classeId: number,
  registros: { id: number; conteudo_id: number | null; perfil: BrainHexProfile | null }[],
): Promise<Map<number, BrainHexProfile>> {
  const iniciados = new Map<number, BrainHexProfile>();
  const porId = new Map(registros.filter((r) => r.conteudo_id && r.perfil).map((r) => [r.id, r]));
  if (!porId.size) return iniciados;
  try {
    const { data, error } = await client
      .from('personalizacao_item_progresso')
      .select('personalizacao_id, status, percentual_concluido')
      .eq('aluno_id', alunoId)
      .eq('classe_id', classeId)
      .in('personalizacao_id', [...porId.keys()]);
    if (error || !Array.isArray(data)) {
      console.warn('[mistura] sem os conteúdos iniciados agora; a rota segue sem eles', error?.message);
      return iniciados;
    }
    for (const linha of data) {
      const registro = porId.get(Number(linha?.personalizacao_id));
      const comecou =
        Number(linha?.percentual_concluido ?? 0) > 0 ||
        String(linha?.status ?? 'nao_iniciado').toLowerCase() !== 'nao_iniciado';
      if (registro && comecou && !iniciados.has(registro.conteudo_id!)) iniciados.set(registro.conteudo_id!, registro.perfil!);
    }
  } catch (erro) {
    console.warn('[mistura] sem os conteúdos iniciados agora; a rota segue sem eles', erro);
  }
  return iniciados;
}

let avisouExposicao = false;

/**
 * Grava a exposição (aluno × conteúdo × perfil × política), só a primeira vez de cada uma. Nunca
 * lança: sem a tabela (app novo antes da migration), o material carrega igual.
 */
export async function registrarExposicao(client: ClienteDaMistura, linhas: ExposicaoLinha[]): Promise<void> {
  if (!linhas.length) return;
  try {
    const { error } = await client
      .from('personalizacao_exposicao')
      .upsert(linhas, { onConflict: 'aluno_id,conteudo_id,perfil,politica', ignoreDuplicates: true });
    if (error) throw error;
  } catch (erro) {
    if (!avisouExposicao) {
      avisouExposicao = true;
      console.warn('[mistura] exposição não registrada; o material segue normal', erro);
    }
  }
}
