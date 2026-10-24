import type { User } from '@supabase/supabase-js';
import type { AlunoSignupWizard } from '@/components/auth/AlunoSignupWizard';
import { supabase } from '@/integrations/supabase/client';
import { dataDoPendente } from '@/lib/dataNascimento';
import { montarMedidaDoPerfil } from './medidaDoPerfil';

export const AREA_ALUNO = '/aluno';
export const CONFIRMACAO = '/auth/confirmacao';
const prefix = 'pending-signup:';
export type TipoCadastro = 'aluno' | 'professor' | null;
export type CadastroAlunoPayload = Parameters<Parameters<typeof AlunoSignupWizard>[0]['onConfirm']>[0];

/** Cache opcional. Uma falha de storage não invalida a conta confirmada. */
export function lerPendente(email: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const raw = storage.getItem(prefix + email.toLowerCase());
    const p = raw ? JSON.parse(raw) : null;
    if (p?.email?.toLowerCase() !== email.toLowerCase()) return null;
    return { tipo: p.tipo === 'aluno' || p.tipo === 'professor' ? p.tipo as TipoCadastro : null,
      dataNascimento: dataDoPendente(raw) };
  } catch { return null; }
}

export function tipoDoCadastro(user: Pick<User, 'email' | 'user_metadata'>): TipoCadastro {
  const role = user.user_metadata?.role;
  // Usado apenas para escolher o formulário, nunca para conceder autorização.
  if (role === 'aluno' || role === 'professor') return role;
  return user.email ? lerPendente(user.email)?.tipo ?? null : null;
}

export function removerPendente(email: string) {
  try { localStorage.removeItem(prefix + email.toLowerCase()); } catch { /* cache opcional */ }
}

export async function alunoTemCadastro(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('aluno_cadastro_concluido')
    .select('aluno_id').eq('aluno_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return true;
  // Cadastros legados completos continuam funcionando. Só possuir `alunos`
  // não basta: era precisamente o estado parcial que a RPC antiga não reparava.
  const { data: perfis, error: perfisError } = await supabase.from('aluno_perfil')
    .select('perfil_id, afinidade').eq('aluno_id', userId);
  if (perfisError) throw perfisError;
  const vetorCompleto = perfis?.length === 7 && new Set(perfis.map(p => p.perfil_id)).size === 7 &&
    perfis.every(p => p.afinidade !== null && Number.isFinite(p.afinidade) && p.afinidade >= 0) &&
    Math.abs(perfis.reduce((sum, p) => sum + (p.afinidade ?? 0), 0) - 100) < 0.001;
  if (!vetorCompleto) return false;
  const { data: medidas, error: medidaError } = await supabase.from('aluno_perfil_medida')
    .select('id').eq('aluno_id', userId).limit(1);
  if (medidaError) throw medidaError;
  return Boolean(medidas?.length);
}

export async function salvarCadastroAluno(userId: string, payload: CadastroAlunoPayload, dataNascimento: string | null) {
  const medida = montarMedidaDoPerfil({ alunoId: userId, ordenacaoConfirmada: payload.ordenacaoConfirmada,
    ordenacao: payload.ordenacao, afinidade: payload.brainhexPercent,
    confianca: payload.confiancaDoPerfil, concordancia: payload.concordanciaDoPerfil,
    qualidade: payload.qualidadeDaResposta });
  const { data, error } = await supabase.rpc('concluir_cadastro_aluno', {
    p_nome: payload.nome, p_apelido: payload.apelido, p_modo_operacao: payload.modoOperacao,
    p_modo_resposta: payload.modoApresentacao, p_perfil_ativo: payload.perfilInicial,
    p_medida: medida, p_data_nascimento: dataNascimento,
  });
  if (error) throw error;
  if (data !== userId) throw new Error('O cadastro não foi confirmado. Tente novamente.');
}
