import assert from "node:assert/strict";
import test from "node:test";

import type { SugestaoMaterial } from "@/utils/materialSuggestion";

// A sugestão de material (ordem aconselhada por aluno × tópico) agora mexe no
// percurso personalizado. O que este arquivo trava:
//  - a identidade de cada passo (item_key e id do conteúdo) é a mesma com e sem
//    sugestão — progresso, manifesto, checkpoint e telemetria dependem dela;
//  - a sugestão só troca a ordem dentro do mesmo conteúdo;
//  - sem sugestão, tudo igual ao que era.

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: {} },
};

const {
  aggregatePersonalizedTopicPayloads,
  normalizePersonalizedTopicPayload,
} = require("@/utils/personalization") as typeof import("@/utils/personalization");
const { buildPersonalizedFlow } = require("./usePersonalizedFlow") as typeof import("./usePersonalizedFlow");
const { buildStableNegativeId } = require("@/utils/trilhaBlocks") as typeof import("@/utils/trilhaBlocks");
const { Topico } = require("@/models/Topico") as typeof import("@/models/Topico");
const {
  avancarSugestaoCongelada,
  mesclarSugestoes,
  sugestoesPorTopico,
} = require("@/utils/materialSuggestion") as typeof import("@/utils/materialSuggestion");


const TOPICO = 121;

function registro(id: number, conteudoId: number) {
  return normalizePersonalizedTopicPayload({
    record: {
      id,
      conteudo_id: conteudoId,
      ciclo_id: `ciclo-${id}`,
      plano: {},
      materiais: {
        markdown: { payload: { markdown: `# Aula ${conteudoId}` } },
        audio: { arquivo_url: `https://cdn.exemplo.dev/${id}/a.mp3` },
        apresentacao: { arquivo_url: `https://cdn.exemplo.dev/${id}/deck.html` },
        cards: { payload: [{ frente: "Card", verso: "Verso" }] },
        quiz: {
          payload: {
            questoes: [{ enunciado: "Q?", alternativas: ["A", "B"], resposta_correta: "A" }],
          },
        },
      },
    },
    classeId: 32,
    topicoId: TOPICO,
    fallbackBlocks: [],
    fallbackActivities: [],
    source: "remote",
  } as never);
}

// Dois conteúdos do professor, cada um com seu registro de conteudo_personalizado.
const payload = aggregatePersonalizedTopicPayloads([registro(11, 125), registro(12, 126)])!;

function sugestao(formatos: string[], extra: Partial<SugestaoMaterial> = {}): SugestaoMaterial {
  return {
    formato_inicial: formatos[0] ?? null,
    ordem: formatos.map((formato, indice) => ({ formato, posicao: indice + 1 })),
    versao: 1,
    origem: "inicial",
    ...extra,
  };
}

const fluxo = (s?: SugestaoMaterial | null) =>
  buildPersonalizedFlow({ personalizedTopic: payload, topicoId: TOPICO, sugestao: s });

const resumoDosBlocos = (resultado: ReturnType<typeof fluxo>) =>
  resultado.blocks.map((block) =>
    block.kind === "conteudo"
      ? `${(block.conteudo.metadata as any).personalizacao_id}:${block.conteudo.tipo}`
      : `${(block.atividade as any).personalizationKey.split(":")[3]}:atividade`
  );

// --- invariante central ---------------------------------------------------

test("com e sem sugestão, cada passo tem o MESMO item_key e o MESMO id; só a ordem muda", () => {
  const semSugestao = fluxo(null);
  const comSugestao = fluxo(sugestao(["audio", "cards", "markdown", "apresentacao"]));

  const identidade = (resultado: ReturnType<typeof fluxo>) =>
    new Map(
      resultado.conteudos.map((conteudo) => [conteudo.personalizationKey, Number(conteudo.id)])
    );

  assert.deepEqual(identidade(comSugestao), identidade(semSugestao));
  assert.equal(comSugestao.conteudos.length, semSugestao.conteudos.length);
  assert.notDeepEqual(
    comSugestao.conteudos.map((conteudo) => conteudo.id),
    semSugestao.conteudos.map((conteudo) => conteudo.id),
    "a sugestão tinha de mudar a ordem"
  );

  // O id continua derivado do índice CANÔNICO (posição em `steps`), não da nova posição.
  const passosCanonicos = [...payload.steps].sort((a, b) => a.ordem - b.ordem);
  comSugestao.conteudos.forEach((conteudo) => {
    const indice = passosCanonicos.findIndex((step) => step.item_key === conteudo.personalizationKey);
    assert.ok(indice >= 0);
    assert.equal(
      conteudo.id,
      buildStableNegativeId(`topico:${TOPICO}:content:${conteudo.personalizationKey}:${indice}`)
    );
    assert.equal(conteudo.ordem, 10_000 + indice);
  });

  // Atividades personalizadas: mesmo id, e o objeto inteiro é o mesmo.
  assert.deepEqual(comSugestao.atividades, semSugestao.atividades);
});

