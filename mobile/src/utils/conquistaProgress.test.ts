import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularProgressoConquista,
  ConquistaProgressMetrics,
} from "./conquistaProgress";

const metrics: ConquistaProgressMetrics = {
  atividadesConcluidas: 5,
  atividadesPerfeitas: 1,
  atividadesAcimaDe90: 2,
  atividadesRapidas2Min: 1,
  atividadesRapidas3Min: 3,
  atividadesRevisadas: 2,
  topicosVisitados: 4,
  topicosConcluidos: 2,
  totalTopicos: 8,
  diasSeguidos: 3,
  minutosAtivos: 150,
};

test("calcula conquista comum usando a metrica correspondente", () => {
  assert.equal(calcularProgressoConquista("simples", { minimo: 10 }, metrics), 50);
  assert.equal(calcularProgressoConquista("dias", { dias_seguidos: 3 }, metrics), 100);
});

test("calcula conquista exclusiva do perfil", () => {
  assert.equal(
    calcularProgressoConquista("brainhex_seeker_cartografo", { visitados: 5 }, metrics),
    80,
  );
  assert.equal(
    calcularProgressoConquista("brainhex_conqueror_dominio", { minimo: 5 }, metrics),
    40,
  );
});

test("conquista de trilha completa usa os topicos disponiveis", () => {
  assert.equal(
    calcularProgressoConquista("brainhex_achiever_mestre", { percentual: 100 }, metrics),
    25,
  );
});

test("progresso nunca ultrapassa cem", () => {
  assert.equal(calcularProgressoConquista("tempo_total", { minutos: 10 }, metrics), 100);
});
