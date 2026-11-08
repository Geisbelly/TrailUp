import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acaoDaNotificacao,
  idPositivo,
  topicoAberto,
  topicosDasTurmas,
  type DestinosConhecidos,
  type NotificacaoComDestino,
} from "./acaoDaNotificacao";

const REMETENTE = "0b7e1f7c-3d2a-4c55-9a51-2a1f4e0c9d10";

const conhecidos: DestinosConhecidos = {
  topicos: topicosDasTurmas([
    {
      classe_id: 7,
      topicos: [
        // Começado: abre direto.
        { id: 10, status: "em andamento", depende: [9], conteudos: [{ id: 100 }], atividades: [{ id: 200 }] },
        // Sem pré-requisito, nunca aberto: abre direto.
        { id: 11, status: "não iniciado", depende: [], conteudos: [{ id: 110 }], atividades: [] },
        // Depende de outro e nunca começou: pode estar bloqueado, vai ao mapa.
        { id: 12, status: "não iniciado", depende: [11], conteudos: [], atividades: [] },
      ],
    },
    { classe_id: 8, topicos: [{ id: 20, status: "concluido", depende: null, conteudos: [], atividades: [] }] },
  ]),
  rankIds: [5],
};

function n(tipo: string | null, contexto: Record<string, unknown> | null = {}): NotificacaoComDestino {
  return { id: 42, tipo, contexto };
}

describe("acaoDaNotificacao: alteracao_professor", () => {
  it("material atualizado abre o conteúdo no tópico", () => {
    assert.deepEqual(
      acaoDaNotificacao(n("alteracao_professor", { topico_id: 10, conteudo_id: 100, decisao: "destacar" }), conhecidos),
      {
        rotulo: "Ver material",
        icone: "book-open-page-variant-outline",
        rota: "/(tabs)/trilha/10?conteudo=100",
        modo: "push",
        classeId: 7,
      },
    );
  });

  it("atividade a revisar abre a atividade com o rótulo de refazer", () => {
    const acao = acaoDaNotificacao(n("alteracao_professor", { topico_id: 10, atividade_id: 200, decisao: "revisar" }), conhecidos);
    assert.equal(acao?.rotulo, "Refazer atividade");
    assert.equal(acao?.rota, "/(tabs)/trilha/10?atividade=200");
  });

  it("atividade só destacada é ver, não refazer", () => {
    const acao = acaoDaNotificacao(n("alteracao_professor", { topico_id: 10, atividade_id: 200, decisao: "destacar" }), conhecidos);
    assert.equal(acao?.rotulo, "Ver atividade");
  });

  it("item que saiu do tópico leva ao tópico, sem parâmetro que não acha nada", () => {
    const acao = acaoDaNotificacao(n("alteracao_professor", { topico_id: 10, conteudo_id: 999 }), conhecidos);
    assert.equal(acao?.rota, "/(tabs)/trilha/10");
    assert.equal(acao?.rotulo, "Ver tópico");
  });

  it("ids em texto (como chegam pelo push) valem", () => {
    const acao = acaoDaNotificacao(n("alteracao_professor", { topico_id: "10", conteudo_id: "100" }), conhecidos);
    assert.equal(acao?.rota, "/(tabs)/trilha/10?conteudo=100");
  });

  it("tópico de outra turma do aluno leva junto a turma a escolher", () => {
    assert.equal(acaoDaNotificacao(n("alteracao_professor", { topico_id: 20 }), conhecidos)?.classeId, 8);
  });

  it("tópico fora das turmas do aluno não tem botão", () => {
    assert.equal(acaoDaNotificacao(n("alteracao_professor", { topico_id: 999, conteudo_id: 1 }), conhecidos), null);
    assert.equal(acaoDaNotificacao(n("alteracao_professor", {}), conhecidos), null);
  });
});

