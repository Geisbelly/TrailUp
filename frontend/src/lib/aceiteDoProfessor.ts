// Aceite dos termos pelo professor (migration 20261105_27). A versão vem do banco para existir num lugar só.
import { supabase } from "@/integrations/supabase/client";

export type AceiteDoProfessor = { versao_vigente: string; vigente: boolean };

function lerAceite(dado: unknown): AceiteDoProfessor | null {
  const d = dado as Partial<AceiteDoProfessor> | null;
  return d && typeof d.versao_vigente === "string" ? { versao_vigente: d.versao_vigente, vigente: d.vigente === true } : null;
}

export async function lerMeuAceite(): Promise<AceiteDoProfessor | null> {
  const { data, error } = await supabase.rpc("professor_meu_aceite" as never);
  if (error) throw new Error(error.message);
  return lerAceite(data);
}

export async function aceitarTermosDoProfessor(via: "cadastro" | "console"): Promise<void> {
  const atual = await lerMeuAceite();
  if (!atual || atual.vigente) return;
  const { error } = await supabase.rpc(
    "professor_registrar_aceite_termos" as never,
    { p_versao: atual.versao_vigente, p_origem: { plataforma: "web", via } } as never,
  );
  if (error) throw new Error(error.message);
}
