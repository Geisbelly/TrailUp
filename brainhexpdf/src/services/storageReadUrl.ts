// URL de leitura de um objeto recem-enviado ao Supabase Storage.
//
// `conteudo_aluno`, `perfil_fotos` e `banners_fotos` sao PRIVADOS desde a
// #195 (alembic 20261024_09), e `conteudos` (material do professor) desde a
// 20261024_10: a URL publica deles da' 400. Para esses, a rota
// devolve uma URL ASSINADA de curta duracao (ou o caminho, se o Storage nao
// assinar, por exemplo com a chave anonima sob RLS). Os demais buckets seguem
// com a URL publica.

export const BUCKETS_PRIVADOS = new Set(['conteudo_aluno', 'perfil_fotos', 'banners_fotos', 'conteudos']);
export const VALIDADE_PADRAO_SEGUNDOS = 3600;

type StorageDoBucket = {
  getPublicUrl(path: string): { data: { publicUrl: string } | null };
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
};

export type ClienteDeStorage = { storage: { from(bucket: string): StorageDoBucket } };

export async function urlDeLeituraDoStorage(
  cliente: ClienteDeStorage,
  bucket: string,
  caminho: string,
  validadeSegundos: number = VALIDADE_PADRAO_SEGUNDOS,
): Promise<string> {
  const doBucket = cliente.storage.from(bucket);
  if (!BUCKETS_PRIVADOS.has(bucket)) {
    return doBucket.getPublicUrl(caminho).data?.publicUrl || caminho;
  }
  try {
    const { data, error } = await doBucket.createSignedUrl(caminho, validadeSegundos);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // cai no caminho
  }
  return caminho;
}
