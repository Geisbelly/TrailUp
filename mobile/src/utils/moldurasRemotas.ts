// Molduras com imagem cadastrada no console (`molduras.imagem_url`, 20261105_28). Vale sobre o
// desenho do pacote: é o que deixa trocar uma imagem ou lançar moldura nova sem build. Módulo puro,
// sem Supabase: quem lê o banco é `services/molduras.ts`.
import type { ImageSourcePropType } from 'react-native';

import type { FrameOpening } from '@/utils/profileFrameLayout';

export type MolduraRemota = { source: ImageSourcePropType; opening: FrameOpening };

let remotas: Readonly<Record<string, MolduraRemota>> = {};
const ouvintes = new Set<() => void>();

/** Linha sem imagem https ou sem abertura completa fica de fora: vale o pacote, ou a do perfil. */
function lerLinha(bruta: unknown): [string, MolduraRemota] | null {
  const l = (bruta ?? {}) as { codigo?: unknown; imagem_url?: unknown; abertura?: unknown };
  const a = (l.abertura ?? {}) as { x?: unknown; y?: unknown; radius?: unknown };
  const opening = { x: Number(a.x), y: Number(a.y), radius: Number(a.radius) };
  if (typeof l.codigo !== 'string' || !l.codigo) return null;
  if (typeof l.imagem_url !== 'string' || !l.imagem_url.startsWith('https://')) return null;
  if (![opening.x, opening.y, opening.radius].every(Number.isFinite) || opening.radius <= 0) return null;
  return [l.codigo, { source: { uri: l.imagem_url }, opening }];
}

export function definirMoldurasRemotas(linhas: unknown): void {
  const entradas = Array.isArray(linhas) ? linhas.map(lerLinha).filter((e) => e !== null) : [];
  remotas = Object.fromEntries(entradas);
  for (const o of ouvintes) o();
}

export function molduraRemota(codigo: string | null | undefined): MolduraRemota | null {
  if (!codigo || !Object.prototype.hasOwnProperty.call(remotas, codigo)) return null;
  return remotas[codigo];
}

export function ouvirMoldurasRemotas(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Muda a cada leitura: é o retrato que o `useSyncExternalStore` compara. */
export const retratoDasMoldurasRemotas = () => remotas;
