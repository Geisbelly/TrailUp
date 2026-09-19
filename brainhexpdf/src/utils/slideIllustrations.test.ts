import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import { extractGeneratedImagesBySubtopic, resolveSlideIllustrations } from './slideIllustrations';
import type { GeneratedImage, ImageGenerator } from './slideIllustrations';
import { ImageGenerationUnavailableError } from './imageGenerationErrors';

function makeSlide(overrides: Partial<SlideData> & Record<string, unknown> = {}): SlideData {
  return {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Slide de teste',
    contentParagraphs: ['Parágrafo.'],
    layout: 'split-character',
    ...overrides,
  } as SlideData;
}

const attachments = [
  { mimeType: 'image/png', dataBase64: 'AAAA', name: 'diagrama.png' },
  { mimeType: 'image/jpeg', dataBase64: 'BBBB', name: 'foto.jpg' },
];

function neverCalledGenerator(): ImageGenerator {
  return async () => {
    throw new Error('generateImage nao deveria ter sido chamado');
  };
}

test('reaproveita a imagem original quando referenceImageIndex esta presente sem restyleReferenceImage', async () => {
  const slides = [makeSlide({ referenceImageIndex: 0 } as any)];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('chama o gerador COM a imagem de referencia quando restyleReferenceImage=true', async () => {
  const slides = [makeSlide({ referenceImageIndex: 1, restyleReferenceImage: true } as any)];
  const calls: Array<{ prompt: string; referenceImage?: { mimeType: string; data: string } }> = [];
  const generator: ImageGenerator = async (params) => {
    calls.push(params);
    return { mimeType: 'image/png', dataBase64: 'ESTILIZADA' };
  };

  const result = await resolveSlideIllustrations(slides, attachments, generator);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].referenceImage, { mimeType: 'image/jpeg', data: 'BBBB' });
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,ESTILIZADA');
});

test('cai de volta pra imagem original quando a reilustracao falha (gerador devolve null)', async () => {
  const slides = [makeSlide({ referenceImageIndex: 0, restyleReferenceImage: true } as any)];
  const generator: ImageGenerator = async () => null;

  const result = await resolveSlideIllustrations(slides, attachments, generator);

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('ImageGenerationUnavailableError na restilizacao tambem interrompe tentativas seguintes do deck', async () => {
  const slides = [
    makeSlide({ id: 'a', referenceImageIndex: 0, restyleReferenceImage: true } as any),
    makeSlide({ id: 'b', referenceImageIndex: 1, restyleReferenceImage: true } as any),
  ];
  const calls: number[] = [];
  const generator: ImageGenerator = async () => {
    calls.push(1);
    throw new ImageGenerationUnavailableError('prepayment credits are depleted');
  };

  const result = await resolveSlideIllustrations(slides, attachments, generator);

  assert.equal(calls.length, 1);
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/jpeg;base64,BBBB');
});

test('indice fora do range nao lanca erro e cai no padrao (ha attachments disponiveis)', async () => {
  const slides = [makeSlide({ referenceImageIndex: 5 } as any)];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('sem attachments: gera 1 ilustracao por subtopico unico, so no primeiro slide do grupo', async () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', title: 'DNS parte 1' }),
    makeSlide({ id: 'b', subtopic: 'DNS', title: 'DNS parte 2' }),
    makeSlide({ id: 'c', subtopic: 'Cache', title: 'Cache' }),
  ];
  const calls: string[] = [];
  const generator: ImageGenerator = async ({ prompt }) => {
    calls.push(prompt);
    return { mimeType: 'image/png', dataBase64: `GERADA-${calls.length}` };
  };

  const result = await resolveSlideIllustrations(slides, [], generator);

  assert.equal(calls.length, 2); // 1 por subtopico unico (DNS, Cache)
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,GERADA-1');
  assert.equal(result[1].referenceImageDataUri, undefined); // mesmo subtopico do slide 'a', nao repete
  assert.equal(result[2].referenceImageDataUri, 'data:image/png;base64,GERADA-2');
});

test('ImageGenerationUnavailableError no 1o subtopico interrompe novas tentativas pro resto do deck (fallback SVG direto)', async () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', title: 'DNS parte 1' }),
    makeSlide({ id: 'b', subtopic: 'Cache', title: 'Cache' }),
    makeSlide({ id: 'c', subtopic: 'TTL', title: 'TTL' }),
  ];
  const calls: string[] = [];
  const generator: ImageGenerator = async ({ prompt }) => {
    calls.push(prompt);
    throw new ImageGenerationUnavailableError('prepayment credits are depleted');
  };

  const result = await resolveSlideIllustrations(slides, [], generator);

  // so 1 chamada (a que descobre o erro) - Cache e TTL nao tentam de novo
  assert.equal(calls.length, 1);
  for (const slide of result) {
    assert.ok(slide.referenceImageDataUri?.startsWith('data:image/svg+xml;base64,'));
  }
});

