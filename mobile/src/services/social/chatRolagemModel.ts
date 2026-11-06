/** Folga para contar como "no fim": o último balão pode estar a poucos pixels da borda. */
const FOLGA_DO_FIM = 80;

export type MedidasDaRolagem = { topo: number; alturaDoConteudo: number; alturaDaJanela: number };

/** Quem subiu para reler a conversa não pode ser puxado de volta a cada 5 s de atualização. */
export function pertoDoFim({ topo, alturaDoConteudo, alturaDaJanela }: MedidasDaRolagem): boolean {
  return alturaDoConteudo - alturaDaJanela - topo <= FOLGA_DO_FIM;
}
