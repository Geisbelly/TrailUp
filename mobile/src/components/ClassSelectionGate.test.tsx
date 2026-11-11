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
let turmasTentadas: number[] = [];
let childMounts = 0;
let logoutScope: string | null = null;
const buttons: { label: string; onPress: () => void }[] = [];

function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule("react-native", {
  View: Host, Text: Host, ScrollView: Host,
  // A tela de escolha mostra a arte do perfil (getProfileArtwork); a imagem não importa aqui.
  Image: () => null,
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
// A versão de tela larga (#346) fica fora deste teste: o portão aqui é o do celular.
mockModule("@/hooks/useDesktopWeb", { useDesktopWeb: () => false });
mockModule("@/components/web/EscolhaTurmaDesktop", { EscolhaTurmaDesktop: () => null });
// O esqueleto anima (Animated); aqui basta saber que ele aparece no lugar da lista.
mockModule("@/components/carregamento/EsqueletoDasTurmas", { EsqueletoDasTurmas: () => <span>esqueleto das turmas</span> });
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
    recarregarTurma: async (id: number) => { turmasTentadas.push(id); },
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
  loading = false; error = null; retries = 0; childMounts = 0; logoutScope = null; turmasTentadas = [];
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

test("o nome do professor é um botão próprio, separado do de entrar na turma", () => {
  availableClasses = [
    ...classes,
    { aluno_id: "aluno", classe_id: 60, resumo: { materia_nome: null, professor_nome: null, classe_nome: "Reforço" } as never, topicos: [{ id: 140 }] },
  ];
  const html = render();
  const entrar = buttons.filter((button) => button.label.startsWith("Entrar em"));
  const perfil = buttons.filter((button) => button.label.startsWith("Ver perfil de"));
  assert.equal(entrar.length, 3);
  assert.deepEqual(perfil.map((button) => button.label), ["Ver perfil de Ana, professor da turma", "Ver perfil de Paulo, professor da turma"]);
  assert.match(html, /GERAL/);
  assert.match(html, /Reforço/);
  assert.match(entrar[2].label, /^Entrar em Reforço, matéria Geral, turma 60/);
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
  assert.match(html, /esqueleto das turmas/);
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

test("turma cujo detalhe falhou tem aviso e nova tentativa só dela, e as outras seguem", () => {
  availableClasses = [classes[0], { ...classes[1], topicos: [], detalheErro: new Error("57014") }] as typeof classes;
  const html = render();
  assert.doesNotMatch(html, /Não foi possível carregar suas turmas/);
  assert.match(html, /Matemática/);
  assert.match(html, /História/);
  assert.match(html, /Não conseguimos abrir esta turma agora/);
  assert.equal(buttons.some((button) => button.label.startsWith("Entrar em História")), false);
  buttons.find((button) => button.label === "Tentar de novo a turma 54")!.onPress();
  assert.deepEqual(turmasTentadas, [54]);
  assert.equal(retries, 0);
  buttons.find((button) => button.label.includes("turma 32"))!.onPress();
  assert.equal(selected?.classe_id, 32);
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
