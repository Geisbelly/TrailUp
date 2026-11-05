// O arquivo mora no bucket público `molduras` (migration 20261105_28). Só o dono sobe e apaga.
import { supabase } from "@/integrations/supabase/client";
import { caminhoDaImagem, caminhoDaUrl } from "./administracao";

const BUCKET = "molduras";

export async function enviarImagemDaMoldura(codigo: string, arquivo: File): Promise<string> {
  const caminho = caminhoDaImagem(codigo, arquivo.type, Date.now());
  const bucket = supabase.storage.from(BUCKET);
  const { error } = await bucket.upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) throw new Error("Não foi possível enviar a imagem. Tente de novo.");
  return bucket.getPublicUrl(caminho).data.publicUrl;
}

/** Só apaga o que está no bucket: moldura do pacote do app não tem arquivo aqui. */
export async function apagarImagemDaMoldura(url: string | null | undefined): Promise<void> {
  const caminho = caminhoDaUrl(url);
  if (!caminho) return;
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) throw new Error(error.message);
}