// Cópia literal do `buildPersonalizedFlow` de antes da sugestão: é contra ela
// que "idêntico ao de antes" é medido, e não contra o código novo sem argumento.
const {
  normalizePersonalizedStepActivity,
  normalizePersonalizedStepContent,
} = require("@/utils/personalizedFlow") as typeof import("@/utils/personalizedFlow");
function fluxoDeAntes(personalizedTopic: typeof payload, topicoId: number) {
  const orderedSteps = [...personalizedTopic.steps].sort(
    (left, right) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0)
  );
  const conteudos: any[] = [];
  const atividades: any[] = [];
  const blocks: any[] = [];
  orderedSteps.forEach((step, index) => {
    const stepKind = String((step as any)?.kind ?? "content");
    if (stepKind === "content" || stepKind === "cards") {
      const conteudo = normalizePersonalizedStepContent(topicoId, step, index);
      conteudos.push(conteudo);
      blocks.push({ kind: "conteudo", id: `pc-${conteudo.id}`, conteudo });
      return;
    }
    if (stepKind === "activity") {
      const atividade = normalizePersonalizedStepActivity(topicoId, step, index);
      if (!atividade) return;
      atividades.push(atividade);
      blocks.push({ kind: "atividade", id: `pa-${atividade.id}`, atividade });
    }
  });
  return { conteudos, atividades, blocks };
}

test("sem sugestão (ou com sugestão sem ordem), o fluxo é idêntico ao de antes", () => {
  const legado = fluxoDeAntes(payload, TOPICO);
  for (const vazia of [null, undefined, { ordem: [] }, { formato_inicial: "audio", ordem: null }]) {
    const resultado = fluxo(vazia as SugestaoMaterial | null);
    assert.equal(JSON.stringify(resultado.blocks), JSON.stringify(legado.blocks));
    assert.equal(JSON.stringify(resultado.conteudos), JSON.stringify(legado.conteudos));
    assert.equal(JSON.stringify(resultado.atividades), JSON.stringify(legado.atividades));
    assert.equal(resultado.sugestaoAplicada, false);
    assert.equal(resultado.destaquesSugestao.size, 0);
  }
  assert.deepEqual(resumoDosBlocos(legado as ReturnType<typeof fluxo>), [
    "11:markdown", "11:apresentacao", "11:cards", "11:audio", "11:atividade",
    "12:markdown", "12:apresentacao", "12:cards", "12:audio", "12:atividade",
  ]);
});

// --- reordenação dentro do conteúdo --------------------------------------

test("a sugestão reordena só dentro do mesmo conteúdo, e o quiz não se mexe", () => {
  const resultado = fluxo(sugestao(["audio", "cards", "markdown", "apresentacao"]));

  // O áudio do conteúdo 126 nunca passa à frente do material do 125.
  assert.deepEqual(resumoDosBlocos(resultado), [
    "11:audio", "11:cards", "11:markdown", "11:apresentacao", "11:atividade",
    "12:audio", "12:cards", "12:markdown", "12:apresentacao", "12:atividade",
  ]);
  assert.equal(resultado.sugestaoAplicada, true);
});

