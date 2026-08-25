// src/context/ConquistaRankContext.tsx
import { Conquista } from '@/models/Conquista';
import { EventoAluno } from '@/models/Evento';
import { ClasseRanking } from '@/models/Rank';
import { PosicaoDoAluno } from '@/models/RankAlunoPosicao';
import { supabase } from '@/database/supabase';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useUsuario } from './SessaoContext';
import { useTrilha } from './TrilhaContext';

function normalizeClasseId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isInvalidBigintDataError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as any).code ?? '')
      : '';
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as any).message ?? '').toLowerCase()
      : '';

  return code === '22P02' || message.includes('invalid input syntax for type bigint');
}

type ConquistaRankState = {
  carregando: boolean;
  ranking: ClasseRanking | null;
  posicoesDoAluno: PosicaoDoAluno[];
  eventos: EventoAluno[];
  conquistas: Conquista[];
  reloadRanking: () => Promise<void>;
  reloadEventos: (limit?: number) => Promise<void>;
  reloadConquistas: () => Promise<void>;
  reloadAll: () => Promise<void>;
  registrarEvento: (tipo: string, referencia?: string | null, valor?: number | null) => Promise<void>;
};

const ConquistaRankContext = createContext<ConquistaRankState>({
  carregando: true,
  ranking: null,
  posicoesDoAluno: [],
  eventos: [],
  conquistas: [],
  reloadRanking: async () => console.warn('ConquistaRankProvider nao montado (reloadRanking)'),
  reloadEventos: async () => console.warn('ConquistaRankProvider nao montado (reloadEventos)'),
  reloadConquistas: async () => console.warn('ConquistaRankProvider nao montado (reloadConquistas)'),
  reloadAll: async () => console.warn('ConquistaRankProvider nao montado (reloadAll)'),
  registrarEvento: async () => console.warn('ConquistaRankProvider nao montado (registrarEvento)'),
});

