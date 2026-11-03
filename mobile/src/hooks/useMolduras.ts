import { useCallback, useEffect, useState } from "react";

import { useUsuario } from "@/context/SessaoContext";
import { useAviso } from "@/hooks/useAviso";
import {
  carregarMolduraEquipada,
  molduraEquipadaEmCache,
  ouvirMolduraEquipada,
  registrarAcaoDeMoldura,
  type AcaoDeMoldura,
} from "@/services/molduras";

/** A moldura que o aluno logado equipou, ou `null` (a do perfil). Atualiza quando ele troca. */
export function useMolduraEquipada(): string | null {
  const { usuario } = useUsuario();
  const alunoId = usuario?.id ?? null;
  const [codigo, setCodigo] = useState<string | null>(() => (alunoId ? molduraEquipadaEmCache(alunoId) ?? null : null));

  useEffect(() => {
    const parar = ouvirMolduraEquipada(setCodigo);
    if (alunoId && molduraEquipadaEmCache(alunoId) === undefined) void carregarMolduraEquipada(alunoId);
    else setCodigo(alunoId ? molduraEquipadaEmCache(alunoId) ?? null : null);
    return parar;
  }, [alunoId]);

  return codigo;
}

/**
 * Registra uma ação que pode liberar moldura rara e, se liberou, avisa. Chame DEPOIS que a ação
 * deu certo (o relatório saiu, o lembrete foi salvo): a moldura é pelo que o aluno fez.
 */
export function useAcaoDeMoldura() {
  const { avisar } = useAviso();
  return useCallback(
    (acao: AcaoDeMoldura) => {
      void registrarAcaoDeMoldura(acao).then((nome) => {
        if (nome) avisar("Moldura nova!", `Você ganhou a moldura ${nome}. Equipe em Perfil › Molduras.`, "success");
      });
    },
    [avisar],
  );
}
