import assert from "node:assert/strict";
import test from "node:test";

import {
  agregarProgressoPersonalizado,
  conteudoIdDaChave,
  itemConcluido,
  naturezaDoItem,
  unificarContadores,
  type LinhaProgressoItem,
} from "./progressoPersonalizado";

const linha = (extra: Partial<LinhaProgressoItem> = {}): LinhaProgressoItem => ({
  topico_id: 1,
  item_key: "content:10",
  item_kind: "content",
  status: "em_andamento",
  percentual_concluido: 0,
  acertos_percentual: null,
  tempo_gasto_min: 0,
  ...extra,
});

// --- classificacao ---------------------------------------------------------

test("chave slide: e reconhecida como interacao de apresentacao", () => {
  // E o caso que fazia "Desafios resolvidos" ficar em 0 depois do deck inteiro.
  assert.equal(naturezaDoItem(linha({ item_key: "slide:quiz:3", item_kind: "content" })), "slide");
});

test("natureza sai do item_kind quando a chave nao diz", () => {
  assert.equal(naturezaDoItem(linha({ item_key: "x", item_kind: "cards" })), "cards");
  assert.equal(naturezaDoItem(linha({ item_key: "x", item_kind: "activity" })), "atividade");
});

test("chave serve de fallback quando item_kind vem vazio", () => {
  assert.equal(naturezaDoItem(linha({ item_key: "cards:5", item_kind: null })), "cards");
  assert.equal(naturezaDoItem(linha({ item_key: "content:5", item_kind: null })), "conteudo");
});

test("id do conteudo sai da chave", () => {
  assert.equal(conteudoIdDaChave("content:42"), 42);
  assert.equal(conteudoIdDaChave("slide:quiz:1"), null);
  assert.equal(conteudoIdDaChave("content:abc"), null);
  assert.equal(conteudoIdDaChave(null), null);
});

// --- conclusao -------------------------------------------------------------

test("abrir o material nao conta como concluido", () => {
  // Abrir cria a linha com 0%; tratar "tem linha" como feito inflaria tudo.
  assert.equal(itemConcluido(linha({ percentual_concluido: 0 })), false);
  assert.equal(itemConcluido(linha({ percentual_concluido: 40 })), false);
});

test("status textual e percentual cheio contam", () => {
  assert.equal(itemConcluido(linha({ status: "concluido" })), true);
  assert.equal(itemConcluido(linha({ percentual_concluido: 100 })), true);
});

// --- agregacao -------------------------------------------------------------

test("agrega por natureza e soma o tempo", () => {
  const resultado = agregarProgressoPersonalizado([
    linha({ item_key: "content:10", percentual_concluido: 100, tempo_gasto_min: 3 }),
    linha({ item_key: "cards:1", item_kind: "cards", status: "concluido", tempo_gasto_min: 1.5 }),
    linha({ item_key: "slide:quiz:1", percentual_concluido: 100, tempo_gasto_min: 2 }),
    linha({ item_key: "slide:quiz:2", percentual_concluido: 0, tempo_gasto_min: 0.5 }),
  ]);

  assert.equal(resultado.concluidosPorNatureza.slide, 1);
  assert.equal(resultado.totalPorNatureza.slide, 2);
  assert.equal(resultado.concluidosPorNatureza.cards, 1);
  assert.equal(resultado.tempoMin, 7);
  assert.deepEqual(resultado.conteudoIds, [10]);
});

test("mesma chave no mesmo topico nao conta duas vezes", () => {
  // O unique da tabela e por (aluno, personalizacao, item_key): a mesma chave
  // pode voltar em personalizacoes diferentes do mesmo topico.
  const resultado = agregarProgressoPersonalizado([
    linha({ item_key: "slide:quiz:1", percentual_concluido: 100 }),
    linha({ item_key: "slide:quiz:1", percentual_concluido: 100 }),
  ]);

  assert.equal(resultado.totalPorNatureza.slide, 1);
});

test("mesma chave em topicos diferentes conta as duas", () => {
  const resultado = agregarProgressoPersonalizado([
    linha({ topico_id: 1, item_key: "slide:quiz:1" }),
    linha({ topico_id: 2, item_key: "slide:quiz:1" }),
  ]);

  assert.equal(resultado.totalPorNatureza.slide, 2);
});

test("acertos nulo nao afunda a media", () => {
  // null e "nao avaliado"; zero e nota zero. Tratar igual puniria quem so leu.
  const resultado = agregarProgressoPersonalizado([
    linha({ acertos_percentual: null }),
    linha({ item_key: "content:11", acertos_percentual: 80 }),
  ]);

  assert.equal(resultado.acertosMedio, 80);
});

test("nota zero de verdade entra na media", () => {
  const resultado = agregarProgressoPersonalizado([
    linha({ item_key: "slide:q1", acertos_percentual: 0 }),
    linha({ item_key: "slide:q2", acertos_percentual: 100 }),
  ]);

  assert.equal(resultado.acertosMedio, 50);
});

test("sem nota nenhuma a media e null, nao zero", () => {
  assert.equal(agregarProgressoPersonalizado([linha()]).acertosMedio, null);
});

