import { useEffect, useState } from 'react';
import { useTrilha } from '@/context/TrilhaContext';
import { supabase } from '@/database/supabase';
import { esperaAteAProximaAbertura, lerEmBreve, type EmBreve } from '@/utils/topicosEmBreve';

/**
 * Quantos tópicos da turma ainda não abriram, e quando abrem (`topicos_em_breve`, só para quem é
 * aluno da turma). Direto do Supabase. Erro (inclusive banco sem a migration) vira lista vazia:
 * o aviso some, a trilha continua.
 *
 * Na hora em que o próximo agendado abre, recarrega a turma: o tópico entra na trilha sem o
 * aluno precisar sair e voltar.
 */
export function useTopicosEmBreve(): EmBreve[] {
  const { classeAtual, carregando, recarregarTurma } = useTrilha();
  const classeId = classeAtual?.classe_id ?? null;
  // Tópico que abriu entra na trilha e sai daqui: a contagem de visíveis muda e a lista é relida.
  const visiveis = classeAtual?.topicos?.length ?? 0;
  const [lista, setLista] = useState<EmBreve[]>([]);

  useEffect(() => {
    if (!classeId || carregando) return;
    let ativo = true;
    void (async () => {
      const { data, error } = await supabase.rpc('topicos_em_breve', { p_classe_id: Number(classeId) });
      if (!ativo) return;
      if (error) {
        setLista([]);
        return;
      }
      setLista(lerEmBreve(data));
    })();
    return () => {
      ativo = false;
    };
  }, [classeId, carregando, visiveis]);

  useEffect(() => {
    if (!classeId) return;
    const espera = esperaAteAProximaAbertura(lista);
    if (espera === null) return;
    // Alguns segundos de folga: a leitura do banco compara com a hora dele.
    const timer = setTimeout(() => void recarregarTurma(Number(classeId)), espera + 5000);
    return () => clearTimeout(timer);
  }, [classeId, lista, recarregarTurma]);

  return classeId ? lista : [];
}