test('com attachments presentes mas sem referenceImageIndex do Gemini, usa uma imagem do professor como padrao (sem chamar geracao por IA)', async () => {
  const slides = [makeSlide({ id: 'a', subtopic: 'DNS' })];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('varios slides sem referenceImageIndex, subtopicos diferentes: padrao distribui entre as imagens disponiveis (nao repete a mesma sempre)', async () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS' }),
    makeSlide({ id: 'b', subtopic: 'Cache' }),
  ];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/jpeg;base64,BBBB');
});

test('varios slides sem referenceImageIndex do MESMO subtopico reusam a mesma imagem padrao (consistencia)', async () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', title: 'DNS parte 1' }),
    makeSlide({ id: 'b', subtopic: 'DNS', title: 'DNS parte 2' }),
  ];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, result[1].referenceImageDataUri);
});

test('slide sem subtopic mas com title usa o title como chave de agrupamento (Gemini nem sempre preenche subtopic)', async () => {
  const slides = [makeSlide({ id: 'a', subtopic: undefined, title: 'Arquitetura Cliente-Servidor' } as any)];
  const generator: ImageGenerator = async () => ({ mimeType: 'image/png', dataBase64: 'GERADA' });

  const result = await resolveSlideIllustrations(slides, [], generator);

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,GERADA');
});

test('slide sem subtopic e sem title (nenhuma chave de agrupamento) e sem attachments fica sem imagem, sem quebrar', async () => {
  const slides = [makeSlide({ id: 'a', subtopic: undefined, title: undefined } as any)];

  const result = await resolveSlideIllustrations(slides, [], neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, undefined);
});

test('subtopico diferente repetindo indice ja usado e redirecionado pra imagem nunca usada', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'cache-1', subtopic: 'Cache', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  // indice 0 ja usado por DNS - Cache (subtopico diferente) e redirecionado
  // pra proxima imagem nunca usada (indice 1), nao repete a mesma
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,BBBB');
});