describe("acaoDaNotificacao: novo_material", () => {
  it("um tópico liberado abre o tópico", () => {
    const acao = acaoDaNotificacao(n("novo_material", { classe_id: 7, topico_id: 11 }), conhecidos);
    assert.equal(acao?.rota, "/(tabs)/trilha/11");
    assert.equal(acao?.rotulo, "Ver material");
  });

  it("tópico que pode estar bloqueado vai ao mapa da turma, nunca direto", () => {
    assert.deepEqual(acaoDaNotificacao(n("novo_material", { classe_id: 7, topico_id: 12 }), conhecidos), {
      rotulo: "Ver na trilha",
      icone: "map-marker-path",
      rota: "/(tabs)",
      modo: "navigate",
      classeId: 7,
    });
  });

  it("aviso de vários tópicos vai ao mapa da turma (o topico_id é só o primeiro)", () => {
    const acao = acaoDaNotificacao(n("novo_material", { classe_id: 7, topico_id: 10, topicos: 3 }), conhecidos);
    assert.equal(acao?.rota, "/(tabs)");
    assert.equal(acao?.classeId, 7);
  });

  it("turma em que o aluno não está não tem botão", () => {
    assert.equal(acaoDaNotificacao(n("novo_material", { classe_id: 99, topico_id: 10, topicos: 2 }), conhecidos), null);
  });
});

describe("acaoDaNotificacao: ranking, conquista, social e lembrete", () => {
  it("rank conhecido abre a categoria; desconhecido, a aba", () => {
    assert.equal(acaoDaNotificacao(n("rank", { rank_id: 5 }), conhecidos)?.rota, "/(tabs)/ranking/5");
    assert.equal(acaoDaNotificacao(n("amigo_rank", { rank_id: 6 }), conhecidos)?.rota, "/ranking");
    assert.equal(acaoDaNotificacao(n("rank", {}), conhecidos), null);
  });

  it("conquista abre a biblioteca de conquistas", () => {
    assert.equal(acaoDaNotificacao(n("conquista", null), conhecidos)?.rota, "/(tabs)/perfil/biblioteca-conquistas");
  });

  it("mensagem privada abre a conversa e leva o id do aviso", () => {
    const acao = acaoDaNotificacao(n("chat_privado", { remetente_id: REMETENTE }), conhecidos);
    assert.equal(acao?.rota, `/social?conversa=${REMETENTE}&notificacao=42`);
    assert.equal(acao?.modo, "navigate");
    assert.equal(acaoDaNotificacao(n("chat_privado", { remetente_id: "x" }), conhecidos), null);
  });

  it("convites abrem o Social", () => {
    assert.equal(acaoDaNotificacao(n("social_convite_recebido", {}), conhecidos)?.rota, "/social");
    assert.equal(acaoDaNotificacao(n("social_convite_aceito", {}), conhecidos)?.rota, "/social");
  });

  it("lembrete leva à trilha só quando o aluno tem tópico para estudar", () => {
    assert.equal(acaoDaNotificacao(n("lembrete", { topico: "Frações" }), conhecidos)?.rota, "/(tabs)");
    assert.equal(acaoDaNotificacao(n("lembrete", {}), { topicos: [], rankIds: [] }), null);
  });

  it("rotinas que chamam de volta ao estudo levam à trilha", () => {
    for (const tipo of ["revisao_diaria", "retomada_login"]) {
      assert.equal(acaoDaNotificacao(n(tipo, { motivo: tipo }), conhecidos)?.rota, "/(tabs)", tipo);
    }
  });
});

describe("acaoDaNotificacao: sem destino, sem botão", () => {
  for (const tipo of ["suporte", "sequencia", "sistema", "pausa_saudavel", "tipo_que_ainda_nao_existe", null]) {
    it(String(tipo), () => {
      assert.equal(acaoDaNotificacao(n(tipo, { topico_id: 10, rank_id: 5 }), conhecidos), null);
    });
  }
});

describe("idPositivo e topicoAberto", () => {
  it("só aceita inteiro positivo", () => {
    assert.equal(idPositivo(3), 3);
    assert.equal(idPositivo("3"), 3);
    for (const v of [0, -1, 1.5, "1a", "", null, undefined, {}]) assert.equal(idPositivo(v), null);
  });

  it("aberto: começado, concluído ou sem pré-requisito", () => {
    assert.equal(topicoAberto({ status: "em andamento", depende: [1] }), true);
    assert.equal(topicoAberto({ status: "concluido", depende: [1] }), true);
    assert.equal(topicoAberto({ status: "não iniciado", depende: null }), true);
    assert.equal(topicoAberto({ status: "não iniciado", depende: [] }), true);
    assert.equal(topicoAberto({ status: "não iniciado", depende: [3] }), false);
    assert.equal(topicoAberto({ status: null, depende: { qualquer: 1 } }), false);
  });
});
