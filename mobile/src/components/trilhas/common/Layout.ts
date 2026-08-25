import type { GraphLayout } from '@/hooks/use-grafo-trilha';

export function contentBounds(layout: GraphLayout){
  const xs:number[] = [], ys:number[] = []
  layout.positions.forEach(p=>{ xs.push(p.x); ys.push(p.y) })
  if (!xs.length) return { minX:0, minY:0, maxX:1, maxY:1 }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}