export function ConquistaRankProvider({ children }: { children: React.ReactNode }) {
  const { classeAtual } = useTrilha();
  const { usuario, autenticado } = useUsuario();
  const rankingRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [ranking, setRanking] = useState<ClasseRanking | null>(null);
  const [posicoesDoAluno, setPosicoes] = useState<PosicaoDoAluno[]>([]);
  const [eventos, setEventos] = useState<EventoAluno[]>([]);
  const [conquistas, setConquistas] = useState<Conquista[]>([]);

  const uid = usuario?.id ?? null;

  const clearScheduledRankingRefresh = useCallback(() => {
    if (!rankingRefreshTimerRef.current) return;
    clearTimeout(rankingRefreshTimerRef.current);
    rankingRefreshTimerRef.current = null;
  }, []);

  const reloadRanking = useCallback(async () => {
    const classeId = normalizeClasseId(classeAtual?.classe_id);
    if (!classeId || !uid) {
      setRanking(null);
      setPosicoes([]);
      return;
    }

    try {
      const rk = await ClasseRanking.loadAllByClasse(classeId);
      setRanking(rk);
      const pos = await rk.getPosicoesDoAluno(uid);
      setPosicoes(pos);
    } catch (err) {
      if (!isInvalidBigintDataError(err)) {
        console.warn('[ConquistaRank] Erro ao recarregar ranking:', err);
      }
      setRanking(null);
      setPosicoes([]);
    }
  }, [classeAtual?.classe_id, uid]);

  const reloadEventos = useCallback(async (limit = 10000) => {
    if (!uid) {
      setEventos([]);
      return;
    }

    try {
      const lista = await EventoAluno.listByAluno(uid, limit);
      setEventos(lista);
    } catch (err) {
      console.warn('[ConquistaRank] Erro ao recarregar eventos:', err);
      setEventos([]);
    }
  }, [uid]);

  const scheduleRankingRefresh = useCallback(() => {
    clearScheduledRankingRefresh();
    rankingRefreshTimerRef.current = setTimeout(() => {
      void Promise.all([reloadRanking(), reloadEventos()]);
    }, 450);
  }, [clearScheduledRankingRefresh, reloadEventos, reloadRanking]);

  const reloadConquistas = useCallback(async () => {
    if (!uid) {
      setConquistas([]);
      return;
    }

    try {
      const lista = await Conquista.fetchAllForAluno(uid);
      setConquistas(lista);
    } catch (err) {
      console.warn('[ConquistaRank] Erro ao recarregar conquistas:', err);
      setConquistas([]);
    }
  }, [uid]);

  const reloadAll = useCallback(async () => {
    if (!uid) {
      setRanking(null);
      setPosicoes([]);
      setEventos([]);
      setConquistas([]);
      return;
    }

    const tasks: Promise<void>[] = [reloadEventos(), reloadConquistas()];

    if (normalizeClasseId(classeAtual?.classe_id)) {
      tasks.push(reloadRanking());
    } else {
      setRanking(null);
      setPosicoes([]);
    }

    await Promise.all(tasks);
  }, [classeAtual?.classe_id, reloadConquistas, reloadEventos, reloadRanking, uid]);

  const registrarEvento = useCallback(async (
    tipo: string,
    referencia?: string | null,
    valor?: number | null,
  ) => {
    if (!uid) return;

    try {
      await EventoAluno.create({
        aluno_id: uid,
        tipo,
        referencia: referencia ?? null,
        valor: valor ?? null,
      });
      await reloadEventos();
      scheduleRankingRefresh();
    } catch (err) {
      console.warn('[ConquistaRank] Erro ao registrar evento:', err);
      throw err;
    }
  }, [reloadEventos, scheduleRankingRefresh, uid]);

  useEffect(() => {
    if (autenticado && uid) return;
    setRanking(null);
    setPosicoes([]);
    setEventos([]);
    setConquistas([]);
    setCarregando(false);
  }, [autenticado, uid]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!autenticado || !uid) {
        if (mounted) setCarregando(false);
        return;
      }

      setCarregando(true);
      try {
        await Promise.all([
          reloadEventos(),
          reloadConquistas(),
          normalizeClasseId(classeAtual?.classe_id) ? reloadRanking() : Promise.resolve(),
        ]);
      } catch (err) {
        console.warn('[ConquistaRank] Erro no carregamento inicial:', err);
      } finally {
        if (mounted) setCarregando(false);
      }
    };

    void init();
    return () => {
      mounted = false;
    };
  }, [autenticado, classeAtual?.classe_id, reloadConquistas, reloadEventos, reloadRanking, uid]);

  useEffect(() => {
    if (!uid) return;

    const classeId = normalizeClasseId(classeAtual?.classe_id);
    const channel = supabase.channel(`conquista_rank_refresh_${uid}_${classeId ?? 'all'}`);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'eventos_aluno',
        filter: `aluno_id=eq.${uid}`,
      },
      () => {
        scheduleRankingRefresh();
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'classe_aluno',
        filter: `aluno_id=eq.${uid}`,
      },
      (payload) => {
        if (!classeId) {
          scheduleRankingRefresh();
          return;
        }

        const rawClasseId =
          (payload as any)?.new?.classe_id ??
          (payload as any)?.old?.classe_id ??
          null;
        const changedClasseId = normalizeClasseId(rawClasseId);
        if (!changedClasseId || changedClasseId === classeId) {
          scheduleRankingRefresh();
        }
      }
    );

    channel.subscribe();

    return () => {
      channel.unsubscribe();
      clearScheduledRankingRefresh();
    };
  }, [classeAtual?.classe_id, clearScheduledRankingRefresh, scheduleRankingRefresh, uid]);

  useEffect(() => {
    return () => {
      clearScheduledRankingRefresh();
    };
  }, [clearScheduledRankingRefresh]);

  const value = useMemo(
    () => ({
      carregando,
      ranking,
      posicoesDoAluno,
      eventos,
      conquistas,
      reloadRanking,
      reloadEventos,
      reloadConquistas,
      reloadAll,
      registrarEvento,
    }),
    [
      carregando,
      conquistas,
      eventos,
      posicoesDoAluno,
      ranking,
      registrarEvento,
      reloadAll,
      reloadConquistas,
      reloadEventos,
      reloadRanking,
    ],
  );

  return <ConquistaRankContext.Provider value={value}>{children}</ConquistaRankContext.Provider>;
}

export const useConquistaRank = () => useContext(ConquistaRankContext);
