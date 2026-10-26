/** Diagnóstico local da issue #1. Não acessa Supabase nem altera dados.
 * Executar na raiz: node scripts/auditoria-issue-1.mjs
 * Requer as dependências já instaladas de frontend/.
 * Registra o comportamento observado; não prescreve um novo instrumento.
 */
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../frontend/", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});

try {
  const instrument = await server.ssrLoadModule("/src/features/signup/brainhex.ts");
  const ranking = await server.ssrLoadModule("/src/features/signup/brainhexOrdenacao.ts");
  const prior = await server.ssrLoadModule("/src/features/signup/priorDoPerfil.ts");
  const scoring = await server.ssrLoadModule("/src/features/signup/brainhexScoring.ts");
  const update = await server.ssrLoadModule("/src/features/signup/atualizacaoDoPerfil.ts");
  const { BRAINHEX_QUESTIONS, calculateAxisScores, isAllAnswered } = instrument;
  const order = ranking.PERFIS_EM_ORDEM;
  const answers = Object.fromEntries(BRAINHEX_QUESTIONS.map(q => [q.id, q.reverse ? 0 : 5]));
  const flat = Object.fromEntries(order.map(key => [key, 0]));
  const result = prior.computarPerfil({ answers, ordenacao: order });
  const reversed = prior.computarPerfil({ answers, ordenacao: [...order].reverse() });
  const counts = {};
  for (const q of BRAINHEX_QUESTIONS) counts[q.axis] = (counts[q.axis] ?? 0) + 1;

  // Contrafactual aritmético apenas: soma/4 contra média, mantendo os demais
  // passos. A diferença revela que a unidade muda o peso efetivo e o softmax.
  const weights = { seeker: 1.25, survivor: 1, daredevil: 1.5, mastermind: 1.25, conqueror: 1.25, socializer: 1.15, achiever: 1.2 };
  const fixture = Object.fromEntries(BRAINHEX_QUESTIONS.map((q, i) => [q.id, (i * 7 + Math.floor(i / 4)) % 6]));
  const mapped = instrument.mapAxisToProfiles(calculateAxisScores(fixture));
  const centered = scoring.centrarPorRespondente(Object.fromEntries(order.map(k => [k, mapped[k] / weights[k]])));
  const combine = scale => ranking.combinarPrior({
    escalaCentrada: scale,
    ordenacao: ranking.pontuarOrdenacao(order),
  });

  console.log(JSON.stringify({
    itens: BRAINHEX_QUESTIONS.length,
    itensPorEixo: counts,
    itensReversos: BRAINHEX_QUESTIONS.filter(q => q.reverse).length,
    respostasComMesmaPreferenciaEmTodosOsEixos: {
      respostas: "diretos=5; reversos=0",
      escoresDosEixos: calculateAxisScores(answers),
      ordem: order,
      confianca: result.confianca,
      concordancia: result.concordancia,
      percentual: result.percentual,
      ordemInvertida: { confianca: reversed.confianca, concordancia: reversed.concordancia },
    },
    correlacaoDeEscalaConstante: {
      ordemDoCodigo: ranking.concordanciaEntreMetodos(flat, ranking.pontuarOrdenacao(order)),
      ordemInvertida: ranking.concordanciaEntreMetodos(flat, ranking.pontuarOrdenacao([...order].reverse())),
    },
    somaVersusMedia: {
      respostas: fixture,
      escalaCentradaAtual: centered,
      afinidadeAtual: prior.afinidadeEmPercentual(combine(centered).afinidade),
      afinidadeSeEscalaFosseMedia: prior.afinidadeEmPercentual(combine(Object.fromEntries(order.map(k => [k, centered[k] / 4]))).afinidade),
    },
    validacaoDeRespostas: {
      todosNaN: isAllAnswered(Object.fromEntries(BRAINHEX_QUESTIONS.map(q => [q.id, NaN]))),
      todos99: isAllAnswered(Object.fromEntries(BRAINHEX_QUESTIONS.map(q => [q.id, 99]))),
    },
    semObservacoesComConfiancaUm: update.atualizarPerfil({ prior: { afinidade: result.afinidade, confianca: 1 }, observacoes: [] }).confianca,
  }, null, 2));
} finally {
  await server.close();
}
