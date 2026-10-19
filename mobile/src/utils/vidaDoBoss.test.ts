import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTLE_DIFFICULTY_RULES, type BattleDifficultyKey } from './batalhaRegras';
import {
  EMPENHO_POR_PERFIL,
  composicaoDeBlocos,
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
