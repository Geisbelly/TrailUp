import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), remove: vi.fn(),
  result: { data: [{ aluno_id: 'student' }] as unknown, error: null as unknown },
  filters: [] as unknown[],
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, from: mocks.from, storage: { from: mocks.remove },
} }));
import { deleteActivityCascade, deleteClassTrail, deleteClasseCascade, deleteTopicCascade, referenciasPorCaminho, removeClassStudent } from './classDeletion';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: [{ aluno_id: 'student' }], error: null };
  mocks.filters = [];
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.from.mockImplementation(() => {
    const query = {
      delete: () => query,
      eq: (column: string, value: unknown) => { mocks.filters.push([column, value]); return query; },
      select: () => Promise.resolve(mocks.result),
    };
    return query;
  });
});

// deleteClassTrail apaga o topico/classe inteiros: precisa de um mock por
// tabela (select para levantar ids, delete para o cascade) em vez do stub
// generico acima, que so serve para o RPC unico de deleteClasseCascade.
const callOrder: string[] = [];

function makeTrailSupabaseMock(deleteErrors: Record<string, unknown> = {}, referencias: unknown[] = []) {
  return (table: string) => ({
    select: () => ({
      // Conferência de arquivo compartilhado (contarReferencias), depois do cascade.
      not: () => {
        callOrder.push(`refs:${table}`);
        return Promise.resolve({ data: referencias, error: null });
      },
      eq: () => {
        callOrder.push(`select:${table}`);
        if (table === 'topicos') return Promise.resolve({ data: [{ id: 10 }], error: null });
        return Promise.resolve({ data: [], error: null });
      },
      in: (coluna: string) => {
        if (coluna === 'conteudo') {
          callOrder.push(`refs:${table}`);
          return Promise.resolve({ data: referencias, error: null });
        }
        callOrder.push(`select:${table}`);
        if (table === 'conteudos') {
          return Promise.resolve({
            data: [{ id: 20, conteudo: 'prof-1/10/aula.pdf', metadata: null }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
    }),
    delete: () => ({
      eq: () => {
        callOrder.push(`delete:${table}`);
        return Promise.resolve({ error: deleteErrors[table] ?? null });
      },
      in: () => {
        callOrder.push(`delete:${table}`);
        return Promise.resolve({ error: deleteErrors[table] ?? null });
      },
    }),
  });
}

it('so remove arquivos do Storage depois que o cascade inteiro no banco for confirmado', async () => {
  callOrder.length = 0;
  mocks.from.mockImplementation(makeTrailSupabaseMock());
  const removeFn = vi.fn().mockImplementation(() => {
    callOrder.push('storage:remove');
    return Promise.resolve({ error: null });
  });
  mocks.remove.mockReturnValue({ remove: removeFn });

  await deleteClassTrail(54);

  expect(removeFn).toHaveBeenCalledExactlyOnceWith(['prof-1/10/aula.pdf']);
  const lastDbDeleteIndex = callOrder.lastIndexOf('delete:topicos');
  const storageRemoveIndex = callOrder.indexOf('storage:remove');
  expect(lastDbDeleteIndex).toBeGreaterThanOrEqual(0);
  expect(storageRemoveIndex).toBeGreaterThan(lastDbDeleteIndex);
});

it('mantém no Storage o arquivo que outra turma (uma cópia) ainda usa', async () => {
  callOrder.length = 0;
  mocks.from.mockImplementation(makeTrailSupabaseMock({}, [{ id: 77, conteudo: 'prof-1/10/aula.pdf' }]));
  const removeFn = vi.fn().mockResolvedValue({ error: null });
  mocks.remove.mockReturnValue({ remove: removeFn });

  await deleteClassTrail(54);

  expect(removeFn).not.toHaveBeenCalled();
});

it('referências contam o campo conteudo e os arquivos de metadata, por conteúdo', () => {
  const refs = referenciasPorCaminho([
    { id: 1, conteudo: 'prof/a.pdf', metadata: { files: [{ path: 'prof/b.png' }] } },
    { id: 2, conteudo: 'texto livre sem caminho', metadata: { files: [{ path: 'prof/a.pdf' }, { path: 'https://x/y' }] } },
    { id: 3, conteudo: 'https://externo/c.pdf', metadata: null },
  ]);
  expect([...(refs.get('prof/a.pdf') ?? [])]).toEqual([1, 2]);
  expect([...(refs.get('prof/b.png') ?? [])]).toEqual([1]);
  expect(refs.has('https://externo/c.pdf')).toBe(false);
  expect(refs.has('https://x/y')).toBe(false);
});

it('nao apaga arquivos do Storage quando o cascade no banco falha (ex.: FK nao coberta)', async () => {
  callOrder.length = 0;
  mocks.from.mockImplementation(makeTrailSupabaseMock({ topicos: { message: 'violates foreign key constraint' } }));
  const removeFn = vi.fn().mockResolvedValue({ error: null });
  mocks.remove.mockReturnValue({ remove: removeFn });

  await expect(deleteClassTrail(54)).rejects.toBeTruthy();

  expect(removeFn).not.toHaveBeenCalled();
});

it('exclui a classe com uma única RPC, sem excluir tabelas ou arquivos antecipadamente', async () => {
  await deleteClasseCascade(32);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('excluir_classe', { p_classe_id: 32 });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('não tenta exclusões parciais quando o banco rejeita a operação', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Sem permissão' } });
  await expect(deleteClasseCascade(32)).rejects.toThrow('Sem permissão');
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('não anuncia sucesso sem confirmação da RPC', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await expect(deleteClasseCascade(32)).rejects.toThrow('não foi confirmada');
});

it('remove apenas a matrícula do aluno na classe solicitada', async () => {
  await removeClassStudent(32, 'student');
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('classe_aluno');
  expect(mocks.filters).toEqual([['classe_id', 32], ['aluno_id', 'student']]);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('propaga erro real da remoção de matrícula', async () => {
  mocks.result = { data: null, error: { message: 'Falha na limpeza' } };
  await expect(removeClassStudent(32, 'student')).rejects.toThrow('Falha na limpeza');
});

it('não anuncia remoção quando RLS não permitiu apagar nenhuma matrícula', async () => {
  mocks.result = { data: [], error: null };
  await expect(removeClassStudent(32, 'student')).rejects.toThrow('sem permissão');
});


// --- exclusao de UMA atividade -------------------------------------------
//
// `deleteActivity` (topicsApi) e um DELETE direto em `atividades` e nunca
// funcionou para nenhuma atividade visivel na tela: toda atividade listada
// esta vinculada a um conteudo, e `atividade_conteudos` referencia
// `atividades` com NO ACTION. O console tambem nao tinha botao nenhum. Estes
// testes fixam a ordem que faz o DELETE passar.

const ops: string[] = [];

function makeActivitySupabaseMock(deleteErrors: Record<string, unknown> = {}) {
  return (table: string) => ({
    select: () => ({
      eq: () => {
        ops.push(`select:${table}`);
        if (table === 'questoes') return Promise.resolve({ data: [{ id: 901 }, { id: 902 }], error: null });
        return Promise.resolve({ data: [], error: null });
      },
    }),
    update: (patch: Record<string, unknown>) => ({
      in: (coluna: string) => {
        ops.push(`update:${table}:${coluna}=${JSON.stringify(patch)}`);
        return Promise.resolve({ error: null });
      },
    }),
    delete: () => ({
      eq: (coluna: string) => {
        ops.push(`delete:${table}:${coluna}`);
        return Promise.resolve({ error: deleteErrors[table] ?? null });
      },
      in: (coluna: string) => {
        ops.push(`delete:${table}:${coluna}`);
        return Promise.resolve({ error: deleteErrors[table] ?? null });
      },
    }),
  });
}

it('tira o vinculo com o conteudo ANTES de apagar a atividade', async () => {
  ops.length = 0;
  mocks.from.mockImplementation(makeActivitySupabaseMock());

  await deleteActivityCascade(55);

  const vinculo = ops.indexOf('delete:atividade_conteudos:atividade_id');
  const atividade = ops.indexOf('delete:atividades:id');
  expect(vinculo).toBeGreaterThanOrEqual(0);
  expect(atividade).toBeGreaterThan(vinculo);
});

it('limpa classe_aluno.ultimaAtividade, que tem FK sem ON DELETE', async () => {
  ops.length = 0;
  mocks.from.mockImplementation(makeActivitySupabaseMock());

  await deleteActivityCascade(55);

  const limpeza = ops.indexOf('update:classe_aluno:ultimaAtividade={"ultimaAtividade":null}');
  const atividade = ops.indexOf('delete:atividades:id');
  expect(limpeza).toBeGreaterThanOrEqual(0);
  expect(atividade).toBeGreaterThan(limpeza);
});

it('limpa questao_aluno pelos dois caminhos: questao_id e atividade_id', async () => {
  ops.length = 0;
  mocks.from.mockImplementation(makeActivitySupabaseMock());

  await deleteActivityCascade(55);

  expect(ops).toContain('delete:questao_aluno:questao_id');
  expect(ops).toContain('delete:questao_aluno:atividade_id');
});

it('apaga as questoes antes da atividade', async () => {
  ops.length = 0;
  mocks.from.mockImplementation(makeActivitySupabaseMock());

  await deleteActivityCascade(55);

  expect(ops.indexOf('delete:questoes:atividade_id')).toBeLessThan(ops.indexOf('delete:atividades:id'));
});

it('erro no DELETE final sobe, em vez de dizer que excluiu', async () => {
  ops.length = 0;
  mocks.from.mockImplementation(makeActivitySupabaseMock({ atividades: { code: '23503' } }));

  await expect(deleteActivityCascade(55)).rejects.toMatchObject({ code: '23503' });
});

it('apagar o topico tambem limpa ultimaAtividade — mesmo FK, mesmo bloqueio', async () => {
  ops.length = 0;
  mocks.from.mockImplementation((table: string) => {
    const base = makeActivitySupabaseMock()(table);
    return {
      ...base,
      select: () => ({
        eq: () => {
          ops.push(`select:${table}`);
          if (table === 'atividades') return Promise.resolve({ data: [{ id: 55 }], error: null });
          if (table === 'conteudos') return Promise.resolve({ data: [], error: null });
          return Promise.resolve({ data: [], error: null });
        },
        in: () => {
          ops.push(`select:${table}`);
          return Promise.resolve({ data: [{ id: 901 }], error: null });
        },
      }),
    };
  });

  await deleteTopicCascade(10);

  expect(ops).toContain('update:classe_aluno:ultimaAtividade={"ultimaAtividade":null}');
});
