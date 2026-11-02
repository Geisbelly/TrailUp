/**
 * Loading.tsx — abertura do app (sessão sendo hidratada, login em andamento).
 *
 * O visual é o da TelaCarregamento: começa na variante neutra do TrailUp (mesmo fundo
 * do splash nativo) e, quando o perfil BrainHex do aluno chega, a própria tela faz a
 * transição para a variante do perfil (instantânea com "Reduzir movimento").
 */

import { TelaCarregamento } from "@/components/carregamento/TelaCarregamento";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { useUsuario } from "@/context/SessaoContext";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { TRANSICAO_MS } from "@/utils/telaCarregamento";
import React, { useEffect, useState } from "react";

interface LoadingScreenProps {
  forceShow?: boolean;
}

const TITULO = "Preparando sua sessão";
const MENSAGEM_NEUTRA = "Carregando seu ambiente de estudo.";

const LoadingScreen = ({ forceShow = false }: LoadingScreenProps) => {
  const { usuario, autenticado } = useUsuario();
  const [canHide, setCanHide] = useState(false);

  const activeProfile = autenticado
    ? normalizeBrainHexProfile(perfilVisualDoAluno(usuario))
    : null;

  // Segurança: garante que o loading sempre fecha mesmo em caso de falha
  useEffect(() => {
    const t = setTimeout(() => setCanHide(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Perfil na tela: deixa a transição terminar e o aluno ver o símbolo antes de liberar.
  useEffect(() => {
    if ((!activeProfile && !usuario) || canHide) return;
    const t = setTimeout(() => setCanHide(true), TRANSICAO_MS + 800);
    return () => clearTimeout(t);
  }, [activeProfile, usuario, canHide]);

  if (!forceShow && canHide) return null;

  return (
    <TelaCarregamento
      perfil={activeProfile}
      titulo={TITULO}
      mensagem={MENSAGEM_NEUTRA}
      sobreposta
    />
  );
};

export default LoadingScreen;
