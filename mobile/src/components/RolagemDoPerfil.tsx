import { useMemo } from "react";
import { Platform } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { useRolagemTematica } from "@/hooks/useRolagemTematica";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Barras de rolagem da web na cor do perfil. Fica na raiz, e não nas abas, porque
 * os portões (termos de coleta, data de nascimento) e o login abrem fora delas; e
 * vale em qualquer largura, porque janela estreita no computador também mostra a
 * barra do sistema. Sem perfil ainda, a paleta neutra.
 */
export function RolagemDoPerfil() {
  const { usuario } = useUsuario();
  const cor = useMemo(() => getProfileShellPalette(perfilVisualDoAluno(usuario)).borderStrong, [usuario]);
  useRolagemTematica(Platform.OS === "web", cor);
  return null;
}