test("tempo negativo ou invalido nao subtrai", () => {
  const resultado = agregarProgressoPersonalizado([
    linha({ tempo_gasto_min: -5 }),
    linha({ item_key: "content:11", tempo_gasto_min: "x" as never }),
    linha({ item_key: "content:12", tempo_gasto_min: 4 }),
  ]);

  assert.equal(resultado.tempoMin, 4);
});

test("lista vazia devolve zeros sem quebrar", () => {
  const resultado = agregarProgressoPersonalizado(null);

  assert.equal(resultado.tempoMin, 0);
  assert.equal(resultado.acertosMedio, null);
  assert.deepEqual(resultado.conteudoIds, []);
});

test("linha sem item_key e ignorada", () => {
  assert.equal(agregarProgressoPersonalizado([linha({ item_key: "  " })]).totalPorNatureza.conteudo, 0);
});

// --- uniao dos dois livros-caixa -------------------------------------------

const academico = {
  conteudosConcluidos: 1,
  totalConteudos: 4,
  atividadesConcluidas: 0,
  totalAtividades: 12,
  tempoMin: 10,
  conteudoIds: [10, 11, 12, 13],
};

test("questoes da apresentacao entram nas atividades", () => {
  // Era a queixa direta: "Desafios resolvidos 0 / 12" apos responder o deck.
  const personalizado = agregarProgressoPersonalizado([
    linha({ item_key: "slide:quiz:1", percentual_concluido: 100 }),
    linha({ item_key: "slide:quiz:2", percentual_concluido: 100 }),
    linha({ item_key: "slide:quiz:3", percentual_concluido: 0 }),
  ]);

  const unificado = unificarContadores({ academico, personalizado });

  assert.equal(unificado.atividadesConcluidas, 2);
  assert.equal(unificado.totalAtividades, 15);
});

test("conteudo que o lado academico ja conhece nao e contado de novo", () => {
  // `content:10` existe nas duas tabelas: e o MESMO material, nao um arquivo a
  // mais. Somar dobraria o denominador.
  const personalizado = agregarProgressoPersonalizado([
    linha({ item_key: "content:10", percentual_concluido: 100 }),
  ]);

  const unificado = unificarContadores({ academico, personalizado });

  assert.equal(unificado.totalConteudos, 4);
  assert.equal(unificado.conteudosConcluidos, 1);
});

test("conteudo personalizado desconhecido do academico entra", () => {
  // Id negativo estavel: passo personalizado que nao existe em conteudo_aluno.
  const personalizado = agregarProgressoPersonalizado([
    linha({ item_key: "content:-8172634", percentual_concluido: 100 }),
  ]);

  const unificado = unificarContadores({ academico, personalizado });

  assert.equal(unificado.totalConteudos, 5);
  assert.equal(unificado.conteudosConcluidos, 2);
});

test("cards entram como material proprio", () => {
  const personalizado = agregarProgressoPersonalizado([
    linha({ item_key: "cards:1", item_kind: "cards", status: "concluido" }),
  ]);

  const unificado = unificarContadores({ academico, personalizado });

  assert.equal(unificado.totalConteudos, 5);
  assert.equal(unificado.conteudosConcluidos, 2);
});

test("tempo usa o maior dos dois lados, nao a soma", () => {
  // O tempo do topico ja inclui o dos itens (o rastreio grava topico em todo
  // flush, inclusive nos blocos personalizados). Somar contaria duas vezes.
  const personalizado = agregarProgressoPersonalizado([linha({ tempo_gasto_min: 7.5 })]);

  assert.equal(unificarContadores({ academico, personalizado }).tempoMin, 10);
});

test("tempo do lado personalizado sustenta o total quando o academico falha", () => {
  // Se a escrita em topico_aluno falha (RLS, rede), o tempo academico fica em
  // zero mesmo havendo estudo -- era o "tempo nao contabilizado".
  const personalizado = agregarProgressoPersonalizado([linha({ tempo_gasto_min: 12 })]);

  const unificado = unificarContadores({
    academico: { ...academico, tempoMin: 0 },
    personalizado,
  });

  assert.equal(unificado.tempoMin, 12);
});

test("sem nada personalizado os numeros academicos passam intactos", () => {
  const unificado = unificarContadores({
    academico,
    personalizado: agregarProgressoPersonalizado([]),
  });

  assert.equal(unificado.totalConteudos, 4);
  assert.equal(unificado.conteudosConcluidos, 1);
  assert.equal(unificado.totalAtividades, 12);
  assert.equal(unificado.atividadesConcluidas, 0);
  assert.equal(unificado.tempoMin, 10);
});

test("concluidos nunca passa do total", () => {
  const personalizado = agregarProgressoPersonalizado([
    linha({ item_key: "slide:q1", percentual_concluido: 100 }),
  ]);
  const unificado = unificarContadores({ academico, personalizado });

  assert.ok(unificado.atividadesConcluidas <= unificado.totalAtividades);
  assert.ok(unificado.conteudosConcluidos <= unificado.totalConteudos);
});