test("formato fora da sugestão fica na posição relativa que tinha", () => {
  // Só áudio e texto citados: apresentação e cards ficam onde estavam
  // (posições 2 e 3 do grupo); áudio e texto trocam entre as posições 1 e 4.
  const resultado = fluxo(sugestao(["audio", "markdown"]));

  assert.deepEqual(resumoDosBlocos(resultado).slice(0, 5), [
    "11:audio", "11:apresentacao", "11:cards", "11:markdown", "11:atividade",
  ]);
});

// --- cards no percurso ----------------------------------------------------

function topicoCom(conteudosDoProfessor: { id: number }[]) {
  const topico = new Topico(
    TOPICO, 32, "Tópico", null, 1, null, null, "não iniciado", 0, 0, null, null, null
  );
  conteudosDoProfessor.forEach((conteudo) => topico.addConteudo(conteudo as never));
  return topico;
}

test("sem sugestão os cards personalizados vão para o fim, como sempre", () => {
  const professor = [{ id: 125, titulo: "Aula 1" }];
  const topico = topicoCom(professor);
  const resultado = fluxo(null);

  const ordenados = topico.ordenarConteudosParaTrilha([...professor, ...resultado.conteudos]);

  assert.deepEqual(
    ordenados.map((conteudo: any) =>
      conteudo.isPersonalizedLocal ? `${conteudo.metadata.personalizacao_id}:${conteudo.tipo}` : `prof:${conteudo.id}`
    ),
    [
      "11:markdown", "11:apresentacao", "11:audio",
      "12:markdown", "12:apresentacao", "12:audio",
      "11:cards", "12:cards",
      "prof:125",
    ]
  );
});

test("com sugestão os cards seguem a ordem do fluxo e podem subir", () => {
  // Aluno com dificuldade no tópico: a sugestão põe os cards primeiro.
  const professor = [{ id: 125, titulo: "Aula 1" }];
  const topico = topicoCom(professor);
  const resultado = fluxo(sugestao(["cards", "markdown", "apresentacao", "audio"]));

  const ordenados = topico.ordenarConteudosParaTrilha([...professor, ...resultado.conteudos], {
    respeitarOrdemPersonalizada: resultado.sugestaoAplicada,
  });

  assert.deepEqual(
    ordenados.map((conteudo: any) =>
      conteudo.isPersonalizedLocal ? `${conteudo.metadata.personalizacao_id}:${conteudo.tipo}` : `prof:${conteudo.id}`
    ),
    [
      "11:cards", "11:markdown", "11:apresentacao", "11:audio",
      "12:cards", "12:markdown", "12:apresentacao", "12:audio",
      "prof:125",
    ]
  );
});

// --- destaque "comece por aqui" ------------------------------------------

test("destaca, em cada conteúdo, o passo do formato inicial com o motivo para o aluno", () => {
  const resultado = fluxo(
    sugestao(["apresentacao", "markdown"], {
      ordem: [
        {
          formato: "apresentacao",
          posicao: 1,
          motivos: ["imagens=3", "regra DAT-02"],
          motivo_aluno: "Este conteúdo depende de imagens: comece pela apresentação.",
        },
        { formato: "markdown", posicao: 2, motivo_aluno: "Depois, o texto." },
      ],
    })
  );

  const destacados = resultado.conteudos.filter((conteudo) =>
    resultado.destaquesSugestao.has(Number(conteudo.id))
  );
  assert.deepEqual(
    destacados.map((conteudo) => `${(conteudo.metadata as any).personalizacao_id}:${conteudo.tipo}`),
    ["11:apresentacao", "12:apresentacao"]
  );
  destacados.forEach((conteudo) => {
    assert.deepEqual(resultado.destaquesSugestao.get(Number(conteudo.id)), {
      formato: "apresentacao",
      motivo: "Este conteúdo depende de imagens: comece pela apresentação.",
    });
  });
});

test("sem motivo_aluno o destaque vem sem motivo — as notas internas nunca vão para a tela", () => {
  const resultado = fluxo(
    sugestao(["audio"], { ordem: [{ formato: "audio", posicao: 1, motivos: ["nota interna"], motivo_aluno: "  " }] })
  );

  const destaques = [...resultado.destaquesSugestao.values()];
  assert.equal(destaques.length, 2);
  destaques.forEach((destaque) => assert.deepEqual(destaque, { formato: "audio", motivo: null }));
});

