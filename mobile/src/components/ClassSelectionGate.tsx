import React, { useEffect } from "react";
import { Redirect, usePathname } from "expo-router";
import { usePortoes } from "@/context/PortoesContext";
import { useTrilha } from "@/context/TrilhaContext";
import { EscolhaTurmaDesktop } from "@/components/web/EscolhaTurmaDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import SelecionarTurmaScreen from "@/screens/SelecionarTurmaScreen";
import { isTopicOutsideSelectedClass } from "@/utils/classSelection";

/** Não monta telas de estudo, timers ou o tour antes da escolha da turma. */
export function ClassSelectionGate({ children }: { children: React.ReactNode }) {
  const { classeAtual, classes, carregando, erro, perfil, selecionarClasse, reload } = useTrilha();
  const pathname = usePathname();
  const desktop = useDesktopWeb();

  // Os portões são por TURMA, e quem sabe a turma escolhida é o `TrilhaContext` — que mora
  // ABAIXO do `PortoesProvider` (ele está no layout raiz, para a cerimônia existir em qualquer
  // tela). Este é o ponto onde os dois se encontram: o portão fica no provider de cima, a
  // turma vem do contexto de baixo, e nenhum dos dois precisa se mudar de lugar.
  const { definirTurma } = usePortoes();
  const classeId = classeAtual?.classe_id ?? null;
  useEffect(() => {
    definirTurma(classeId);
  }, [classeId, definirTurma]);

  if (!classeAtual) {
    // Na web em tela larga (#346, protótipo v4) a escolha aparece dentro da moldura, em cartões.
    if (desktop) {
      return <EscolhaTurmaDesktop classes={classes} carregando={carregando} erro={erro} perfil={perfil} onSelect={selecionarClasse} onRetry={reload} />;
    }
    return <SelecionarTurmaScreen classes={classes} carregando={carregando} erro={erro} perfil={perfil} onSelect={selecionarClasse} onRetry={reload} />;
  }

  // Preserva links de tópicos da turma escolhida. Se o aluno escolheu outra,
  // vai ao mapa dessa turma sem abrir o tópico antigo nem registrar estudo.
  if (isTopicOutsideSelectedClass(pathname, classeAtual)) {
    return <Redirect href="/(tabs)" />;
  }

  return <>{children}</>;
}
