// src/context/ConquistaRankContext.tsx
import { Conquista } from '@/models/Conquista';
import { normalizeBrainHexProfile } from '@/constants/profileImages';
import { resolveRepresentativeBrainHexProfiles } from '@/utils/brainHex';
import { EventoAluno } from '@/models/Evento';
import { ClasseRanking } from '@/models/Rank';
import { PosicaoDoAluno } from '@/models/RankAlunoPosicao';
import { supabase } from '@/database/supabase';
import { loadStudyPresence, type StudyPresence } from '@/services/studyPresence';
import { carregarFaixaXp, type FaixaXp } from '@/services/faixaXp';
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
  /** A última leitura do ranking falhou. Separa "turma sem ranking" de "não deu para ler". */
  erroRanking: boolean;
  posicoesDoAluno: PosicaoDoAluno[];
  eventos: EventoAluno[];
  presenca: StudyPresence | null;
  conquistas: Conquista[];
  /** Faixa de XP na turma atual (#143). `null` sem turma, sem faixa configurada ou antes de carregar. */
  faixaXp: FaixaXp | null;
  reloadRanking: () => Promise<void>;
  reloadEventos: (limit?: number) => Promise<void>;
  reloadConquistas: () => Promise<void>;
  reloadAll: () => Promise<void>;
  registrarEvento: (tipo: string, referencia?: string | null, valor?: number | null) => Promise<void>;
};

const ConquistaRankContext = createContext<ConquistaRankState>({
  carregando: true,
  ranking: null,
  erroRanking: false,
  posicoesDoAluno: [],
  eventos: [],
  presenca: null,
  conquistas: [],
  faixaXp: null,
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
  const [erroRanking, setErroRanking] = useState(false);
  const [posicoesDoAluno, setPosicoes] = useState<PosicaoDoAluno[]>([]);
  const [eventos, setEventos] = useState<EventoAluno[]>([]);
  const [presenca, setPresenca] = useState<StudyPresence | null>(null);
  const currentUserRef = useRef<string | null>(null);
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [faixaXp, setFaixaXp] = useState<FaixaXp | null>(null);

  const uid = usuario?.id ?? null;
  currentUserRef.current = uid;
  useEffect(() => {
    setPresenca(null);
    setEventos([]);
  }, [uid]);
  const perfisRepresentativos = useMemo(() => {
    const representativos = resolveRepresentativeBrainHexProfiles(usuario?.perfis);
    if (representativos.length > 0) return representativos;
    const fallback = normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome);
    return fallback ? [fallback] : [];
  }, [usuario?.perfis]);

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
      setErroRanking(false);
      return;
    }

    try {
      const rk = await ClasseRanking.loadAllByClasse(classeId);
      setRanking(rk);
      setErroRanking(false);
      const pos = await rk.getPosicoesDoAluno(uid);
      setPosicoes(pos);
    } catch (err) {
      // Id de turma inválido não é falha de rede: a tela mostra "sem ranking", não "tente de novo".
      const idInvalido = isInvalidBigintDataError(err);
      if (!idInvalido) {
        console.warn('[ConquistaRank] Erro ao recarregar ranking:', err);
      }
      setRanking(null);
      setPosicoes([]);
      setErroRanking(!idInvalido);
    }
  }, [classeAtual?.classe_id, uid]);

  // A faixa sai do mesmo XP que o rank soma, então recarrega junto com ele. Uma falha
  // transitória mantém a última faixa lida.
  const reloadFaixaXp = useCallback(async () => {
    const classeId = normalizeClasseId(classeAtual?.classe_id);
    if (!classeId || !uid) {
      setFaixaXp(null);
      return;
    }
    try {
      const faixa = await carregarFaixaXp(classeId);
      if (currentUserRef.current === uid) setFaixaXp(faixa);
    } catch (err) {
      if (!isInvalidBigintDataError(err)) console.warn('[ConquistaRank] Erro ao carregar faixa de XP:', err);
    }
  }, [classeAtual?.classe_id, uid]);

  const reloadEventos = useCallback(async (limit = 10000) => {
    if (!uid) {
      setEventos([]);
      setPresenca(null);
      return;
    }

    await Promise.all([
      EventoAluno.listByAluno(uid, limit).then((lista) => {
        if (currentUserRef.current === uid) setEventos(lista);
      }).catch((err) => {
        if (currentUserRef.current === uid) console.warn('[ConquistaRank] Erro ao recarregar eventos:', err);
      }),
      loadStudyPresence(uid).then((resumo) => {
        if (currentUserRef.current === uid) setPresenca(resumo);
      }).catch((err) => {
        if (currentUserRef.current === uid) console.warn('[ConquistaRank] Erro ao recarregar presença:', err);
      }),
    ]);
    // Uma falha transitória preserva o último resumo e não bloqueia os eventos.
  }, [uid]);

  const scheduleRankingRefresh = useCallback(() => {
    clearScheduledRankingRefresh();
    rankingRefreshTimerRef.current = setTimeout(() => {
      void Promise.all([reloadRanking(), reloadEventos(), reloadFaixaXp()]);
    }, 450);
  }, [clearScheduledRankingRefresh, reloadEventos, reloadFaixaXp, reloadRanking]);

  const reloadConquistas = useCallback(async () => {
    if (!uid) {
      setConquistas([]);
      return;
    }

    try {
      const lista = await Conquista.fetchAllForAluno(uid, perfisRepresentativos);
      setConquistas(lista);
    } catch (err) {
      console.warn('[ConquistaRank] Erro ao recarregar conquistas:', err);
      setConquistas([]);
    }
  }, [perfisRepresentativos, uid]);

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
      tasks.push(reloadRanking(), reloadFaixaXp());
    } else {
      setRanking(null);
      setPosicoes([]);
      setFaixaXp(null);
    }

    await Promise.all(tasks);
  }, [classeAtual?.classe_id, reloadConquistas, reloadEventos, reloadFaixaXp, reloadRanking, uid]);

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
    setPresenca(null);
    setConquistas([]);
    setFaixaXp(null);
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
          reloadFaixaXp(),
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
  }, [autenticado, classeAtual?.classe_id, reloadConquistas, reloadEventos, reloadFaixaXp, reloadRanking, uid]);

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
      erroRanking,
      posicoesDoAluno,
      eventos,
      presenca,
      conquistas,
      faixaXp,
      reloadRanking,
      reloadEventos,
      reloadConquistas,
      reloadAll,
      registrarEvento,
    }),
    [
      carregando,
      conquistas,
      erroRanking,
      eventos,
      faixaXp,
      presenca,
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
