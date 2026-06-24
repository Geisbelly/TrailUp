// src/contexts/NotificationsContext.tsx
import { getSessionSafe, supabase } from '@/database/supabase';
import { Notificacao } from '@/models/Notificacoes';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Tipos para os Toasts
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'achievement' | 'rank';


export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // Se 0 ou undefined, não fecha sozinho (para modais)
  onPress?: () => void; // Ação ao clicar (para o Rank)
}

type StatusFiltro = 'todas' | 'pendente' | 'enviada' | 'lida' | 'falhou';

type NotificationsState = {
  carregando: boolean;
  alunoId: string | null;
  itens: Notificacao[];
  hasMore: boolean;
  filtroStatus: StatusFiltro;

  setFiltroStatus: (status: StatusFiltro) => void;

  reload: () => Promise<void>;
  loadMore: () => Promise<void>;

  create: (data: {
    titulo: string;
    corpo: string;
    tipo?: string | null;
    horario_envio?: string | null;
    status?: string;
  }) => Promise<Notificacao | null>;

  marcarStatus: (id: number, status: string) => Promise<void>;
  marcarLida: (id: number) => Promise<void>;
  deletar: (id: number) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  activeToasts: ToastMessage[];
  addToast: (data: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsState>({
  carregando: true,
  alunoId: null,
  itens: [],
  hasMore: true,
  filtroStatus: 'todas',
  setFiltroStatus: () => {},
  reload: async () => console.warn('NotificationsProvider não montado (reload)'),
  loadMore: async () => console.warn('NotificationsProvider não montado (loadMore)'),
  create: async () => {
    console.warn('NotificationsProvider não montado (create)');
    return null;
  },
  marcarStatus: async () => console.warn('NotificationsProvider não montado (marcarStatus)'),
  marcarLida: async () => console.warn('NotificationsProvider não montado (marcarLida)'),
  deletar: async () => console.warn('NotificationsProvider não montado (deletar)'),
  marcarTodasLidas: async () => console.warn('NotificationsProvider não montado (marcarTodasLidas)'),
  activeToasts: [],
  addToast: () => console.warn('NotificationsProvider não montado (addToast)'),
  removeToast: () => console.warn('NotificationsProvider não montado (removeToast)'),
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const PAGE_SIZE = 20;
  const SESSION_ERROR_LOG_COOLDOWN_MS = 60_000;

  const [carregando, setCarregando] = useState(true);
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('todas');
  const [activeToasts, setActiveToasts] = useState<ToastMessage[]>([]);

  // Toasts
  const removeToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ title, description, type, duration, onPress }: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Regra de duração padrão:
    // Rank (Toast) = 5s
    // Modais (Conquista/Info) = 0 (usuário fecha manualmente)
    let finalDuration = duration;
    if (finalDuration === undefined) {
       finalDuration = type === 'rank' ? 5000 : 0;
    }

    setActiveToasts((prev) => [...prev, { id, title, description, type, duration: finalDuration, onPress }]);

    if (finalDuration && finalDuration > 0) {
      setTimeout(() => removeToast(id), finalDuration);
    }
  }, [removeToast]);

  
  // paginação baseada em “offset” simples
  const pageRef = useRef(0);
  const lastSessionErrorLogAtRef = useRef(0);

  const logSessionError = useCallback((error: unknown) => {
    const now = Date.now();
    if (now - lastSessionErrorLogAtRef.current < SESSION_ERROR_LOG_COOLDOWN_MS) {
      return;
    }
    lastSessionErrorLogAtRef.current = now;
    console.warn('[NotificationsContext] getSession erro:', error);
  }, [SESSION_ERROR_LOG_COOLDOWN_MS]);

  const getAlunoFromSession = useCallback(async (): Promise<string | null> => {
    try {
      const session = await getSessionSafe();
      const uid = session?.user?.id ?? null;
      setAlunoId(prev => (prev === uid ? prev : uid));
      return uid;
    } catch (error) {
      logSessionError(error);
      setAlunoId(null);
      return null;
    }
  }, [logSessionError]);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const uid = await getAlunoFromSession();

      if (!uid) {
        setItens([]);
        setHasMore(false);
        return;
      }

      let query = supabase
        .from('notificacoes')
        .select('*')
        .eq('aluno_id', uid)
        .order('horario_envio', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filtroStatus !== 'todas') {
        query = query.eq('status', filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      const novas = (data ?? []).map(Notificacao.fromRow);

      setItens(prev => (append ? [...prev, ...novas] : novas));
      setHasMore(novas.length === PAGE_SIZE);
    },
    [getAlunoFromSession, filtroStatus]
  );

  const reload = useCallback(async () => {
    setCarregando(true);
    try {
      pageRef.current = 0;
      await fetchPage(0, false);
    } catch (e) {
      console.warn('[NotificationsContext] reload erro:', e);
      setItens([]);
      setHasMore(false);
    } finally {
      setCarregando(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || carregando) return;
    try {
      const next = pageRef.current + 1;
      await fetchPage(next, true);
      pageRef.current = next;
    } catch (e) {
      console.warn('[NotificationsContext] loadMore erro:', e);
    }
  }, [fetchPage, hasMore, carregando]);

  // ações

  const create = useCallback(
    async (input: {
      titulo: string;
      corpo: string;
      tipo?: string | null;
      horario_envio?: string | null;
      status?: string;
    }) => {
      const uid = await getAlunoFromSession();
      try {
        const n = await Notificacao.create({
          aluno_id: uid,
          titulo: input.titulo,
          corpo: input.corpo,
          tipo: input.tipo ?? null,
          horario_envio: input.horario_envio,
          status: input.status ?? 'pendente',
        });
        // otimista: injeta no topo da lista atual
        setItens(prev => [n, ...prev]);
        return n;
      } catch (e) {
        console.warn('[NotificationsContext] create erro:', e);
        return null;
      }
    },
    [getAlunoFromSession]
  );

  const marcarStatus = useCallback(async (id: number, status: string) => {
    try {
      const item = itens.find(n => n.id === id);
      if (!item) return;
      await item.updateStatus(status);
      await item.updateRead();
      setItens(prev => prev.map(n => (n.id === id ? { ...n, status } as Notificacao : n)));
    } catch (e) {
      console.warn('[NotificationsContext] marcarStatus erro:', e);
    }
  }, [itens]);

  const marcarLida = useCallback(async (id: number) => {
    await marcarStatus(id, 'lida');
  }, [marcarStatus]);

  const deletar = useCallback(async (id: number) => {
    try {
      const item = itens.find(n => n.id === id);
      if (!item) return;
      await item.delete();
      setItens(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.warn('[NotificationsContext] deletar erro:', e);
    }
  }, [itens]);

  const marcarTodasLidas = useCallback(async () => {
    try {
      const uid = await getAlunoFromSession();
      if (!uid) return;

      const { error } = await supabase
        .from('notificacoes')
        .update({ status: 'lida' })
        .eq('aluno_id', uid)
        .neq('status', 'lida');
      if (error) throw error;

      setItens(prev => prev.map(n => ({ ...n, status: 'lida' } as Notificacao)));
    } catch (e) {
      console.warn('[NotificationsContext] marcarTodasLidas erro:', e);
    }
  }, [getAlunoFromSession]);

  // inicial + reatividade a auth
  useEffect(() => {
    (async () => {
      setCarregando(true);
      try {
        await getAlunoFromSession();
        await reload();
      } finally {
        setCarregando(false);
      }
    })();
  }, [getAlunoFromSession, reload]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void (async () => {
          await getAlunoFromSession();
          await reload();
        })();
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [getAlunoFromSession, reload]);

  // refetch quando mudar filtro
  useEffect(() => {
    reload();
  }, [filtroStatus, reload]);

  // realtime: escuta mudanças na tabela notificacoes do aluno atual
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        const uid = await getAlunoFromSession();
        if (!uid) return;

        channel = supabase
          .channel(`notificacoes_changes_${uid}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'notificacoes', filter: `aluno_id=eq.${uid}` },
            (payload) => {
            
            // --- CASO 1: NOVA NOTIFICAÇÃO (INSERT) ---
            if (payload.eventType === 'INSERT') {
              const n = Notificacao.fromRow(payload.new);
            
              // Atualiza lista
              if (filtroStatus === 'todas' || n.status === filtroStatus) {
                setItens(prev => [n, ...prev]);
              }

              // Mapeamento de Tipos e Comportamento
              let visualType: ToastType = 'info';
              const tipoDb = n.tipo?.toLowerCase() || '';
              let action = undefined;

              if (['rank', 'ranking', 'subiu'].includes(tipoDb)) {
                visualType = 'rank';
                // Ação de redirecionamento para Rank
                action = () => router.push('/ranking'); 
              } else if (['conquista', 'achievement', 'medalha'].includes(tipoDb)) {
                visualType = 'achievement';
              } else if (['aviso', 'alerta', 'warning'].includes(tipoDb)) {
                visualType = 'warning';
              } else if (['erro', 'falha'].includes(tipoDb)) {
                visualType = 'error';
              } else if (['sucesso', 'ok'].includes(tipoDb)) {
                visualType = 'success';
              }

              addToast({
                type: visualType,
                title: n.titulo,
                description: n.corpo,
                onPress: action,
              });
            } 
            
            // --- CASO 2: ATUALIZAÇÃO (UPDATE) ---
            else if (payload.eventType === 'UPDATE') {
              const n = Notificacao.fromRow(payload.new);
              // Apenas atualiza a lista (ex: marcou como lida), não gera popup
              setItens(prev => prev.map(x => (x.id === n.id ? n : x)));
            } 
            
            // --- CASO 3: DELEÇÃO (DELETE) ---
            else if (payload.eventType === 'DELETE') {
              // Cuidado: DELETE não tem payload.new, usa payload.old
              const id = (payload.old as any)?.id as number;
              setItens(prev => prev.filter(x => x.id !== id));
            }
            }
          )
          .subscribe();
      } catch (error) {
        console.warn('[NotificationsContext] realtime init erro:', error);
      }
    })();

    return () => {
      channel?.unsubscribe();
    };
  }, [getAlunoFromSession, filtroStatus, addToast, router]);

  const value = useMemo(
    () => ({
      carregando,
      alunoId,
      classeId: null, // não é usado aqui, mas mantém padronizado se quiser integrar
      itens,
      hasMore,
      filtroStatus,
      setFiltroStatus,
      reload,
      loadMore,
      create,
      marcarStatus,
      marcarLida,
      deletar,
      marcarTodasLidas,
      activeToasts,
      addToast,
      removeToast
    }),
    [
      carregando, alunoId, itens, hasMore, filtroStatus,
      reload, loadMore, create, marcarStatus, marcarLida, deletar, marcarTodasLidas, activeToasts, addToast, removeToast
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
