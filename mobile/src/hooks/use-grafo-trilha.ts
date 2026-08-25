// src/hooks/use-grafo-trilha.ts
import { useMemo } from 'react'

export type NodeId = string

export type NodeItem = {
  id: NodeId
  titulo: string
  next?: NodeId[]
  locked: boolean            // <- vindo do DB/edge
  completed: boolean         // <- vindo do DB/edge
  sequence: number
  x?: number
  y?: number
  tipo?: string
  icon?: string
  resumo?: string | null
  badgeLabel?: string | null
  badgeTone?: "focus" | "recommended" | "default" | null
  heroFormat?: string | null
  recommended?: boolean
}

export type NodeState = NodeItem & {
  locked: boolean            // <- estado final para render (após regras)
  completed: boolean
}

export type GraphLayout = {
  levels: Array<Array<NodeState>>
  positions: Map<NodeId, { x: number; y: number }>
  edges: Array<{ from: NodeId; to: NodeId }>
  roots: NodeState[]
  height: number
  width: number
  nodes: NodeState[]         // flatten com estado (útil nos renders)
}

type Options = {
  width?: number
  levelGap?: number
  nodeGap?: number
  nodeWidth?: number
  nodeHeight?: number
  /**
   * Ids explicitamente desbloqueados (fallback, regras adicionais, etc.)
   * OBS: NÃO sobrescreve locks "duros" vindos do DB (locked=true),
   * apenas libera quando o dado não vem explicitamente travado.
   */
  unlockedIds?: NodeId[]
}

/**
 * Layout simples em níveis + centralização + propagação conservadora de unlock.
 * - NÃO destrava raízes automaticamente.
 * - Respeita `locked` do DB: se locked=true, mantém bloqueado.
 * - `completed=true` é tratado como acessível.
 * - `unlockedIds` funciona como override amigável (não contra lock duro).
 */
export function useGraphLayout(data: NodeItem[], opts: Options = {}): GraphLayout {
  const safeData = useMemo<NodeItem[]>(
    () =>
      Array.isArray(data)
        ? data.filter((n): n is NodeItem => !!n && n.id != null)
        : [],
    [data]
  )

  const {
    width = 1000,
    levelGap = 160,
    nodeGap = 24,
    nodeWidth = 170,
    nodeHeight = 56,
    unlockedIds = [],
  } = opts
  


  // Map auxiliar, caso precise buscar nó por id
  const map = useMemo(() => {
    const m = new Map<NodeId, NodeItem>()
    safeData.forEach(n => m.set(n.id, n))
    return m
  }, [safeData])

  // Construção de níveis (BFS por "next"), só para posicionamento/topologia
  const { levels } = useMemo(() => {
    if (!safeData.length) return { levels: [] as NodeItem[][], roots: [] as NodeItem[] }

    // indegree por next: indegree(to)++
    const indeg = new Map<NodeId, number>()
    safeData.forEach(n => indeg.set(n.id, 0))
    safeData.forEach(n => (n.next || []).forEach(t => indeg.set(t, (indeg.get(t) || 0) + 1)))

    const roots = safeData.filter(n => (indeg.get(n.id) || 0) === 0)
    const result: NodeItem[][] = []
    const visited = new Set<NodeId>()
    let frontier: NodeItem[] = roots.length ? roots : [safeData[0]]

    while (frontier.length) {
      result.push(frontier)
      const nextFrontier: NodeItem[] = []
      for (const node of frontier) {
        visited.add(node.id)
        for (const nid of node.next || []) {
          if (!visited.has(nid) && !nextFrontier.find(n => n.id === nid)) {
            const child = map.get(nid)
            if (child) nextFrontier.push(child)
          }
        }
      }
      frontier = nextFrontier
      if (result.length > safeData.length) break
    }

    const reached = new Set(result.flat().map(n => n.id))
    const leftover = safeData.filter(n => !reached.has(n.id))
    if (leftover.length) result.push(leftover)

    return { levels: result, roots }
  }, [safeData, map])

  // Posicionamento básico por nível (centralizado horizontalmente)
  const positions = useMemo(() => {
    const pos = new Map<NodeId, { x: number; y: number }>()
    const padding = 40
    levels.forEach((levelNodes, li) => {
      const y = padding + li * levelGap
      const count = levelNodes.length

      // Espaçamento adaptativo por nível para caber na largura disponível
      const avail = Math.max(1, width - padding * 2)
      const idealStep = nodeWidth + nodeGap
      let step: number
      if (count <= 1) {
        step = 0
      } else {
        const candidate = (avail - nodeWidth) / (count - 1)
        // limite mínimo 60% da largura do nó para reduzir sobreposição perceptível
        const minStep = nodeWidth * 0.6
        step = Math.min(idealStep, Math.max(minStep, candidate))
      }

      const total = count === 1 ? nodeWidth : nodeWidth + (count - 1) * step
      const startX = padding + Math.max(0, (avail - total) / 2)

      levelNodes.forEach((n, idx) => {
        const x = n.x ?? (startX + idx * step + nodeWidth / 2)
        const yFinal = n.y ?? (y + nodeHeight / 2)
        pos.set(n.id, { x, y: yFinal })
      })
    })
    return pos
  }, [levels, width, levelGap, nodeGap, nodeWidth, nodeHeight])

  // Arestas simples (para render)
  const edges = useMemo(() => {
    const arr: Array<{ from: NodeId; to: NodeId }> = []
    safeData.forEach(n => (n.next || []).forEach(t => arr.push({ from: n.id, to: t })))
    return arr
  }, [safeData])

  // *** CORREÇÃO: cálculo de locked/unlocked respeitando DB ***
  const levelsWithState = useMemo(() => {
    // Política: respeita flags vindas do DB (locked=false libera; locked=true trava, a menos que completed)
    // Depois aplica regra de pais (AGORA: ALL pais concluídos) e overrides (unlockedIds)
    const unlockPolicy: 'all' | 'any' = 'all'
    const parentMap = new Map<NodeId, NodeItem[]>()
    safeData.forEach(n => parentMap.set(n.id, []))
    safeData.forEach(n => (n.next || []).forEach(to => {
      parentMap.get(to)?.push(n)
    }))

    const unlockedSet = new Set(unlockedIds)

    const isAccessible = (node: NodeItem) => {
      if (node.completed) return true
      if (unlockedSet.has(node.id)) return true
      if (node.locked === false) return true
      if (node.locked === true) return false
      const parents = parentMap.get(node.id) || []
      if (parents.length === 0) return true
      if (unlockPolicy === 'all') return parents.every(p => !!p.completed)
      return parents.some(p => !!p.completed)
  }

    return levels.map(level =>
      level.map<NodeState>(node => ({
        ...node,
        locked: !isAccessible(node),
      }))
    )
  }, [levels, safeData, unlockedIds])

  const flatNodes: NodeState[] = levelsWithState.flat()
  const height = Math.max(600, levels.length * levelGap + 140)

  return useMemo(
    () => ({
      levels: levelsWithState,
      positions,
      edges,
      roots: levelsWithState[0] ?? [],
      height,
      width,
      nodes: flatNodes,
    }),
    [levelsWithState, positions, edges, height, width, flatNodes]
  )
}
