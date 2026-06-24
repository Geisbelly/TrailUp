import { getSessionSafe, supabase } from "@/database/supabase";
import { Aluno } from "@/models/Aluno";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type SessionLike = {
  user?: {
    id?: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null;
} | null;

type AlunoBaseRow = {
  id: string;
  nome: string | null;
  email: string | null;
  apelido: string | null;
  descricao: string | null;
  foto_url: string | null;
  banner_url: string | null;
  modo_resposta: string | null;
};

type AlunoPerfilRow = {
  afinidade: number | null;
  criado_em: string | null;
  atualizado_em: string | null;
  perfil: {
    id: number;
    nome: string | null;
    descricao: string | null;
    caracteristicas: unknown;
  } | null;
};

type SessionContextType = {
  usuario: Aluno | null;
  autenticado: boolean;
  carregando: boolean;
  atualizarUsuario: () => Promise<void>;
};

const UserContext = createContext<SessionContextType>({
  usuario: null,
  autenticado: false,
  carregando: true,
  atualizarUsuario: async () => {
    console.warn("UserProvider nao montado ou atualizarUsuario chamado no valor default do contexto.");
  },
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Aluno | null>(null);
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const usuarioRef = useRef<Aluno | null>(null);
  const authUserIdRef = useRef<string | null>(null);
  const hydrationRetryCountRef = useRef<Map<string, number>>(new Map());
  const ensureInFlightRef = useRef<Set<string>>(new Set());

  const updateUsuario = useCallback((next: Aluno | null) => {
    usuarioRef.current = next;
    setUsuario(next);
  }, []);

  const buildFallbackUsuario = useCallback((sessionLike: SessionLike): Aluno | null => {
    const uid = String(sessionLike?.user?.id ?? "").trim();
    if (!uid) return null;

    const email = String(sessionLike?.user?.email ?? "").trim();
    const nomeFallback =
      String(
        (sessionLike?.user?.user_metadata?.nome as string | undefined) ??
          (sessionLike?.user?.user_metadata?.name as string | undefined) ??
          email.split("@")[0] ??
          "Aluno",
      ).trim() || "Aluno";

    const fallback = {
      id: uid,
      nome: nomeFallback,
      email,
      apelido: null,
      descricao: null,
      foto_url: null,
      banner_url: null,
      modoResposta: null,
      modoOperacao_nome: null,
      modoOperacao_descricao: null,
      modoOperacao_ordem: null,
      perfis: [],
      loadPerfis: async () => {},
      save: async () => {},
      setAfinidade: async () => {},
      removePerfil: async () => {},
      refresh: async () => {},
      atualizarPerfilViaFuncao: async () => fallback,
      toJSON: () => ({
        id: uid,
        nome: nomeFallback,
        email,
        apelido: null,
        descricao: null,
        foto_url: null,
        banner_url: null,
        modoOperacao_nome: null,
        modoOperacao_descricao: null,
        modoOperacao_ordem: null,
        modoResposta: null,
        perfis: [],
      }),
    };

    return fallback as unknown as Aluno;
  }, []);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }, []);

  const patchCurrentUsuario = useCallback(
    (uid: string, reqId: number, patch: Partial<Aluno>) => {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      const current = usuarioRef.current;
      if (!current || current.id !== uid) return;

      const next = Object.assign(
        Object.create(Object.getPrototypeOf(current) ?? Object.prototype),
        current,
        patch,
      ) as Aluno;
      updateUsuario(next);
    },
    [updateUsuario],
  );

  const enrichUsuarioFromAlunos = useCallback(
    async (uid: string, reqId: number) => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("alunos")
            .select("id, nome, email, apelido, descricao, foto_url, banner_url, modo_resposta")
            .eq("id", uid)
            .maybeSingle<AlunoBaseRow>(),
          6_000,
          "alunos.select",
        );
        if (error || !data) return;
        const current = usuarioRef.current;
        patchCurrentUsuario(uid, reqId, {
          nome: data.nome ?? current?.nome,
          email: data.email ?? current?.email,
          apelido: data.apelido ?? current?.apelido ?? null,
          descricao: data.descricao ?? current?.descricao ?? null,
          foto_url: data.foto_url ?? current?.foto_url ?? null,
          banner_url: data.banner_url ?? current?.banner_url ?? null,
          modoResposta: data.modo_resposta ?? current?.modoResposta ?? null,
        } as Partial<Aluno>);
        console.log("[UserContext] Hidracao base concluida (alunos).");
      } catch {
        // sem bloqueio: hidratacao principal segue por Aluno.getCurrent/ensureCurrent
      }
    },
    [patchCurrentUsuario, withTimeout],
  );

  const enrichPerfisFromAlunoPerfil = useCallback(
    async (uid: string, reqId: number) => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("aluno_perfil")
            .select(`
              afinidade,
              criado_em,
              atualizado_em,
              perfil:perfil_id (
                id,
                nome,
                descricao,
                caracteristicas
              )
            `)
            .eq("aluno_id", uid)
            .order("afinidade", { ascending: false }),
          8_000,
          "aluno_perfil.select",
        );
        if (error || !data) return;

        const perfis = (data as AlunoPerfilRow[]).map((row) => ({
          id: row.perfil?.id,
          nome: row.perfil?.nome ?? null,
          descricao: row.perfil?.descricao ?? null,
          caracteristicas: row.perfil?.caracteristicas ?? null,
          afinidade: Number(row.afinidade ?? 0),
          criado_em: row.criado_em ?? null,
          atualizado_em: row.atualizado_em ?? null,
        }));

        patchCurrentUsuario(uid, reqId, { perfis } as Partial<Aluno>);
        console.log("[UserContext] Hidracao de perfis concluida. Total:", perfis.length);
      } catch {
        // sem bloqueio
      }
    },
    [patchCurrentUsuario, withTimeout],
  );

  const ensureCurrentInBackground = useCallback(
    async (uid: string, reqId: number) => {
      if (!uid) return;
      if (ensureInFlightRef.current.has(uid)) return;
      ensureInFlightRef.current.add(uid);
      try {
        const usuarioCompleto = await withTimeout(Aluno.ensureCurrent(), 15_000, "Aluno.ensureCurrent.bg");
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        if (authUserIdRef.current !== uid) return;
        hydrationRetryCountRef.current.delete(uid);
        updateUsuario(usuarioCompleto);
      } catch {
        // sem bloqueio
      } finally {
        ensureInFlightRef.current.delete(uid);
      }
    },
    [updateUsuario, withTimeout],
  );

  const syncFromSession = useCallback(
    async (sessionFromEvent?: SessionLike, options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? true;
      const reqId = ++requestIdRef.current;
      let resolvedSession: SessionLike = sessionFromEvent;
      if (mountedRef.current && showLoading) setCarregando(true);

      try {
        let session = resolvedSession;
        if (!session?.user?.id) {
          session = await withTimeout(getSessionSafe(), 10_000, "getSessionSafe");
        }
        resolvedSession = session;

        const uid = session?.user?.id;
        if (!uid) {
          if (mountedRef.current && reqId === requestIdRef.current) {
            setAutenticado(false);
            authUserIdRef.current = null;
            updateUsuario(null);
          }
          return;
        }

        if (mountedRef.current && reqId === requestIdRef.current) {
          setAutenticado(true);
        }
        authUserIdRef.current = uid;

        // Evita estado autenticado sem usuario durante hidratação longa do perfil.
        const currentUsuario = usuarioRef.current;
        if ((!currentUsuario || currentUsuario.id !== uid) && mountedRef.current && reqId === requestIdRef.current) {
          const fallback = buildFallbackUsuario(session);
          if (fallback) {
            updateUsuario(fallback);
            void enrichUsuarioFromAlunos(uid, reqId);
            void enrichPerfisFromAlunoPerfil(uid, reqId);
          }
        } else {
          void enrichUsuarioFromAlunos(uid, reqId);
          void enrichPerfisFromAlunoPerfil(uid, reqId);
        }

        let usuarioLogado: Aluno | null = null;
        try {
          usuarioLogado = await withTimeout(Aluno.getCurrent(), 8_000, "Aluno.getCurrent");
        } catch {
          // fallback abaixo
        }

        if (usuarioLogado && mountedRef.current && reqId === requestIdRef.current) {
          hydrationRetryCountRef.current.delete(uid);
          updateUsuario(usuarioLogado);
        } else {
          // Nao bloqueia o fluxo de login aguardando ensureCurrent.
          void ensureCurrentInBackground(uid, reqId);
        }
      } catch (err) {
        console.warn("[UserContext] Erro ao sincronizar sessao:", err);
        const isTimeout = /excedeu/i.test(String((err as Error)?.message ?? ""));
        if (mountedRef.current && reqId === requestIdRef.current) {
          // Mantem sessao autenticada quando o problema e timeout de hidratacao do perfil.
          if (!isTimeout && !usuarioRef.current) {
            setAutenticado(false);
            authUserIdRef.current = null;
            updateUsuario(null);
          } else {
            setAutenticado(true);
            const retryUid = authUserIdRef.current ?? "";
            const retryCount = hydrationRetryCountRef.current.get(retryUid) ?? 0;
            hydrationRetryCountRef.current.set(retryUid, retryCount + 1);

            if (!usuarioRef.current) {
              const fallback = buildFallbackUsuario(resolvedSession ?? { user: { id: retryUid } });
              if (fallback) {
                updateUsuario(fallback);
                if (retryUid) {
                  void enrichUsuarioFromAlunos(retryUid, reqId);
                  void enrichPerfisFromAlunoPerfil(retryUid, reqId);
                }
              }
            }
            if (retryUid) {
              void enrichUsuarioFromAlunos(retryUid, reqId);
              void enrichPerfisFromAlunoPerfil(retryUid, reqId);
              if (retryCount < 5) {
                void ensureCurrentInBackground(retryUid, reqId);
              }
            }
          }
        }
      } finally {
        if (showLoading && mountedRef.current && reqId === requestIdRef.current) {
          setCarregando(false);
        }
      }
    },
    [
      buildFallbackUsuario,
      ensureCurrentInBackground,
      enrichPerfisFromAlunoPerfil,
      enrichUsuarioFromAlunos,
      updateUsuario,
      withTimeout,
    ],
  );

  const atualizarUsuario = useCallback(async () => {
    await syncFromSession();
  }, [syncFromSession]);

  useEffect(() => {
    mountedRef.current = true;
    void syncFromSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        requestIdRef.current += 1;
        if (mountedRef.current) {
          hydrationRetryCountRef.current.clear();
          setAutenticado(false);
          authUserIdRef.current = null;
          updateUsuario(null);
          setCarregando(false);
        }
        return;
      }

      // Evita bloqueio da pilha interna do Supabase durante onAuthStateChange.
      setTimeout(() => {
        void syncFromSession(session as SessionLike);
      }, 0);
    });

    return () => {
      mountedRef.current = false;
      listener?.subscription.unsubscribe();
    };
  }, [syncFromSession, updateUsuario]);

  return (
    <UserContext.Provider value={{ usuario, autenticado, carregando, atualizarUsuario }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUsuario = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUsuario deve ser usado dentro de um UserProvider");
  }
  return context;
};
