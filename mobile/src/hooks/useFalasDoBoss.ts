import { useEffect } from 'react';
import { useIA } from '@/context/IAContext';
import { useTrilha } from '@/context/TrilhaContext';
import { supabase } from '@/database/supabase';
import { lerFalasDoBoss } from '@/utils/bossFalas';

/**
 * Lê as falas do boss geradas em lote para a turma e o perfil do aluno (`boss_falas`, RLS de
 * quem está na turma) e as entrega ao IAContext. Direto do Supabase, sem passar pela API: com
 * ela fora do ar a batalha continua falando. Erro de rede mantém a última leitura boa; turma ou
 * perfil sem linha deixa as falas fixas.
 */
export function useFalasDoBoss() {
  const { classeAtual, perfil } = useTrilha();
  const { registrarFalasDoBoss } = useIA();
  const classeId = classeAtual?.classe_id ?? null;

  useEffect(() => {
    if (!classeId || !perfil) return;
    let ativo = true;
    void (async () => {
      const { data, error } = await supabase
        .from('boss_falas')
        .select('conteudo_id, nome, falas')
        .eq('classe_id', classeId)
        .eq('perfil', perfil);
      if (!ativo) return;
      if (error || !data) {
        console.warn('[boss_falas] sem falas geradas agora; ficam as fixas', error?.message);
        return;
      }
      registrarFalasDoBoss(lerFalasDoBoss(data));
    })();
    return () => {
      ativo = false;
    };
  }, [classeId, perfil, registrarFalasDoBoss]);
}
