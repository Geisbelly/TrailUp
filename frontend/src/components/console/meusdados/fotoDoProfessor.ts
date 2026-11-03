import { supabase } from "@/integrations/supabase/client";
import { BUCKET_DE_FOTO, caminhoDaFoto, caminhoDaNovaFoto, problemaDaFoto, refDaFoto } from "@/lib/fotoDePerfil";

export type ResultadoDaFoto = { ok: true } | { ok: false; mensagem: string };

async function gravarRef(uid: string, ref: string | null) {
  return supabase.from("professor").update({ foto_url: ref }).eq("id", uid).select("id").maybeSingle();
}

/**
 * Sobe a foto nova, aponta `professor.foto_url` para ela e só então apaga a anterior.
 * Se gravar a referência falhar, o arquivo recém-subido sai: nada fica órfão no bucket.
 */
export async function trocarFotoDoProfessor(uid: string, arquivo: File, refAnterior: string | null): Promise<ResultadoDaFoto> {
  const problema = problemaDaFoto(arquivo);
  if (problema) return { ok: false, mensagem: problema };

  const caminho = caminhoDaNovaFoto(uid, arquivo.type, Date.now());
  const bucket = supabase.storage.from(BUCKET_DE_FOTO);
  const { error: erroUpload } = await bucket.upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (erroUpload) return { ok: false, mensagem: "Não foi possível enviar a foto. Tente de novo." };

  const { data, error } = await gravarRef(uid, refDaFoto(caminho));
  if (error || !data) {
    await bucket.remove([caminho]);
    return { ok: false, mensagem: "Não foi possível salvar a foto. Tente de novo." };
  }

  const anterior = caminhoDaFoto(refAnterior);
  if (anterior && anterior !== caminho) await bucket.remove([anterior]);
  return { ok: true };
}

/** Limpa a referência primeiro (o perfil para de apontar para o arquivo) e depois apaga o arquivo. */
export async function removerFotoDoProfessor(uid: string, refAtual: string | null): Promise<ResultadoDaFoto> {
  const { data, error } = await gravarRef(uid, null);
  if (error || !data) return { ok: false, mensagem: "Não foi possível remover a foto. Tente de novo." };
  const caminho = caminhoDaFoto(refAtual);
  if (caminho) await supabase.storage.from(BUCKET_DE_FOTO).remove([caminho]);
  return { ok: true };
}
