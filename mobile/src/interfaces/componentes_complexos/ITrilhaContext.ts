import { GraphLayout, NodeId, NodeItem } from '@/hooks/use-grafo-trilha'
import { Classe } from '@/models/Classe'
import { ModoOperacao } from '@/models/ModoOperacao'
import { MapWorldTheme } from '@/utils/classMapTheme'

export interface ITrilhaContextData {
  carregando: boolean
  erro: Error | null

  classes: Classe[]
  classeAtual: Classe | null
  selecionarClasse: (index: number) => void

  // ainda existe, mas não decide mais o visual
  modoOperacao: ModoOperacao
  setModoOperacao: (m: ModoOperacao) => void

  // quem define a trilha + visual
  perfil: string
  setPerfil: (p: string) => void

  // grafo renderizável
  grafo: GraphLayout

  // dados crus (ajuda os componentes)
  nodes?: NodeItem[]
  unlockedIds?: NodeId[]
  visual: 'mapa' | 'arvore' | 'lista'
  mapTheme?: MapWorldTheme | null

  // utilitário
  reload: () => Promise<void> | void
}
