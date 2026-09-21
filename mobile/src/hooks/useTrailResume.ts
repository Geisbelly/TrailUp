import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/database/supabase';
import { useUsuario } from '@/context/SessaoContext';
import { useTrilha } from '@/context/TrilhaContext';
import { selectResumeTopic, trailResumeKey, type TrailVisit } from '@/utils/trailResume';

const visits = new Map<string, TrailVisit>();

export function useRememberTrailTopic(topicId: number | null) {
  const { usuario } = useUsuario();
  const { classeAtual, grafo } = useTrilha();
  const classId = classeAtual?.classe_id;
  const allowed = topicId != null && classeAtual?.topicos.some((t) => t.id === topicId)
    && grafo.nodes.some((n) => String(n.id) === String(topicId) && !n.locked);
  useFocusEffect(useCallback(() => {
    if (!usuario?.id || classId == null || topicId == null || !allowed) return;
    const key = trailResumeKey(usuario.id, classId);
    const visit = { topicId, visitedAt: new Date().toISOString() };
    visits.set(key, visit);
    void AsyncStorage.setItem(key, JSON.stringify(visit)).catch((error) => console.warn('[Trilha] Falha ao guardar retomada:', error));
  }, [allowed, classId, topicId, usuario?.id]));
}

export function useTrailResumeTopic() {
  const { usuario } = useUsuario();
  const { classeAtual, grafo } = useTrilha();
  const classId = classeAtual?.classe_id;
  const key = usuario?.id && classId != null ? trailResumeKey(usuario.id, classId) : null;
  const [loaded, setLoaded] = useState<{ key: string; visits: TrailVisit[] } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!key || !usuario?.id || classId == null) return;
    let active = true;
    const local = visits.get(key);
    if (local) setLoaded({ key, visits: [local] });
    void (async () => {
      const [stored, checkpoints] = await Promise.all([
        AsyncStorage.getItem(key),
        supabase.from('trilha_checkpoint_navegacao').select('topico_id,updated_at')
          .eq('aluno_id', usuario.id).eq('classe_id', classId).order('updated_at', { ascending: false }).limit(30),
      ]);
      if (!active) return;
      let saved: TrailVisit | null = null;
      try { saved = stored ? JSON.parse(stored) : null; } catch { /* cache antigo/inválido */ }
      setLoaded({ key, visits: [visits.get(key), saved,
        ...(checkpoints.data ?? []).map((v) => ({ topicId: v.topico_id, visitedAt: v.updated_at })),
      ].filter((v): v is TrailVisit => Boolean(v)) });
    })().catch((error) => console.warn('[Trilha] Falha ao carregar retomada:', error));
    return () => { active = false; };
  }, [classId, key, usuario?.id]));
  return selectResumeTopic(grafo.nodes, classeAtual?.topicos ?? [], [
    ...(loaded?.key === key ? loaded.visits : []), ...(key && visits.has(key) ? [visits.get(key)!] : []),
  ]);
}
