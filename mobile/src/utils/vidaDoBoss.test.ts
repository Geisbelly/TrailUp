import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTLE_DIFFICULTY_RULES, type BattleDifficultyKey } from './batalhaRegras';
import {
  EMPENHO_POR_PERFIL,
  composicaoDeBlocos,
  composicaoPorConteudo,
  dimensionarBoss,
  empenhoDoPerfil,
  orcamentoDeDano,
} from './vidaDoBoss';

const DIFICULDADES: BattleDifficultyKey[] = ['easy', 'medium', 'hard'];
const PERFIS = Object.keys(EMPENHO_POR_PERFIL);

/**
 * O defeito que motivou o módulo: vida fixa de 180 para todo tópico. Um tópico
 * de 2 conteúdos e 1 atividade entrega 73 de dano no melhor caso — o boss não
 * tinha como morrer.
 */
test('o tópico pequeno, que antes dava boss invencível, agora é vencível', () => {
  const composicao = { conteudos: 2, atividades: 1, questoes: 3 };
  const orcamento = orcamentoDeDano(composicao, BATTLE_DIFFICULTY_RULES.medium);
  assert.ok(orcamento < 180, `o teto de dano (${orcamento}) é menor que os 180 fixos de antes`);

  const boss = dimensionarBoss({ composicao, dificuldade: 'medium', perfil: 'conqueror' });
  assert.ok(boss.hpMax + boss.shieldMax <= orcamento);
  assert.ok(boss.hpMax > 0);
});

/** O invariante do arquivo. Se cair, existe tópico com boss imbatível. */
test('vida + escudo nunca passam do teto de dano da trilha', () => {
  for (const conteudos of [0, 1, 2, 5, 12, 30]) {
    for (const atividades of [0, 1, 3, 10]) {
      for (const questoes of [0, 4, 40, 400]) {
        for (const dificuldade of DIFICULDADES) {
          for (const perfil of PERFIS) {
            const composicao = { conteudos, atividades, questoes };
            const boss = dimensionarBoss({ composicao, dificuldade, perfil });
            const orcamento = orcamentoDeDano(composicao, BATTLE_DIFFICULTY_RULES[dificuldade]);
            assert.equal(boss.orcamento, orcamento);
            assert.ok(
              boss.hpMax + boss.shieldMax <= orcamento,
              `${perfil}/${dificuldade} ${conteudos}c ${atividades}a: ${boss.hpMax}+${boss.shieldMax} > ${orcamento}`
            );
            assert.ok(boss.hpMax >= 0 && boss.shieldMax >= 0);
          }
        }
      }
    }
  }
});

test('o boss cresce com o tamanho do tópico', () => {
  const pequeno = dimensionarBoss({
    composicao: { conteudos: 2, atividades: 1, questoes: 4 }, dificuldade: 'medium', perfil: 'conqueror',
  });
  const grande = dimensionarBoss({
    composicao: { conteudos: 20, atividades: 10, questoes: 40 }, dificuldade: 'medium', perfil: 'conqueror',
  });
  assert.ok(grande.hpMax > pequeno.hpMax * 5);
});

test('a dificuldade cobra mais trilha, não só números maiores', () => {
  const composicao = { conteudos: 10, atividades: 5, questoes: 20 };
  const fracaoCoberta = (dificuldade: BattleDifficultyKey) => {
    const boss = dimensionarBoss({ composicao, dificuldade, perfil: 'daredevil' });
    return (boss.hpMax + boss.shieldMax) / boss.orcamento;
  };
  assert.ok(fracaoCoberta('easy') < fracaoCoberta('medium'));
  assert.ok(fracaoCoberta('medium') < fracaoCoberta('hard'));
});

test('mais questões por atividade pesam, com teto', () => {
  const base = { conteudos: 6, atividades: 3 };
  const alvo = (questoes: number) => {
    const boss = dimensionarBoss({ composicao: { ...base, questoes }, dificuldade: 'medium', perfil: 'survivor' });
    return boss.hpMax + boss.shieldMax;
  };
  assert.equal(alvo(6), alvo(12), 'ate a referencia de 4 questoes por atividade, o desafio nao pesa');
  assert.ok(alvo(30) > alvo(9), 'atividade de 10 questões pesa mais que a de 3');
  assert.ok(alvo(3000) <= alvo(30) * 1.2, 'o peso do desafio tem teto');
});

test('a faixa de empenho ordena os perfis como a tabela diz', () => {
  const composicao = { conteudos: 10, atividades: 5, questoes: 20 };
  const alvo = (perfil: string) => {
    const boss = dimensionarBoss({ composicao, dificuldade: 'medium', perfil });
    return boss.hpMax + boss.shieldMax;
  };
  assert.ok(alvo('conqueror') > alvo('daredevil'));
  assert.ok(alvo('daredevil') > alvo('survivor'));
  assert.equal(empenhoDoPerfil('conquistador'), 'maximo');
  assert.equal(empenhoDoPerfil('sobrevivente'), 'minimo');
});

test('perfil desconhecido cai no meio, não num buraco', () => {
  assert.equal(empenhoDoPerfil(null), 'medio');
  assert.equal(empenhoDoPerfil('nao-existe'), 'medio');
});

