import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lerConfigDaMistura,
  lerConteudosIniciados,
  registrarExposicao,
  type ClienteDaMistura,
  type ExposicaoLinha,
} from './misturaMaterial';

// Cliente falso: devolve `resposta` para qualquer consulta e guarda o que foi pedido.
function cliente(resposta: { data?: unknown; error?: unknown }) {
  const chamadas: { tabela: string; upsert?: unknown[] }[] = [];
  const c: ClienteDaMistura = {
    from(tabela: string) {
      const registro: { tabela: string; upsert?: unknown[] } = { tabela };
      chamadas.push(registro);
      const consulta: any = {
        select: () => consulta,
        eq: () => consulta,
        in: () => consulta,
        upsert: (linhas: unknown[]) => {
          registro.upsert = linhas;
          return consulta;
        },
        then: (resolve: (valor: unknown) => unknown) =>
          Promise.resolve(resolve({ data: resposta.data ?? null, error: resposta.error ?? null })),
      };
      return consulta;
    },
  };
  return { c, chamadas };
}

test('chave ligada e bônus lidos de app_config', async () => {
  const { c } = cliente({
    data: [
      { chave: 'mistura_material', valor: 'alternancia' },
      { chave: 'mistura_material_bonus_ativo', valor: '0.8' },
    ],
  });
  assert.deepEqual(await lerConfigDaMistura(c), { chave: 'alternancia', bonus: 0.8 });
});

test('sem chave, valor estranho ou erro: desligada, bônus 0,5', async () => {
  assert.deepEqual(await lerConfigDaMistura(cliente({ data: [] }).c), { chave: 'desligada', bonus: 0.5 });
  assert.deepEqual(await lerConfigDaMistura(cliente({ data: null }).c), { chave: 'desligada', bonus: 0.5 });
  assert.deepEqual(
    await lerConfigDaMistura(
      cliente({
        data: [
          { chave: 'mistura_material', valor: 'xyz' },
          { chave: 'mistura_material_bonus_ativo', valor: 'abc' },
        ],
      }).c,
    ),
    { chave: 'desligada', bonus: 0.5 },
  );
  assert.deepEqual(await lerConfigDaMistura(cliente({ error: { message: 'rede' } }).c), { chave: 'desligada', bonus: 0.5 });
});

const registros = [
  { id: 1, conteudo_id: 10, perfil: 'survivor' as const },
  { id: 2, conteudo_id: 11, perfil: 'daredevil' as const },
  { id: 3, conteudo_id: 12, perfil: 'daredevil' as const },
];

test('iniciado: percentual acima de zero ou status diferente de não iniciado', async () => {
  const { c } = cliente({
    data: [
      { personalizacao_id: 1, status: 'nao_iniciado', percentual_concluido: 0 },
      { personalizacao_id: 2, status: 'nao_iniciado', percentual_concluido: 10 },
      { personalizacao_id: 3, status: 'em_andamento', percentual_concluido: 0 },
    ],
  });
  const iniciados = await lerConteudosIniciados(c, 'aluno-1', 54, registros);
  assert.deepEqual([...iniciados].sort(), [
    [11, 'daredevil'],
    [12, 'daredevil'],
  ]);
});

test('iniciados: erro de leitura dá mapa vazio, sem lançar', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const iniciados = await lerConteudosIniciados(cliente({ error: { message: 'rede' } }).c, 'a', 54, registros);
    assert.equal(iniciados.size, 0);
  } finally {
    console.warn = warn;
  }
});

const linha: ExposicaoLinha = {
  aluno_id: 'aluno-1',
  classe_id: 54,
  topico_id: 131,
  conteudo_id: 10,
  perfil: 'survivor',
  politica: 'proporcional',
  prob_politica: 0.5,
  pesos: { survivor: 0.6, daredevil: 0.4 },
  versao_alocador: 'rota-v1',
};

test('exposição grava em personalizacao_exposicao', async () => {
  const { c, chamadas } = cliente({});
  await registrarExposicao(c, [linha]);
  assert.equal(chamadas[0].tabela, 'personalizacao_exposicao');
  assert.deepEqual(chamadas[0].upsert, [linha]);
});

test('exposição: falha não lança e avisa uma vez só', async () => {
  const warn = console.warn;
  let avisos = 0;
  console.warn = () => {
    avisos += 1;
  };
  try {
    const { c } = cliente({ error: { message: 'relation does not exist' } });
    await registrarExposicao(c, [linha]);
    await registrarExposicao(c, [linha]);
    assert.equal(avisos, 1);
  } finally {
    console.warn = warn;
  }
});

test('exposição: lista vazia não chama o banco', async () => {
  const { c, chamadas } = cliente({});
  await registrarExposicao(c, []);
  assert.equal(chamadas.length, 0);
});
