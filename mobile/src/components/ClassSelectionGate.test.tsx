import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { findSelectedClass } from "@/utils/classSelection";

/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server") as { renderToString: (element: React.ReactElement) => string };
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
const classes = [
  { aluno_id: "aluno", classe_id: 32, resumo: { materia_nome: "Matemática", professor_nome: "Ana" }, topicos: [{ id: 125 }] },
  { aluno_id: "aluno", classe_id: 54, resumo: { materia_nome: "História", professor_nome: "Paulo" }, topicos: [{ id: 131 }] },
];
let selected: typeof classes[number] | null = null;
let availableClasses = classes;
let pathname = "/";
let loading = false;
let error: Error | null = null;
let retries = 0;
let childMounts = 0;
let logoutScope: string | null = null;
const buttons: { label: string; onPress: () => void }[] = [];

function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule("react-native", {
  View: Host, Text: Host, ScrollView: Host,
  StyleSheet: { create: (value: unknown) => value },
  ActivityIndicator: () => <span>loading</span>,
  Pressable: ({ children, accessibilityLabel, onPress }: { children: React.ReactNode; accessibilityLabel?: string; onPress: () => void }) => {
    buttons.push({ label: accessibilityLabel ?? "", onPress });
    return <button aria-label={accessibilityLabel}>{children}</button>;
  },
});
mockModule("react-native-safe-area-context", { SafeAreaView: Host });
mockModule("@expo/vector-icons", { MaterialCommunityIcons: () => null });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => ({}) });
mockModule("@/database/supabase", { supabase: { auth: { signOut: async ({ scope }: { scope: string }) => { logoutScope = scope; return { error: null }; } } } });
mockModule("expo-router", {
  usePathname: () => pathname,
  Redirect: ({ href }: { href: string }) => <span>redirect:{href}</span>,
});
mockModule("@/context/TrilhaContext", {
  useTrilha: () => ({
    classeAtual: selected, classes: availableClasses, carregando: loading, erro: error, perfil: "seeker",
    selecionarClasse: (id: number) => { selected = findSelectedClass(availableClasses, id, "aluno"); },
    reload: async () => { retries += 1; },
  }),
});
const { ClassSelectionGate } = require("./ClassSelectionGate") as typeof import("./ClassSelectionGate");
function StudyScreen() { childMounts += 1; return <span>área logada da turma {selected?.classe_id}</span>; }
function render() {
  buttons.length = 0;
  return renderToString(<ClassSelectionGate><StudyScreen /></ClassSelectionGate>);
}

test.beforeEach(() => {
  selected = null; availableClasses = classes; pathname = "/";
  loading = false; error = null; retries = 0; childMounts = 0; logoutScope = null;
});

test("antes da escolha não monta estudo e mostra as turmas com matéria e professor", () => {
  const html = render();
  assert.match(html, /Escolha sua turma/);
  assert.match(html, /Matemática/);
  assert.match(html, /História/);
  assert.match(html, /Paulo/);
  assert.equal(childMounts, 0);
  buttons.find((button) => button.label.includes("turma 54"))!.onPress();
  assert.equal(selected?.classe_id, 54);
  assert.match(render(), /área logada da turma/);
  assert.equal(childMounts, 1);
});

test("matrícula única também aguarda confirmação do aluno", () => {
  availableClasses = classes.slice(0, 1);
  assert.match(render(), /Escolha sua turma/);
  assert.equal(childMounts, 0);
  buttons.find((button) => button.label.includes("turma 32"))!.onPress();
  assert.equal(selected?.classe_id, 32);
});

test("carregamento não mostra vazio nem permite entrar prematuramente", () => {
  loading = true;
  const html = render();
  assert.match(html, /Buscando suas turmas/);
  assert.doesNotMatch(html, /ainda não está/);
  assert.equal(buttons.filter((button) => button.label.startsWith("Entrar em")).length, 0);
  assert.equal(childMounts, 0);
});

test("sem matrícula há orientação, atualização e saída da conta", () => {
  availableClasses = [];
  const html = render();
  assert.match(html, /Peça ao professor/);
  assert.match(html, /Atualizar turmas/);
  assert.match(html, /Sair da conta/);
  buttons[0].onPress();
  assert.equal(retries, 1);
  buttons[1].onPress();
  assert.equal(logoutScope, "local");
  assert.equal(childMounts, 0);
});

test("falha de rede permite tentar novamente e não exibe turmas antigas", () => {
  error = new Error("network");
  const html = render();
  assert.match(html, /Não foi possível carregar suas turmas/);
  assert.match(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Matemática/);
  buttons[0].onPress();
  assert.equal(retries, 1);
  assert.equal(childMounts, 0);
});

test("link direto aguarda escolha e retoma o tópico quando pertence à turma", () => {
  pathname = "/trilha/131";
  assert.match(render(), /Escolha sua turma/);
  assert.equal(childMounts, 0);
  buttons.find((button) => button.label.includes("turma 54"))!.onPress();
  assert.match(render(), /área logada da turma/);
  assert.equal(childMounts, 1);
});

test("escolher outra turma em um link direto retorna ao mapa sem montar o tópico antigo", () => {
  pathname = "/trilha/131";
  selected = classes[0];
  assert.match(render().replace(/<!-- -->/g, ""), /redirect:\/\(tabs\)/);
  assert.equal(childMounts, 0);
});

test("refresh do perfil não reabre a seleção nem desmonta a turma escolhida", () => {
  selected = classes[1];
  loading = true;
  assert.doesNotMatch(render(), /Escolha sua turma/);
  assert.equal(childMounts, 1);
});
