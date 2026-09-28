import assert from 'node:assert/strict';
import test from 'node:test';

import { salvarSlidesCompletos } from './slidesSalvage';

test('recupera os slides fechados de uma resposta cortada no meio de um campo', () => {
  // Formato do truncamento real: o JSON para no meio de uma string, sem fechar
  // o objeto do slide 3 nem o array.
  const truncado =
    '{"deckTitle":"Aula","slides":[' +
    '{"slideNumber":1,"title":"Um"},' +
    '{"slideNumber":2,"title":"Dois"},' +
    '{"slideNumber":3,"title":"Tres","contentParagraphs":["texto que nunca fech';

  const salvos = salvarSlidesCompletos(truncado) as Array<{ slideNumber: number }>;

  assert.equal(salvos.length, 2);
  assert.deepEqual(
    salvos.map((s) => s.slideNumber),
    [1, 2],
  );
});

test('devolve o deck inteiro quando o JSON está completo', () => {
  const completo = '{"slides":[{"title":"A"},{"title":"B"}],"conclusion":"fim"}';

  assert.equal(salvarSlidesCompletos(completo).length, 2);
});

test('não se perde com chaves e colchetes dentro do texto do slide', () => {
  // O conteúdo pedagógico carrega código e JSON de exemplo: um `}` dentro de
  // string não pode encerrar o objeto do slide.
  const comChavesNoTexto =
    '{"slides":[' +
    '{"title":"Objetos","codeSnippet":"if (x) { y[0] = \\"}\\"; }"},' +
    '{"title":"Segundo"}' +
    ']}';

  const salvos = salvarSlidesCompletos(comChavesNoTexto) as Array<{ title: string }>;

  assert.deepEqual(
    salvos.map((s) => s.title),
    ['Objetos', 'Segundo'],
  );
});

test('ignora a palavra "slides" citada dentro de um texto', () => {
  const citacao =
    '{"intro":"esta aula tem \\"slides\\": muitos deles","slides":[{"title":"Real"}]}';

  const salvos = salvarSlidesCompletos(citacao) as Array<{ title: string }>;

  assert.deepEqual(
    salvos.map((s) => s.title),
    ['Real'],
  );
});

test('o caso que mais dói: corte no primeiro slide não salva nada, mas não estoura', () => {
  const semNenhumFechado = '{"slides":[{"slideNumber":1,"title":"cortado no meio';

  assert.deepEqual(salvarSlidesCompletos(semNenhumFechado), []);
});

test('texto sem array de slides não rende nada', () => {
  assert.deepEqual(salvarSlidesCompletos('{"erro":"cota esgotada"}'), []);
  assert.deepEqual(salvarSlidesCompletos(''), []);
  assert.deepEqual(salvarSlidesCompletos('lixo não-json'), []);
});

test('descarta elemento que fecha mas não é objeto de slide', () => {
  // Array aninhado ou string solta no lugar de um slide não viram slide.
  const misturado = '{"slides":[{"title":"Bom"},["nao","e","slide"]]}';

  const salvos = salvarSlidesCompletos(misturado) as Array<{ title: string }>;

  assert.deepEqual(
    salvos.map((s) => s.title),
    ['Bom'],
  );
});

test('para no fim do array e ignora objetos de outras chaves do deck', () => {
  const comOutrasChaves =
    '{"slides":[{"title":"Unico"}],"characterGuide":{"name":"Amina"}}';

  const salvos = salvarSlidesCompletos(comOutrasChaves) as Array<{ title: string }>;

  assert.deepEqual(
    salvos.map((s) => s.title),
    ['Unico'],
  );
});
