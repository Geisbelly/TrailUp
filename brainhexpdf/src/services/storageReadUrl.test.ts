import assert from 'node:assert/strict';
import test from 'node:test';

import { urlDeLeituraDoStorage, type ClienteDeStorage } from './storageReadUrl';

function cliente(assinatura: { signedUrl?: string; erro?: string }) {
  const chamadas: unknown[] = [];
  const c: ClienteDeStorage = {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => {
          chamadas.push(['publica', bucket, path]);
          return { data: { publicUrl: `https://p/storage/v1/object/public/${bucket}/${path}` } };
        },
        createSignedUrl: async (path: string, segundos: number) => {
          chamadas.push(['assina', bucket, path, segundos]);
          return assinatura.erro
            ? { data: null, error: { message: assinatura.erro } }
            : { data: { signedUrl: assinatura.signedUrl ?? '' }, error: null };
        },
      }),
    },
  };
  return { c, chamadas };
}

test('bucket privado devolve URL assinada curta, nunca a publica', async () => {
  const { c, chamadas } = cliente({ signedUrl: 'https://p/storage/v1/object/sign/conteudo_aluno/a.md?token=t' });
  assert.equal(
    await urlDeLeituraDoStorage(c, 'conteudo_aluno', 'a.md'),
    'https://p/storage/v1/object/sign/conteudo_aluno/a.md?token=t',
  );
  assert.deepEqual(chamadas, [['assina', 'conteudo_aluno', 'a.md', 3600]]);
});

test('sem assinatura (RLS), devolve o caminho em vez da URL publica morta', async () => {
  const { c } = cliente({ erro: 'new row violates row-level security policy' });
  assert.equal(await urlDeLeituraDoStorage(c, 'conteudo_aluno', 'x/a.md'), 'x/a.md');
});

test('bucket publico segue com a URL publica', async () => {
  const { c, chamadas } = cliente({});
  assert.equal(
    await urlDeLeituraDoStorage(c, 'trailup-slides', 'a.pptx'),
    'https://p/storage/v1/object/public/trailup-slides/a.pptx',
  );
  assert.deepEqual(chamadas, [['publica', 'trailup-slides', 'a.pptx']]);
});

test('material do professor (bucket conteudos, 20261024_10) tambem sai assinado', async () => {
  const { c, chamadas } = cliente({ signedUrl: 'https://p/storage/v1/object/sign/conteudos/u/1/a.pdf?token=t' });
  assert.equal(
    await urlDeLeituraDoStorage(c, 'conteudos', 'u/1/a.pdf'),
    'https://p/storage/v1/object/sign/conteudos/u/1/a.pdf?token=t',
  );
  assert.deepEqual(chamadas, [['assina', 'conteudos', 'u/1/a.pdf', 3600]]);
});
