import assert from 'node:assert/strict';
import test from 'node:test';

import { canSendAsGeminiInlineData } from './geminiInlineImageMimes';

test('aceita os formatos de imagem suportados pela API', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']) {
    assert.equal(canSendAsGeminiInlineData(mime), true, mime);
  }
});

test('recusa imagem em formato que a API nao aceita (derrubaria a chamada do deck inteiro)', () => {
  for (const mime of ['image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml']) {
    assert.equal(canSendAsGeminiInlineData(mime), false, mime);
  }
});

test('nao interfere em attachment que nao e imagem (pdf, audio, video, texto)', () => {
  for (const mime of ['application/pdf', 'audio/mpeg', 'video/mp4', 'text/plain']) {
    assert.equal(canSendAsGeminiInlineData(mime), true, mime);
  }
});

test('normaliza caixa e espaco em volta', () => {
  assert.equal(canSendAsGeminiInlineData('  IMAGE/PNG '), true);
  assert.equal(canSendAsGeminiInlineData('IMAGE/GIF'), false);
});

test('mime ausente nao vai como inlineData', () => {
  assert.equal(canSendAsGeminiInlineData(undefined), false);
  assert.equal(canSendAsGeminiInlineData(null), false);
  assert.equal(canSendAsGeminiInlineData(''), false);
});
