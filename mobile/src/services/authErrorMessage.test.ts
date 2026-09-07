import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage } from './authErrorMessage';

test('maps Google OAuth cancellation to a clear message', () => {
  assert.equal(
    getAuthErrorMessage(new Error('Login com Google cancelado.')),
    'Login com Google cancelado.',
  );
});

test('keeps unknown OAuth failures generic', () => {
  assert.equal(
    getAuthErrorMessage(new Error('provider denied access')),
    'Não foi possível realizar o login agora.',
  );
});
