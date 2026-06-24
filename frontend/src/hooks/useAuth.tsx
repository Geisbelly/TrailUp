import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session, AuthError, PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UserRole = "professor" | "aluno" | null;

type BrainHexPerfil = { nome: string; afinidade: number };

type SignUpError = AuthError | PostgrestError | Error | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  isLoading: boolean;
  isProfessorLiberado: boolean;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    metadata?: Record<string, unknown>,
    alunoData?: {
      nomeCompleto: string;
      apelido: string;
      modoOperacaoNome: string;
      perfis: BrainHexPerfil[];
    },
    professorData?: {
      nomeCompleto: string;
      instituicao?: string;
      disciplina?: string;
      descricao?: string;
    }
  ) => Promise<{ error: SignUpError; user?: User | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: AuthError | null;
    isPendingApproval?: boolean;
    user?: User | null;
    role?: UserRole;
  }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfessorLiberado, setIsProfessorLiberado] = useState(false);

  const fetchUserRole = async (
  userId: string,
  userMetadata?: Record<string, unknown>
): Promise<UserRole> => {
  try {
    // 1) Professor tem prioridade absoluta
    const { data: profData, error: profErr } = await supabase
      .from("professor")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!profErr && profData?.id) {
      return "professor";
    }

    // 2) Depois tenta aluno
    const { data: alunoData, error: alunoErr } = await supabase
      .from("alunos")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!alunoErr && alunoData?.id) {
      return "aluno";
    }

    // 3) Só se o banco não souber nada, usa metadata como fallback
    if (userMetadata?.role) {
      return userMetadata.role as UserRole;
    }

    return null;
  } catch (error) {
    console.error("Error in fetchUserRole:", error);
    return null;
  }
};

  const checkProfessorApproval = async (
    userId: string
  ): Promise<{ isProfessor: boolean; liberado: boolean }> => {
    try {
      const { data, error } = await supabase
        .from("professor")
        .select("id, liberado")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error in checkProfessorApproval:", error);
        return { isProfessor: false, liberado: false };
      }

      if (!data) {
        return { isProfessor: false, liberado: false };
      }

      return { isProfessor: true, liberado: Boolean(data.liberado) };
    } catch (error) {
      console.error("Error in checkProfessorApproval:", error);
      return { isProfessor: false, liberado: false };
    }
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const userMetadata = session.user.user_metadata;
        (async () => {
          const role = await fetchUserRole(session.user.id, userMetadata);
          setUserRole(role);

          if (role === "professor") {
            const { liberado } = await checkProfessorApproval(session.user.id);
            setIsProfessorLiberado(liberado);
          } else {
            setIsProfessorLiberado(false);
          }

          setIsLoading(false);
        })();
      } else {
        setUserRole(null);
        setIsProfessorLiberado(false);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const userMetadata = session.user.user_metadata;
        const role = await fetchUserRole(session.user.id, userMetadata);
        setUserRole(role);

        if (role === "professor") {
          const { liberado } = await checkProfessorApproval(session.user.id);
          setIsProfessorLiberado(liberado);
        } else {
          setIsProfessorLiberado(false);
        }
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    role: UserRole,
    metadata: Record<string, unknown> = {},
    alunoData?: {
      nomeCompleto: string;
      apelido: string;
      modoOperacaoNome: string;
      perfis: BrainHexPerfil[];
    },
    professorData?: {
      nomeCompleto: string;
      instituicao?: string;
      disciplina?: string;
      descricao?: string;
    }
  ) => {
    const redirectTo = `${window.location.origin}/auth/confirmacao`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            role,
            ...metadata,
          },
        },
      });


    if (error) {
      return { error };
    }

    // cadastro aluno (via RPC)
    if (role === "aluno" && data?.user && alunoData) {
      const session =
        data.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) {
        return {
          error: new Error(
            "Confirme seu email e faça login para concluir o cadastro do aluno."
          ),
        };
      }

      const { error: rpcError } = await supabase.rpc(
        "fn_cadastrar_aluno_com_perfis",
        {
          p_auth_user_id: data.user.id,
          p_nome_completo: alunoData.nomeCompleto,
          p_email: email,
          p_apelido: alunoData.apelido,
          p_modooperacao_nome: alunoData.modoOperacaoNome,
          p_perfis: alunoData.perfis,
        }
      );

      if (rpcError) {
        console.error("Error creating aluno records:", rpcError);
        return { error: rpcError, user: data?.user ?? null };
      }
    }

    // cadastro professor
    if (role === "professor" && data?.user) {
      const { error: insertError } = await supabase
        .from("professor")
        .insert({
          id: data.user.id,
          nome: professorData?.nomeCompleto ?? (metadata.nome as string | undefined) ?? "",
          descricao: professorData?.descricao ?? (metadata.descricao as string | undefined) ?? "",
          instituicao: professorData?.instituicao ?? (metadata.instituicao as string | undefined) ?? null,
          disciplina: professorData?.disciplina ?? (metadata.disciplina as string | undefined) ?? null,
          liberado: false,
        });

      if (insertError && !insertError.message.includes("duplicate key")) {
        console.error("Error creating professor record:", insertError);
        return { error: insertError, user: data.user };
      }
    }

    return { error, user: data?.user ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.user) {
      setUser(data.user);
      setSession(data.session);

      const userMetadata = data.user.user_metadata;
      const role = await fetchUserRole(data.user.id, userMetadata);
      setUserRole(role);

      if (role === "professor") {
        const { liberado } = await checkProfessorApproval(data.user.id);
        setIsProfessorLiberado(liberado);

        return { error: null, isPendingApproval: false, user: data.user, role };
      }

      setIsProfessorLiberado(false);
      return { error: null, isPendingApproval: false, user: data.user, role };
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setIsProfessorLiberado(false);
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        isLoading,
        isProfessorLiberado,
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
