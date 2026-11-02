import { TelaCarregamento } from "@/components/carregamento/TelaCarregamento";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";

type Props = {
  title?: string;
  message?: string;
  color?: string;
  /** O perfil sai de `palette.profile`; sem ele (ou sem paleta), a variante neutra do TrailUp. */
  palette?: ProfileShellPalette | null;
};

export function LoadingState({
  title = "Carregando",
  message = "Aguarde enquanto buscamos as informações.",
  color,
  palette,
}: Props) {
  return (
    <TelaCarregamento
      perfil={palette?.profile ?? null}
      titulo={title}
      mensagem={message}
      corDestaque={color}
    />
  );
}
