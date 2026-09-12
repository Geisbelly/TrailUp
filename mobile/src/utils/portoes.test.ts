import assert from "node:assert/strict";
import test from "node:test";

import {
  avaliarPortoes,
  cerimoniasPendentes,
  chaveDaCerimonia,
  PORTOES,
  PORTOES_VERSAO,
  portaoDe,
  PROGRESSO_ZERADO,
  type ProgressoDoAluno,
} from "@/utils/portoes";

function progresso(patch: Partial<ProgressoDoAluno> = {}): ProgressoDoAluno {
  return { ...PROGRESSO_ZERADO, ...patch };
}

test("quem acabou de entrar nao ve nem social nem rank", () => {
  const a = avaliarPortoes(PROGRESSO_ZERADO);

  assert.equal(a.social, false);
  assert.equal(a.rank, false);
});

test("o primeiro conteudo abre o social, e so ele", () => {
  const a = avaliarPortoes(progresso({ conteudosConcluidos: 1 }));

  assert.equal(a.social, true);
  // O rank espera o bloco inteiro: uma atividade resolvida em um minuto abriria
  // o placar antes de existir pontuacao que signifique alguma coisa.
  assert.equal(a.rank, false);
});

test("o primeiro topico concluido abre o rank", () => {
  const a = avaliarPortoes(progresso({ conteudosConcluidos: 4, topicosConcluidos: 1 }));

  assert.equal(a.rank, true);
});

test("portao aberto nao volta a fechar", () => {
  // O progresso so cresce, mas a garantia vale registrar: o aluno que passou
  // pelo portao nao pode ve-lo travado de novo.
  const muito = avaliarPortoes(progresso({ conteudosConcluidos: 40, topicosConcluidos: 9 }));

  assert.equal(muito.social, true);
  assert.equal(muito.rank, true);
});

test("cerimonia aparece para o que esta aberto e ainda nao foi visto", () => {
  const a = avaliarPortoes(progresso({ conteudosConcluidos: 1 }));

  assert.deepEqual(cerimoniasPendentes(a, []), ["social"]);
  assert.deepEqual(cerimoniasPendentes(a, ["social"]), []);
});

test("aluno que ja tinha tudo aberto ve as duas, na ordem da progressao", () => {
  // Quem usava o app antes desta versao nunca viu cerimonia nenhuma -- e e
  // exatamente quem precisa saber que a funcionalidade existe.
  const a = avaliarPortoes(progresso({ conteudosConcluidos: 10, topicosConcluidos: 3 }));

  assert.deepEqual(cerimoniasPendentes(a, []), ["social", "rank"]);
});

test("portao fechado nunca gera cerimonia", () => {
  const a = avaliarPortoes(PROGRESSO_ZERADO);

  assert.deepEqual(cerimoniasPendentes(a, []), []);
});

test("a chave separa aluno, funcionalidade e versao", () => {
  const a = chaveDaCerimonia("aluno-1", "rank");
  const b = chaveDaCerimonia("aluno-2", "rank");
  const c = chaveDaCerimonia("aluno-1", "social");

  assert.notEqual(a, b, "um aluno nao pode herdar a cerimonia de outro");
  assert.notEqual(a, c, "cada funcionalidade tem a sua");
  assert.ok(a.includes(`v${PORTOES_VERSAO}`), "mudar os portoes precisa reabrir a cerimonia");
});

test("todo portao tem texto para os dois lados", () => {
  // Sem `comoAbrir` o aluno ve algo escondido e nao sabe o que fazer; sem
  // `promessa` a cerimonia nao diz o que ele ganhou.
  for (const portao of PORTOES) {
    assert.ok(portao.titulo.length > 0, portao.funcionalidade);
    assert.ok(portao.promessa.length > 0, portao.funcionalidade);
    assert.ok(portao.comoAbrir.length > 0, portao.funcionalidade);
    // Sem passos a cerimonia vira so um aviso: o aluno sabe que abriu e nao
    // sabe o que fazer com isso.
    assert.ok(portao.passos.length >= 2, portao.funcionalidade);
    assert.equal(portaoDe(portao.funcionalidade), portao);
  }
});