test('mesmo subtopico reaparecendo com o mesmo indice NAO e redirecionado (reuso legitimo)', async () => {
  const doisAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
  ];
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'dns-2', subtopic: 'DNS', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, doisAttachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('todas as imagens ja usadas: mantem o indice repetido (sem alternativa disponivel)', async () => {
  const doisAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
  ];
  const slides = [
    makeSlide({ id: 'a-1', subtopic: 'A', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'b-1', subtopic: 'B', referenceImageIndex: 1 } as any),
    makeSlide({ id: 'c-1', subtopic: 'C', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, doisAttachments, neverCalledGenerator());

  // so 2 imagens existem e as duas ja foram usadas (A->0, B->1) - o slide C
  // repete o indice 0 mesmo, nao ha pra onde redirecionar
  assert.equal(result[2].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('mais attachments do professor que slides do deck: as imagens que sobram viram additionalReferenceImageDataUris em vez de nunca aparecer', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const slides = [
    makeSlide({ id: 'a-1', subtopic: 'A' }),
    makeSlide({ id: 'b-1', subtopic: 'B' }),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, neverCalledGenerator());

  // Indices 0 e 1 vao pra imagem primaria de cada slide (round-robin padrao)
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,BBBB');
  // Indice 2 (CCCC) nunca foi escolhido pelo round-robin principal - nao
  // pode sumir, entao vira imagem adicional de algum slide elegivel
  const allAdditional = result.flatMap((s) => (s as any).additionalReferenceImageDataUris || []);
  assert.deepEqual(allAdditional, ['data:image/png;base64,CCCC']);
});

test('additionalReferenceImageDataUris nunca e atribuido a cover/epic_conclusion/reward_certificate (nao renderizam imagem)', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const slides = [
    makeSlide({ id: 'cover-1', type: 'cover' as any, subtopic: 'Capa' }),
    makeSlide({ id: 'content-1', subtopic: 'Conteudo' }),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, neverCalledGenerator());

  const coverSlide = result.find((s) => s.id === 'cover-1');
  const contentSlide = result.find((s) => s.id === 'content-1');
  assert.equal((coverSlide as any).additionalReferenceImageDataUris, undefined);
  assert.deepEqual((contentSlide as any).additionalReferenceImageDataUris, ['data:image/png;base64,CCCC']);
});

test('mais de um attachment sobrando: distribui em round-robin entre os slides elegiveis (nao empilha tudo no primeiro)', async () => {
  const quatroAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
    { mimeType: 'image/png', dataBase64: 'DDDD', name: 'd.png' },
  ];
  const slides = [
    makeSlide({ id: 'a-1', subtopic: 'A' }),
    makeSlide({ id: 'b-1', subtopic: 'B' }),
  ];

  const result = await resolveSlideIllustrations(slides, quatroAttachments, neverCalledGenerator());

  assert.deepEqual((result[0] as any).additionalReferenceImageDataUris, ['data:image/png;base64,CCCC']);
  assert.deepEqual((result[1] as any).additionalReferenceImageDataUris, ['data:image/png;base64,DDDD']);
});

test('redirecionamento por diversidade tambem se aplica com restyleReferenceImage=true', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/jpeg', dataBase64: 'BBBB', name: 'b.jpg' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const calls: Array<{ referenceImage?: { mimeType: string; data: string } }> = [];
  const generator: ImageGenerator = async (params) => {
    calls.push(params);
    return { mimeType: 'image/png', dataBase64: 'ESTILIZADA' };
  };
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'cache-1', subtopic: 'Cache', referenceImageIndex: 0, restyleReferenceImage: true } as any),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, generator);

  // o restyle deve ter usado a imagem REDIRECIONADA (indice 1, jpeg/BBBB),
  // nao a originalmente escolhida pelo modelo (indice 0, png/AAAA)
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].referenceImage, { mimeType: 'image/jpeg', data: 'BBBB' });
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,ESTILIZADA');
});

test('extractGeneratedImagesBySubtopic: 1a imagem gerada por subtopico unico', () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', referenceImageDataUri: 'data:image/png;base64,AAA' } as any),
    makeSlide({ id: 'b', subtopic: 'Cache', referenceImageDataUri: 'data:image/jpeg;base64,BBB' } as any),
  ];

  assert.deepEqual(extractGeneratedImagesBySubtopic(slides), {
    DNS: 'data:image/png;base64,AAA',
    Cache: 'data:image/jpeg;base64,BBB',
  });
});

test('extractGeneratedImagesBySubtopic: mantem a PRIMEIRA imagem quando o mesmo subtopico repete (Parte 1/2)', () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', referenceImageDataUri: 'data:image/png;base64,PRIMEIRA' } as any),
    makeSlide({ id: 'b', subtopic: 'DNS', referenceImageDataUri: 'data:image/png;base64,SEGUNDA' } as any),
  ];

  assert.deepEqual(extractGeneratedImagesBySubtopic(slides), { DNS: 'data:image/png;base64,PRIMEIRA' });
});

