import { useEffect, useState } from "react";
import type { DiversidadeDaTurma } from "./diversidade";
import { lerDiversidadeDaTurma } from "./diversidadeApi";

/**
 * A diversidade de perfis da turma. Falha de leitura (função ainda não aplicada no banco, rede)
 * devolve null e a tela fica como era antes dela: é informação a mais, nunca um bloqueio.
 */
export function useDiversidadeDaTurma(classeId: number | null | undefined): DiversidadeDaTurma | null {
  const [diversidade, setDiversidade] = useState<DiversidadeDaTurma | null>(null);

  useEffect(() => {
    setDiversidade(null);
    if (!classeId || !Number.isFinite(classeId) || classeId <= 0) return;
    let vivo = true;
    lerDiversidadeDaTurma(classeId)
      .then((resultado) => {
        if (vivo) setDiversidade(resultado);
      })
      .catch(() => {
        if (vivo) setDiversidade(null);
      });
    return () => {
      vivo = false;
    };
  }, [classeId]);

  return diversidade;
}
