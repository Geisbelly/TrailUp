import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), remove: vi.fn(),
  result: { data: [{ aluno_id: 'student' }] as unknown, error: null as unknown },
  filters: [] as unknown[],
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, from: mocks.from, storage: { from: mocks.remove },
} }));
import { deleteClasseCascade, removeClassStudent } from './classDeletion';

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
