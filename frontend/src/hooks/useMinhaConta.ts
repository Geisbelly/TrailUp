import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BUCKET_DE_FOTO, caminhoDaFoto } from "@/lib/fotoDePerfil";

export type MinhaConta = {
  nome: string;
  /** Referencia gravada na coluna (`perfil_fotos/<uid>/...`), para trocar ou remover. */
  fotoRef: string | null;
  /** URL assinada pronta para o <img>, ou `null` sem foto. */
  fotoUrl: string | null;
};

// A URL assinada vale 1 h; a consulta fica fresca por 30 min e se renova antes de ela expirar.
const VALIDADE_DA_URL_S = 60 * 60;
const FRESCA_POR_MS = 30 * 60 * 1000;

export const chaveDaMinhaConta = (uid: string | undefined) => ["minha-conta", uid] as const;

/**
 * Nome e foto de quem está logado, para o cabeçalho do site e o topo do console.
 * Lê `professor` ou `alunos` direto no Supabase (RLS: a própria linha) e assina a foto.
 */
export function useMinhaConta() {
  const { user, userRole } = useAuth();
  return useQuery({
    queryKey: chaveDaMinhaConta(user?.id),
    enabled: !!user && !!userRole,
    staleTime: FRESCA_POR_MS,
    queryFn: async (): Promise<MinhaConta> => {
      const nomeDaSessao = String(user?.user_metadata?.nome ?? "").trim() || user?.email?.split("@")[0] || "Minha conta";
      let nome: string | null = null;
      let fotoRef: string | null = null;
      if (userRole === "professor") {
        const { data } = await supabase.from("professor").select("nome, foto_url").eq("id", user!.id).maybeSingle();
        nome = data?.nome ?? null;
        fotoRef = data?.foto_url ?? null;
      } else {
        const { data } = await supabase.from("alunos").select("nome, apelido, foto_url").eq("id", user!.id).maybeSingle();
        nome = data?.apelido || data?.nome || null;
        fotoRef = data?.foto_url ?? null;
      }
      const caminho = caminhoDaFoto(fotoRef);
      let fotoUrl: string | null = null;
      if (caminho) {
        const { data } = await supabase.storage.from(BUCKET_DE_FOTO).createSignedUrl(caminho, VALIDADE_DA_URL_S);
        fotoUrl = data?.signedUrl ?? null;
      }
      return { nome: nome?.trim() || nomeDaSessao, fotoRef, fotoUrl };
    },
  });
}
