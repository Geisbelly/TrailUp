import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server") as { renderToString: (element: React.ReactElement) => string };

// Escolha de turma na web larga: antes da escolha só a escolha responde. Sem barra
// lateral (os itens dela não abriam nada), a barra superior só com a identidade e o
// "Sair da conta", e o carregamento em esqueleto no lugar do indicador girando.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};

function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule("react-native", {
  View: Host, Text: Host, ScrollView: Host,
  Image: () => null,
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
  ActivityIndicator: () => <span>girando</span>,
  Pressable: ({ children, accessibilityLabel }: { children: React.ReactNode; accessibilityLabel?: string }) => (
    <button aria-label={accessibilityLabel}>{typeof children === "function" ? null : children}</button>
  ),
});
mockModule("@expo/vector-icons", { MaterialCommunityIcons: () => null });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => ({}) });
mockModule("@/components/web/fonteCinzel", { FONTE_TITULO_TRILHA: "cinzel", useFonteCinzel: () => undefined });
mockModule("@/constants/designAssets", { getProfileArtwork: () => null });
mockModule("@/constants/profileImages", { getGuardianFaceImage: () => null });
mockModule("@/context/SessaoContext", { useUsuario: () => ({ usuario: { nome: "Bia", foto_url: null } }) });
mockModule("@/hooks/useFonteDeImagem", { useUrlDeImagem: () => null });
mockModule("@/database/supabase", { supabase: { auth: { signOut: async () => ({ error: null }) } } });
mockModule("@/components/social/ProfessorDaTurma", { ProfessorDaTurma: ({ professor }: { professor: string }) => <span>Prof. {professor}</span> });
mockModule("@/components/social/ProfessorProfileModal", { ProfessorProfileModal: () => null });
mockModule("@/components/carregamento/EsqueletoDasTurmas", {
  EsqueletoDasTurmas: ({ variante }: { variante: string }) => <span>esqueleto:{variante}</span>,
});
// Se a lateral voltar a ser montada, o marcador aparece no HTML.
mockModule("@/components/web/DesktopSidebar", { DesktopSidebar: () => <nav>barra lateral</nav> });
const barras: { antesDaTurma?: unknown }[] = [];
mockModule("@/components/web/DesktopTopBar", {
  DesktopTopBar: (props: { antesDaTurma?: unknown }) => {
    barras.push(props);
    return <header>{props.antesDaTurma ? "Sair da conta" : "Bag e Perfil"}</header>;
  },
});

const { EscolhaTurmaDesktop } = require("./EscolhaTurmaDesktop") as typeof import("./EscolhaTurmaDesktop");

const turma = {
  aluno_id: "aluno",
  classe_id: 32,
  resumo: { materia_nome: "Matemática", professor_nome: "Ana" },
  topicos: [],
};

function desenhar(estado: { carregando?: boolean; classes?: unknown[] } = {}) {
  barras.length = 0;
  return renderToString(
    <EscolhaTurmaDesktop
      classes={(estado.classes ?? [turma]) as never}
      carregando={estado.carregando ?? false}
      erro={null}
      perfil="seeker"
      onSelect={() => undefined}
      onRetry={async () => undefined}
      onRetryTurma={async () => undefined}
    />,
  );
}

test("com turmas: só os cartões, sem barra lateral, e a barra de cima só com o sair", () => {
  const html = desenhar();
  assert.match(html, /Escolha sua turma/);
  assert.match(html, /Matemática/);
  assert.match(html, /Entrar em/);
  assert.doesNotMatch(html, /barra lateral/);
  assert.match(html, /Sair da conta/);
  assert.doesNotMatch(html, /Bag e Perfil/);
  assert.ok(barras[0]?.antesDaTurma, "a barra superior vem no modo antes da turma");
});

test("carregando: esqueleto em grade no lugar do indicador, e nenhum cartão de entrar", () => {
  const html = desenhar({ carregando: true });
  assert.match(html, /esqueleto:(<!-- -->)?grade/);
  assert.doesNotMatch(html, /girando/);
  assert.doesNotMatch(html, /Entrar em/);
  assert.doesNotMatch(html, /barra lateral/);
});

test("sem matrícula: um sair só, o da barra de cima", () => {
  const html = desenhar({ classes: [] });
  assert.match(html, /ainda não está em uma turma/);
  assert.equal(html.match(/Sair da conta/g)?.length, 1);
});