test('extractGeneratedImagesBySubtopic: exclui SVG generico de ultimo recurso', () => {
  const slides = [
    makeSlide({
      id: 'a',
      subtopic: 'DNS',
      referenceImageDataUri: 'data:image/svg+xml;base64,PHN2Zy4uLg==',
    } as any),
  ];

  assert.deepEqual(extractGeneratedImagesBySubtopic(slides), {});
});

test('extractGeneratedImagesBySubtopic: ignora slide sem subtopic ou sem imagem', () => {
  const slides = [
    makeSlide({ id: 'a' } as any),
    makeSlide({ id: 'b', subtopic: 'DNS' } as any),
  ];

  assert.deepEqual(extractGeneratedImagesBySubtopic(slides), {});
});

test('esgotadas as imagens do professor, slide sem escolha do Gemini fica SEM foto (nao repete a primeira em todo o deck)', async () => {
  const umAttachment = [{ mimeType: 'image/png', dataBase64: 'AAAA', name: 'foto-especifica.png' }];
  const slides = [
    makeSlide({ id: 'a', subtopic: 'Sockets' }),
    makeSlide({ id: 'b', subtopic: 'Portas' }),
    makeSlide({ id: 'c', subtopic: 'Protocolos' }),
  ];

  const result = await resolveSlideIllustrations(slides, umAttachment, neverCalledGenerator());

  // A unica imagem cobre o 1o subtopico; os outros dois nao recebem a mesma
  // foto so pra ter alguma imagem - o contexto dela nao vale pra tudo.
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, undefined);
  assert.equal(result[2].referenceImageDataUri, undefined);
});

test('enquanto houver imagem nunca usada, cada subtopico novo recebe a sua (cobertura antes de repeticao)', async () => {
  const tres = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const slides = [
    makeSlide({ id: 'a', subtopic: 'S1' }),
    makeSlide({ id: 'b', subtopic: 'S2' }),
    makeSlide({ id: 'c', subtopic: 'S3' }),
    makeSlide({ id: 'd', subtopic: 'S4' }),
  ];

  const result = await resolveSlideIllustrations(slides, tres, neverCalledGenerator());

  assert.deepEqual(
    result.map((s) => s.referenceImageDataUri),
    ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB', 'data:image/png;base64,CCCC', undefined],
  );
});

test('slide sem escolha do Gemini do MESMO subtopico que ja tem imagem continua reusando (Parte 1/2 nao perde a imagem)', async () => {
  const umAttachment = [{ mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' }];
  const slides = [
    makeSlide({ id: 'a', subtopic: 'Sockets', title: 'Sockets — Parte 1/2' }),
    makeSlide({ id: 'b', subtopic: 'Outro' }),
    makeSlide({ id: 'c', subtopic: 'Sockets', title: 'Sockets — Parte 2/2' }),
  ];

  const result = await resolveSlideIllustrations(slides, umAttachment, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, undefined);
  assert.equal(result[2].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('escolha explicita do Gemini continua valendo mesmo com todas as imagens ja usadas', async () => {
  const umAttachment = [{ mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' }];
  const slides = [
    makeSlide({ id: 'a', subtopic: 'S1' }),
    makeSlide({ id: 'b', subtopic: 'S2', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, umAttachment, neverCalledGenerator());

  // O modelo VIU o conteudo e escolheu essa imagem pro slide - isso e
  // contexto, nao preenchimento automatico, e segue respeitado.
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('nao tenta reestilizar imagem em formato que o modelo nao aceita (usa a original direto)', async () => {
  const gif = [{ mimeType: 'image/gif', dataBase64: 'GIFGIF', name: 'animado.gif' }];
  const slides = [makeSlide({ id: 'a', subtopic: 'S1', referenceImageIndex: 0, restyleReferenceImage: true } as any)];

  const result = await resolveSlideIllustrations(slides, gif, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/gif;base64,GIFGIF');
});