test('tópico sem percurso não gera boss com vida', () => {
  const boss = dimensionarBoss({
    composicao: { conteudos: 0, atividades: 0, questoes: 0 }, dificuldade: 'medium', perfil: 'conqueror',
  });
  assert.equal(boss.orcamento, 0);
  assert.equal(boss.hpMax, 0);
});

test('a composição sai dos blocos do percurso, com as questões somadas', () => {
  const composicao = composicaoDeBlocos([
    { kind: 'conteudo' },
    { kind: 'atividade', atividade: { questoes: [1, 2, 3] } },
    { kind: 'conteudo' },
    { kind: 'atividade', atividade: { questoes: [] } },
    { kind: 'atividade', atividade: null },
  ]);
  assert.deepEqual(composicao, { conteudos: 2, atividades: 3, questoes: 3 });
});

test('bloco de tipo desconhecido não entra na conta', () => {
  assert.deepEqual(
    composicaoDeBlocos([{ kind: 'separador' }, { kind: 'conteudo' }]),
    { conteudos: 1, atividades: 0, questoes: 0 }
  );
});

test('cada conteúdo leva só o que lhe pertence: ele mesmo e as atividades vinculadas', () => {
  const porConteudo = composicaoPorConteudo([
    { kind: 'conteudo', conteudo: { id: 10 } },
    { kind: 'atividade', atividade: { questoes: [1, 2] }, vinculadoConteudoId: 10 },
    { kind: 'atividade', atividade: { questoes: [1] }, vinculadoConteudoId: 10 },
    { kind: 'conteudo', conteudo: { id: 20 } },
    { kind: 'atividade', atividade: { questoes: [1, 2, 3, 4] }, vinculadoConteudoId: 20 },
    { kind: 'atividade', atividade: { questoes: [1] } },
  ]);
  assert.deepEqual(porConteudo, {
    'content:10': { conteudos: 1, atividades: 2, questoes: 3 },
    'content:20': { conteudos: 1, atividades: 1, questoes: 4 },
  });
});

/**
 * O erro que o módulo existe para evitar: dimensionar o boss de conteúdo pelo
 * percurso do TÓPICO. Com 6 conteúdos o teto do tópico é 6× maior que o do
 * conteúdo, e nenhum boss de conteúdo seria derrubável sozinho.
 */
test('o boss do conteúdo é menor que o do tópico que o contém', () => {
  const blocos = [
    { kind: 'conteudo', conteudo: { id: 1 } },
    { kind: 'atividade', atividade: { questoes: [1, 2] }, vinculadoConteudoId: 1 },
    { kind: 'conteudo', conteudo: { id: 2 } },
    { kind: 'atividade', atividade: { questoes: [1, 2] }, vinculadoConteudoId: 2 },
    { kind: 'conteudo', conteudo: { id: 3 } },
  ];
  const doTopico = dimensionarBoss({
    composicao: composicaoDeBlocos(blocos), dificuldade: 'medium', perfil: 'conqueror',
  });
  const doConteudo = dimensionarBoss({
    composicao: composicaoPorConteudo(blocos)['content:1'], dificuldade: 'medium', perfil: 'conqueror',
  });
  assert.ok(doConteudo.hpMax + doConteudo.shieldMax < doTopico.hpMax + doTopico.shieldMax);
  assert.ok(doConteudo.hpMax > 0);
});

test('cada boss de conteúdo cabe no dano que aquele conteúdo entrega', () => {
  const blocos = [
    { kind: 'conteudo', conteudo: { id: 1 } },
    { kind: 'conteudo', conteudo: { id: 2 } },
    { kind: 'atividade', atividade: { questoes: [1, 2, 3, 4, 5, 6] }, vinculadoConteudoId: 2 },
  ];
  for (const [chave, composicao] of Object.entries(composicaoPorConteudo(blocos))) {
    for (const dificuldade of DIFICULDADES) {
      for (const perfil of PERFIS) {
        const boss = dimensionarBoss({ composicao, dificuldade, perfil });
        assert.ok(
          boss.hpMax + boss.shieldMax <= boss.orcamento,
          `${chave} ${perfil}/${dificuldade}: ${boss.hpMax}+${boss.shieldMax} > ${boss.orcamento}`
        );
      }
    }
  }
});

test('conteúdo sem atividade morre no próprio content_complete', () => {
  const composicao = composicaoPorConteudo([{ kind: 'conteudo', conteudo: { id: 7 } }])['content:7'];
  const danoDoContentComplete = BATTLE_DIFFICULTY_RULES.medium.damage.contentComplete;
  for (const perfil of PERFIS) {
    const boss = dimensionarBoss({ composicao, dificuldade: 'medium', perfil });
    assert.ok(
      boss.hpMax + boss.shieldMax <= danoDoContentComplete,
      `${perfil}: ${boss.hpMax}+${boss.shieldMax} nao cabe no unico evento de dano (${danoDoContentComplete})`
    );
  }
});

test('atividade vinculada a conteúdo que não está no percurso não some para lugar nenhum', () => {
  const porConteudo = composicaoPorConteudo([
    { kind: 'conteudo', conteudo: { id: 1 } },
    { kind: 'atividade', atividade: { questoes: [1] }, vinculadoConteudoId: 999 },
  ]);
  assert.deepEqual(porConteudo, { 'content:1': { conteudos: 1, atividades: 0, questoes: 0 } });
});
