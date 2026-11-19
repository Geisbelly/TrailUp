import { useCallback, useSyncExternalStore } from "react";

import { assinarDesafiosResolvidos, desafiosResolvidosDe } from "@/services/missoes/desafiosResolvidos";

/** Os desafios que o aluno resolveu nesta sessão (`desafiosResolvidos`), e o render ao marcar um novo. */
export function useDesafiosResolvidos(alunoId: string | null | undefined): ReadonlySet<number> {
  const ler = useCallback(() => desafiosResolvidosDe(alunoId), [alunoId]);
  return useSyncExternalStore(assinarDesafiosResolvidos, ler, ler);
}
