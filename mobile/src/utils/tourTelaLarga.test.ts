import assert from "node:assert/strict";
import test from "node:test";

import { buildFirstAccessTourSteps } from "./firstAccessTour";
import { adaptarTourParaTelaLarga } from "./tourTelaLarga";

const BRAINHEX_PROFILES = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];
const passo = (steps: ReturnType<typeof buildFirstAccessTourSteps>, id: string) => steps.find((s) => s.id === id)!;

test("na tela larga, nenhum perfil fala em quatro áreas nem na base da tela", () => {
  for (const perfil of BRAINHEX_PROFILES) {
    const nav = passo(adaptarTourParaTelaLarga(buildFirstAccessTourSteps(perfil), perfil), "navigation");
    assert.equal(nav.title, "Suas áreas");
    assert.doesNotMatch(nav.description, /quatro|base da tela/i, perfil);
    assert.match(nav.description, /Trilha, Notificações, Social, Loja, Ranking e Perfil/);
  }
});

test("Conqueror usa a fala do protótipo", () => {
  const nav = passo(adaptarTourParaTelaLarga(buildFirstAccessTourSteps("conqueror"), "conqueror"), "navigation");
  assert.ok(nav.description.startsWith("Antes da campanha, reconheça o terreno: estes são seus setores de comando."));
});

test("notificações: abrir em vez de arrastar; câmera: permissão do navegador", () => {
  const steps = adaptarTourParaTelaLarga(buildFirstAccessTourSteps("mastermind"), "mastermind");
  assert.match(passo(steps, "notifications").description, /Abra um aviso para ler, marcar como não lido ou excluir\.$/);
  assert.doesNotMatch(passo(steps, "notifications").description, /Arraste/);
  assert.match(passo(steps, "camera-consent").description, /permissão do navegador/);
});

test("os outros passos e a ordem não mudam", () => {
  const app = buildFirstAccessTourSteps("seeker");
  const web = adaptarTourParaTelaLarga(app, "seeker");
  assert.deepEqual(web.map((s) => s.id), app.map((s) => s.id));
  assert.deepEqual(passo(web, "finish"), passo(app, "finish"));
});
