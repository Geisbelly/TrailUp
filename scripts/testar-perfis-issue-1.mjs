/**
 * Aceitação local do cálculo de perfis; não acessa Supabase nem cria alunos.
 * Na raiz: node scripts/testar-perfis-issue-1.mjs
 * stdout: JSON reproduzível; exit 1: pelo menos um critério não foi atendido.
 * Separado do Vitest porque audita também defeitos conhecidos ainda abertos.
 * Não usa testes invertidos (.fails) e não declara defeitos como aprovações.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  root: fileURLToPath(new URL("../frontend/", import.meta.url)),
  configFile: false,
  logLevel: "silent",
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});
const criterios = {};
function check(nome, passou, evidencia) {
  const grupo = criterios[nome] ??= { aprovados: 0, falhas: 0, exemplos: [] };
  if (passou) grupo.aprovados++;
  else {
    grupo.falhas++;
    if (grupo.exemplos.length < 2) grupo.exemplos.push(evidencia);
  }
}
const perto = (a, b) => Math.abs(a - b) < 1e-10;
function* permutacoes(itens) {
  if (!itens.length) { yield []; return; }
  for (let i = 0; i < itens.length; i++) {
    for (const cauda of permutacoes(itens.filter((_, j) => i !== j))) {
      yield [itens[i], ...cauda];
    }
  }
}

try {
  const instrument = await server.ssrLoadModule("/src/features/signup/brainhex.ts");
  const ranking = await server.ssrLoadModule("/src/features/signup/brainhexOrdenacao.ts");
  const prior = await server.ssrLoadModule("/src/features/signup/priorDoPerfil.ts");
  const measure = await server.ssrLoadModule("/src/features/signup/medidaDoPerfil.ts");
  const update = await server.ssrLoadModule("/src/features/signup/atualizacaoDoPerfil.ts");
  const missions = await server.ssrLoadModule(`/@fs${fileURLToPath(new URL("../mobile/src/services/missoes/missaoModel.ts", import.meta.url))}`);
  // Oráculos explícitos: expectativas não são geradas a partir do mapeamento testado.
  const perfis = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];
  const eixos = {
    curiosity: ["c1", "c2", "c3", "c4"], challenge: ["ch1", "ch2", "ch3", "ch4"],
    risk: ["r1", "r2", "r3", "r4"], mastery: ["m1", "m2", "m3", "m4"],
    competition: ["cp1", "cp2", "cp3", "cp4"], social: ["s1", "s2", "s3", "s4"],
    completion: ["cc1", "cc2", "cc3", "cc4"], immersion: ["i1", "i2", "i3", "i4"],
  };
  const eixoDoPerfil = { seeker: "curiosity", survivor: "challenge", daredevil: "risk",
    mastermind: "mastery", conqueror: "competition", socializer: "social", achiever: "completion" };
  const ids = Object.values(eixos).flat();
  function verificarEscolhasNasMissoes(r, contexto) {
    const oferecidos = instrument.resolveRepresentativeBrainHexResults(r.ordenado).map(p => p.key);
    const linhas = Object.entries(r.percentual).map(([nome, afinidade]) => ({ nome, afinidade }));
    for (const escolhido of oferecidos) {
      const aceito = missions.perfilDaMissao(linhas, escolhido);
      check("perfil_oferecido_no_cadastro_preservado_nas_missoes", aceito === escolhido,
        { ...contexto, oferecidos, escolhido, aceito, percentual: r.percentual });
    }
  }
  function respostas(niveis = {}, padrao = 0) {
    return Object.fromEntries(Object.entries(eixos).flatMap(([eixo, itens]) =>
      itens.map((id, i) => [id, i === 3 ? 5 - (niveis[eixo] ?? padrao) : (niveis[eixo] ?? padrao)])));
  }
  check("instrumento_preserva_ids_e_perfis", JSON.stringify([...ids].sort()) ===
    JSON.stringify(instrument.BRAINHEX_QUESTIONS.map(q => q.id).sort()) &&
    JSON.stringify(perfis) === JSON.stringify(ranking.PERFIS_EM_ORDEM), { ids });

  for (let nivel = 0; nivel <= 5; nivel++) {
    const scores = instrument.calculateAxisScores(respostas({}, nivel));
    // O contrato ATUAL soma quatro itens. Isto não aprova a unidade de mistura com ranking.
    check("polaridade_direta_e_reversa", Object.values(scores).every(v => perto(v, nivel * 4)), { nivel, scores });
  }

  const ordens = [...permutacoes(perfis)];
  const matriz = [];
  for (const perfil of perfis) {
    const answers = respostas({ [eixoDoPerfil[perfil]]: 5 });
    const ordenacao = [perfil, ...perfis.filter(p => p !== perfil)];
    const r = prior.computarPerfil({ answers, ordenacao });
    matriz.push({ esperado: perfil, dominante: r.dominante, percentual: r.percentual, confianca: r.confianca });
    check("sete_perfis_com_preferencia_explicita", r.dominante === perfil &&
      r.percentual[perfil] === Math.max(...Object.values(r.percentual)), matriz.at(-1));
    verificarEscolhasNasMissoes(r, { perfilIsolado: perfil });
    for (const ordem of ordens) {
      const result = prior.computarPerfil({ answers, ordenacao: ordem });
      check("preferencia_maxima_isolada_resiste_a_ordenacao", result.dominante === perfil,
        { perfil, ordem, dominante: result.dominante });
    }
    let anterior = -Infinity;
    for (let nivel = 0; nivel <= 5; nivel++) {
      const result = prior.computarPerfil({ answers: respostas({ [eixoDoPerfil[perfil]]: nivel }, 2), ordenacao });
      check("aumentar_preferencia_aumenta_afinidade_bruta", result.afinidade[perfil] > anterior,
        { perfil, nivel, anterior, atual: result.afinidade[perfil] });
      anterior = result.afinidade[perfil];
    }
  }

  const constantes = respostas({}, 5);
  const referencia = prior.computarPerfil({ answers: constantes, ordenacao: perfis });
  let minima = Infinity, maxima = -Infinity;
  for (const ordem of ordens) {
    const r = prior.computarPerfil({ answers: constantes, ordenacao: ordem });
    minima = Math.min(minima, r.confianca); maxima = Math.max(maxima, r.confianca);
    check("escala_constante_respeita_preferencia_declarada", r.dominante === ordem[0], { ordem, dominante: r.dominante });
    check("escala_constante_nao_inventa_diferencas_de_confianca", perto(r.confianca, referencia.confianca),
      { ordem, confianca: r.confianca, referencia: referencia.confianca, concordancia: r.concordancia });
  }
  const pontuacao = ranking.pontuarOrdenacao(perfis);
  const constante = Object.fromEntries(perfis.map(p => [p, 0]));
  const rhoConstante = ranking.concordanciaEntreMetodos(constante, pontuacao);
  check("spearman_constante_nao_estimavel", rhoConstante === null || Number.isNaN(rhoConstante), { observado: rhoConstante });
  // Postos médios [1.5,1.5,3,4,5,6,7] vs [1,2,3,4,5,6,7]:
  // Pearson dos postos = 27.5 / sqrt(27.5 * 28), não 1.
  const empatada = Object.fromEntries(perfis.map((p, i) => [p, [4, 4, 3, 2, 1, 0, -1][i]]));
  const rhoEmpate = ranking.concordanciaEntreMetodos(empatada, pontuacao);
  const rhoEsperado = 27.5 / Math.sqrt(27.5 * 28);
  check("spearman_empates_usa_postos_medios", perto(rhoEmpate, rhoEsperado), { esperado: rhoEsperado, observado: rhoEmpate });
  for (const ordem of [perfis, [...perfis].reverse()]) {
    const esperado = ordem === perfis ? 1 : -1;
    check("spearman_sem_empates", perto(ranking.concordanciaEntreMetodos(pontuacao, ranking.pontuarOrdenacao(ordem)), esperado), { esperado });
  }

  for (const valor of [NaN, Infinity, -Infinity, -1, 6, 99, 2.5]) {
    // Apenas UM item inválido entre os demais completos e válidos.
    check("rejeita_resposta_fora_da_escala_discreta", !instrument.isAllAnswered({ ...constantes, c1: valor }), { valor: String(valor) });
  }
  const incompleto = { ...constantes }; delete incompleto.c1;
  check("rejeita_questionario_incompleto", !instrument.isAllAnswered(incompleto), { ausente: "c1" });
  check("aceita_questionario_completo_valido", instrument.isAllAnswered(constantes), {});
  for (const ordem of [perfis.slice(1), [...perfis.slice(0, 6), "seeker"], [...perfis.slice(0, 6), "inexistente"]]) {
    let rejeitou = false;
    try { prior.computarPerfil({ answers: constantes, ordenacao: ordem }); } catch (e) { rejeitou = e instanceof ranking.OrdenacaoInvalida; }
    check("rejeita_ordenacao_invalida", rejeitou, { ordem });
  }

  // PRNG inteiro com semente fixa, independente do embaralhamento do produto.
  let seed = 20261024;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let caso = 0; caso < 5000; caso++) {
    const answers = Object.fromEntries(ids.map(id => [id, Math.floor(random() * 6)]));
    const ordenacao = ordens[Math.floor(random() * ordens.length)];
    const r = prior.computarPerfil({ answers, ordenacao });
    const valores = Object.values(r.percentual);
    const evidencia = { caso, answers, ordenacao, dominante: r.dominante, afinidade: r.afinidade, percentual: r.percentual };
    check("vetor_valido_finito_soma_100", valores.length === 7 && valores.every(v => Number.isInteger(v) && v >= 1 && v <= 100) &&
      valores.reduce((s, v) => s + v, 0) === 100 && Object.values(r.afinidade).every(Number.isFinite) &&
      Number.isFinite(r.confianca) && r.confianca >= 0 && r.confianca <= 1, evidencia);
    check("dominante_exibido_tem_percentual_maximo", r.percentual[r.dominante] === Math.max(...valores), evidencia);
    check("percentual_nao_inverte_ordem_bruta", perfis.every(a => perfis.every(b =>
      r.afinidade[a] <= r.afinidade[b] + 1e-10 || r.percentual[a] >= r.percentual[b])), evidencia);
    verificarEscolhasNasMissoes(r, { caso, answers, ordenacao });
    const linha = measure.montarMedidaDoPerfil({ alunoId: "aluno-sintetico-auditoria", ordenacao,
      afinidade: r.percentual, confianca: r.confianca, concordancia: r.concordancia, qualidade: r.qualidade });
    const roundTrip = JSON.parse(JSON.stringify(linha));
    check("serializacao_preserva_vetor_e_ordem", JSON.stringify(roundTrip.afinidade) === JSON.stringify(r.percentual) &&
      JSON.stringify(roundTrip.ordenacao) === JSON.stringify(ordenacao) &&
      Math.abs(roundTrip.confianca - r.confianca) <= 0.000500001, evidencia);
  }
  for (const confianca of [0, 0.15, 0.5, 0.999, 1]) {
    const original = { afinidade: referencia.afinidade, confianca };
    const result = update.atualizarPerfil({ prior: original, observacoes: [] });
    check("sem_observacoes_preserva_prior", perto(result.confianca, confianca) &&
      perfis.every(p => perto(result.afinidade[p], original.afinidade[p])) && Object.keys(result.movimento).length === 0,
    { confiancaAntes: confianca, confiancaDepois: result.confianca });
  }

  const grupos = Object.values(criterios);
  const resumo = { criterios: grupos.length, criteriosAprovados: grupos.filter(g => g.falhas === 0).length,
    criteriosComFalhas: grupos.filter(g => g.falhas > 0).length,
    verificacoes: grupos.reduce((s, g) => s + g.aprovados + g.falhas, 0),
    falhas: grupos.reduce((s, g) => s + g.falhas, 0) };
  console.log(JSON.stringify({ revisao: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
    instrumento: measure.VERSAO_DO_INSTRUMENTO, semente: 20261024, ordens: ordens.length,
    casosAleatorios: 5000, resumo, matriz, confiancaComEscalaConstante: { minima, maxima }, criterios }, null, 2));
  process.exitCode = resumo.criteriosComFalhas ? 1 : 0;
} finally {
  await server.close();
}
