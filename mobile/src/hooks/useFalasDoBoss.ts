import { useEffect, useMemo } from 'react';
import { useIA } from '@/context/IAContext';
import { useUsuario } from '@/context/SessaoContext';
import { useTrilha } from '@/context/TrilhaContext';
import { supabase } from '@/database/supabase';
import { montarFalasDoAluno, pesosDeBatalha } from '@/utils/bossFalasPorVetor';

/**
 * Lê as falas do boss geradas em lote para a turma (`boss_falas`, RLS de quem está na turma) e
 * as entrega ao IAContext. Direto do Supabase, sem passar pela API: com ela fora do ar a batalha
 * continua falando. Erro de rede mantém a última leitura boa; sem linha ficam as falas fixas.
 *
 * Lê os perfis de batalha representativos do aluno, não só o perfil ativo, e cada boss fala com
 * a voz de um deles, sorteada na proporção do vetor (`bossFalasPorVetor`). Sem perfil de batalha
 * representativo, fica o perfil ativo, como antes.
 */
export function useFalasDoBoss() {
  const { classeAtual, perfil } = useTrilha();
  const { usuario } = useUsuario();
  const { registrarFalasDoBoss } = useIA();
  const classeId = classeAtual?.classe_id ?? null;
  const alunoId = usuario?.id ?? null;
  const pesos = useMemo(() => pesosDeBatalha(usuario?.perfis, perfil), [usuario?.perfis, perfil]);
  // Chave estável para o efeito: o array de pesos é recriado a cada render do contexto.
  const chaveDosPesos = pesos.map((p) => `${p.perfil}:${p.peso.toFixed(4)}`).join('|');

  useEffect(() => {
    if (!classeId || !perfil || !alunoId) return;
    let ativo = true;
    void (async () => {
      const { data, error } = await supabase
        .from('boss_falas')
        .select('conteudo_id, perfil, nome, falas')
        .eq('classe_id', classeId)
        .in(
          'perfil',
          pesos.map((p) => p.perfil),
        );
      if (!ativo) return;
      if (error || !data) {
        console.warn('[boss_falas] sem falas geradas agora; ficam as fixas', error?.message);
        return;
      }
      registrarFalasDoBoss(montarFalasDoAluno(data, pesos, alunoId));
    })();
    return () => {
      ativo = false;
    };
    // `pesos` entra pela chave: mudar o vetor relê; recriar o mesmo array não.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classeId, perfil, alunoId, chaveDosPesos, registrarFalasDoBoss]);
}
