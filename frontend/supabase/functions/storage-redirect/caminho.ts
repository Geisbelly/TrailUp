// Validacao do storage_path pedido ao gateway.
//
// A autorizacao de verdade e' a consulta a vw_material_storage_paths com o JWT
// do chamador (o RLS decide). Isto aqui e' higiene de entrada: rejeitar cedo o
// que nunca poderia ser um caminho valido, para nao levar lixo ao banco nem
// montar assinatura em cima de string estranha.
//
// Sem regex de proposito: escapes em string sao facil de errar e este e' o
// ponto onde errar tem consequencia de seguranca.

const SEGMENTOS_PROIBIDOS = new Set(['', '.', '..']);
const TAMANHO_MAXIMO = 1024;

function temCaractereDeControle(valor: string): boolean {
  for (let i = 0; i < valor.length; i++) {
    const c = valor.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Devolve o caminho normalizado, ou `null` se ele nao serve.
 *
 * Recusa: vazio, barra inicial, barra invertida, segmento vazio/`.`/`..`,
 * caractere de controle e comprimento absurdo. Nao "conserta" caminho torto -
 * um caminho que precisa de conserto nao vai casar com o do banco de qualquer
 * jeito, e devolver null da' um 400 claro em vez de um 404 confuso.
 */
export function normalizarStoragePath(bruto: string | null | undefined): string | null {
  if (typeof bruto !== 'string') return null;

  const valor = bruto.trim();
  if (!valor || valor.length > TAMANHO_MAXIMO) return null;
  if (temCaractereDeControle(valor)) return null;
  if (valor.startsWith('/')) return null;
  if (valor.includes(String.fromCharCode(92))) return null; // barra invertida

  const segmentos = valor.split('/');
  for (const seg of segmentos) {
    if (SEGMENTOS_PROIBIDOS.has(seg)) return null;
  }

  return valor;
}
