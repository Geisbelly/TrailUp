import React from "react";
import { Redirect, usePathname } from "expo-router";
import { useTrilha } from "@/context/TrilhaContext";
import SelecionarTurmaScreen from "@/screens/SelecionarTurmaScreen";
import { isTopicOutsideSelectedClass } from "@/utils/classSelection";

/** Não monta telas de estudo, timers ou o tour antes da escolha da turma. */
export function ClassSelectionGate({ children }: { children: React.ReactNode }) {
  const { classeAtual, classes, carregando, erro, perfil, selecionarClasse, reload } = useTrilha();
  const pathname = usePathname();

  if (!classeAtual) {
    return <SelecionarTurmaScreen classes={classes} carregando={carregando} erro={erro} perfil={perfil} onSelect={selecionarClasse} onRetry={reload} />;
  }

  // Preserva links de tópicos da turma escolhida. Se o aluno escolheu outra,
  // vai ao mapa dessa turma sem abrir o tópico antigo nem registrar estudo.
  if (isTopicOutsideSelectedClass(pathname, classeAtual)) {
    return <Redirect href="/(tabs)" />;
  }

  return <>{children}</>;
}