test("formato inicial que o conteúdo não tem não destaca outro no lugar", () => {
  const resultado = fluxo(sugestao(["pdf", "markdown"]));
  assert.equal(resultado.destaquesSugestao.size, 0);
});

// --- a ordem é decidida antes da retomada --------------------------------

test("a sugestão acompanha a disponível até os blocos ficarem prontos e congela ali", () => {
  const a = sugestao(["audio"]);
  const b = sugestao(["cards"]);

  let estado = avancarSugestaoCongelada(null, { topicoId: 7, disponivel: null, pronta: false });
  assert.equal(estado.sugestao, null);

  estado = avancarSugestaoCongelada(estado, { topicoId: 7, disponivel: a, pronta: false });
  assert.equal(estado.sugestao, a);

  estado = avancarSugestaoCongelada(estado, { topicoId: 7, disponivel: a, pronta: true });
  assert.equal(estado.sugestao, a);
  assert.equal(estado.congelada, true);

  // Resposta da API chegando depois da retomada: não reordena a tela aberta.
  const congelado = estado;
  estado = avancarSugestaoCongelada(estado, { topicoId: 7, disponivel: b, pronta: true });
  assert.equal(estado, congelado);
  assert.equal(estado.sugestao, a);

  // Outro tópico recomeça.
  estado = avancarSugestaoCongelada(estado, { topicoId: 8, disponivel: b, pronta: true });
  assert.equal(estado.sugestao, b);
});

test("pronto sem sugestão congela a ordem canônica", () => {
  let estado = avancarSugestaoCongelada(null, { topicoId: 7, disponivel: null, pronta: true });
  estado = avancarSugestaoCongelada(estado, { topicoId: 7, disponivel: sugestao(["audio"]), pronta: true });
  assert.equal(estado.sugestao, null);
});

test("estado sem mudança devolve o mesmo objeto", () => {
  const a = sugestao(["audio"]);
  const estado = avancarSugestaoCongelada(null, { topicoId: 7, disponivel: a, pronta: false });
  assert.equal(avancarSugestaoCongelada(estado, { topicoId: 7, disponivel: a, pronta: false }), estado);
});

// --- leitura do banco e cache --------------------------------------------

test("linhas de personalizacao_sugestao viram sugestão por tópico", () => {
  const resultado = sugestoesPorTopico([
    { topico_id: 121, formato_inicial: "audio", ordem: [{ formato: "audio", posicao: 1 }], versao: 2, origem: "revisao" },
    { topico_id: 122, formato_inicial: "markdown", ordem: '[{"formato":"markdown","posicao":1}]', versao: 1, origem: "inicial" },
    { topico_id: 123, formato_inicial: null, ordem: [], versao: 1, origem: "inicial" },
    { topico_id: null, ordem: [{ formato: "audio" }] },
  ]);

  assert.deepEqual(Object.keys(resultado).map(Number), [121, 122]);
  assert.equal(resultado[121].versao, 2);
  assert.equal(resultado[122].ordem?.[0].formato, "markdown");
  assert.deepEqual(sugestoesPorTopico(null), {});
});

test("leitura vazia do banco não apaga a sugestão que já se tinha", () => {
  const atuais = { 121: sugestao(["audio"]) };
  assert.equal(mesclarSugestoes(atuais, {}), atuais);
  assert.equal(mesclarSugestoes(atuais, null), atuais);
});

test("versão menor não substitui maior; igual não troca o objeto", () => {
  const atuais = { 121: sugestao(["audio"], { versao: 3 }) };
  assert.equal(mesclarSugestoes(atuais, { 121: sugestao(["cards"], { versao: 2 }) }), atuais);
  assert.equal(mesclarSugestoes(atuais, { 121: sugestao(["audio"], { versao: 3 }) }), atuais);

  const novas = mesclarSugestoes(atuais, {
    121: sugestao(["cards"], { versao: 4 }),
    122: sugestao(["markdown"]),
  });
  assert.notEqual(novas, atuais);
  assert.equal(novas[121].formato_inicial, "cards");
  assert.equal(novas[122].formato_inicial, "markdown");
  assert.equal(atuais[121].formato_inicial, "audio", "não muta o mapa recebido");
});
