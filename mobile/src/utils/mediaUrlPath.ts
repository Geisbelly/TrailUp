/** Caminho do arquivo, inclusive quando a URL aponta para o gateway do R2. */
export function mediaUrlPath(value: string): string {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if (url.pathname.replace(/\/$/, '').endsWith('/functions/v1/storage-redirect')) {
      const path = url.searchParams.get('path');
      if (path) return path.split(/[?#]/, 1)[0];
    }
  } catch { /* Caminhos relativos continuam válidos. */ }
  return raw.split(/[?#]/, 1)[0];
}
