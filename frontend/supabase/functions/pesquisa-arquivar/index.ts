// Edge Function `pesquisa-arquivar` (#17): copia para o R2 a telemetria de quem consentiu pesquisa.
//
// Quem chama e' o pg_cron (`pesquisa_arquivo_disparar`, a cada 10 min), com o header
// `x-trailup-segredo`. Duas fases por rodada:
//
// 1. arquivo: pergunta ao banco o que falta (`pesquisa_arquivo_pendentes`), sobe cada registro em
//    `pesquisa/...` e registra o caminho (`pesquisa_arquivo_registrar`). O que falhar fica pendente
//    e volta na proxima rodada: nada e' registrado sem o upload ter dado certo.
// 2. copia anonima (`20261104_03`): para cada objeto de quem pediu exclusao, grava a copia em
//    `pesquisa/anonimo/...` e so' entao conclui o pedido - o banco apaga o sal e poe o identificavel
//    na fila de exclusao.
//
// Fica fora da API pela regra de fronteira: arquivar nao tem modelo de linguagem no meio. As
// credenciais do R2 ja' moram nos secrets das Edge Functions (ver `storage-upload-url`).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { presignR2GetUrl } from "../storage-redirect/r2Presign.ts";
import { anonimizarObjetoDoArquivo } from "./anonimizar.ts";
import {
  type Arquivado,
  type Origem,
  ORIGENS,
  caminhoDoArquivo,
  lerPendente,
  limiteDoPedido,
  montarObjeto,
  ponteiroDoPayload,
  segredoConfere,
} from "./arquivo.ts";

const JANELA_SEGUNDOS = 300;
const VALIDADE_SEGUNDOS = 600;
const PARALELO = 4;
const REGISTRO_POR_CHAMADA = 200;
const ANONIMIZACOES_POR_RODADA = 100;

function json(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  if (!segredoConfere(req.headers.get("x-trailup-segredo"), Deno.env.get("PESQUISA_ARQUIVO_SEGREDO"))) {
    return json(401, { error: "Segredo ausente ou invalido." });
  }

  const contaR2 = Deno.env.get("R2_ACCOUNT_ID");
  const chaveR2 = Deno.env.get("R2_ACCESS_KEY_ID");
  const segredoR2 = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketR2 = Deno.env.get("R2_BUCKET");
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!contaR2 || !chaveR2 || !segredoR2 || !bucketR2 || !supabaseUrl || !chaveServico) {
    console.error("[pesquisa-arquivar] segredos ausentes no ambiente");
    return json(500, { error: "Arquivo da pesquisa nao configurado." });
  }

  const rpc = async (nome: string, args: Record<string, unknown>): Promise<unknown> => {
    const resposta = await fetch(`${supabaseUrl}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: {
        apikey: chaveServico,
        Authorization: `Bearer ${chaveServico}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!resposta.ok) throw new Error(`${nome}: HTTP ${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
    return resposta.json();
  };

  const assinar = (key: string, metodo: "GET" | "PUT") =>
    presignR2GetUrl({
      accountId: contaR2,
      accessKeyId: chaveR2,
      secretAccessKey: segredoR2,
      bucket: bucketR2,
      key,
      agoraMs: Date.now(),
      janelaSegundos: JANELA_SEGUNDOS,
      validadeSegundos: VALIDADE_SEGUNDOS,
      metodo,
    });

  let corpo: unknown = {};
  try {
    corpo = await req.json();
  } catch {
    // Corpo vazio vale o limite padrao.
  }

  let linhas: unknown;
  try {
    linhas = await rpc("pesquisa_arquivo_pendentes", { p_limite: limiteDoPedido(corpo) });
  } catch (err) {
    console.error("[pesquisa-arquivar] pendentes:", err);
    return json(502, { error: "Nao consegui ler o que falta arquivar." });
  }
  const pendentes = (Array.isArray(linhas) ? linhas : []).map(lerPendente).filter((p) => p !== null);

  const arquivados: Arquivado[] = [];
  let falhas = 0;
  const agora = new Date();

  const arquivar = async (p: NonNullable<ReturnType<typeof lerPendente>>) => {
    try {
      let bruto: unknown | undefined;
      const ponteiro = ponteiroDoPayload(p.registro);
      if (ponteiro) {
        const lido = await fetch(await assinar(ponteiro, "GET"));
        if (!lido.ok) throw new Error(`GET ${ponteiro}: HTTP ${lido.status}`);
        bruto = await lido.json();
      }
      const caminho = caminhoDoArquivo(p);
      const gravado = await fetch(await assinar(caminho, "PUT"), {
        method: "PUT",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: montarObjeto(p, bruto, agora),
      });
      if (!gravado.ok) throw new Error(`PUT ${caminho}: HTTP ${gravado.status}`);
      arquivados.push({ origem: p.origem, origem_id: p.origem_id, aluno_id: p.aluno_id, bucket: bucketR2, caminho });
    } catch (err) {
      falhas += 1;
      console.warn(`[pesquisa-arquivar] ${p.origem} ${p.origem_id}:`, err);
    }
  };

  for (let i = 0; i < pendentes.length; i += PARALELO) {
    await Promise.all(pendentes.slice(i, i + PARALELO).map(arquivar));
  }

  const registros: unknown[] = [];
  let erroAoRegistrar = false;
  for (let i = 0; i < arquivados.length && !erroAoRegistrar; i += REGISTRO_POR_CHAMADA) {
    try {
      registros.push(await rpc("pesquisa_arquivo_registrar", { p_itens: arquivados.slice(i, i + REGISTRO_POR_CHAMADA) }));
    } catch (err) {
      // O objeto ja' esta no R2 e o caminho e' deterministico: a proxima rodada sobrescreve e registra.
      console.error("[pesquisa-arquivar] registrar:", err);
      erroAoRegistrar = true;
    }
  }

  const anonimizacao = await anonimizarPedidos();

  return json(erroAoRegistrar ? 502 : 200, {
    pendentes: pendentes.length,
    arquivados: arquivados.length,
    falhas,
    registros,
    erro_ao_registrar: erroAoRegistrar,
    anonimizacao,
  });

  // Fase 2. A ordem e' o que protege o aluno: o identificavel so' vai para a fila depois que a
  // copia anonima existe - ou que o banco desistiu dela (`pesquisa_anonimizacao_vencidas`, 7 dias).
  async function anonimizarPedidos(): Promise<Record<string, unknown>> {
    let linhas: unknown;
    try {
      linhas = await rpc("pesquisa_anonimizacao_pendentes", { p_limite: ANONIMIZACOES_POR_RODADA });
    } catch (err) {
      console.error("[pesquisa-arquivar] anonimizacao_pendentes:", err);
      return { erro: "pendentes" };
    }
    const pedidos = (Array.isArray(linhas) ? linhas : []).filter(
      (l): l is { id: number; origem: Origem; bucket: string; caminho: string; sal: string; perfil: string | null } =>
        !!l && typeof l === "object" && typeof (l as { id?: unknown }).id === "number" &&
        ORIGENS.includes((l as { origem?: Origem }).origem as Origem) &&
        typeof (l as { caminho?: unknown }).caminho === "string" && typeof (l as { sal?: unknown }).sal === "string",
    );

    const concluidos: number[] = [];
    const falhos: { id: number; erro: string }[] = [];
    let copias = 0;
    let ausentes = 0;

    const um = async (p: (typeof pedidos)[number]) => {
      try {
        if (p.bucket !== bucketR2) throw new Error(`bucket ${p.bucket} diferente do ambiente`);
        const lido = await fetch(await assinar(p.caminho, "GET"));
        if (lido.status === 404) {
          // Nada a copiar: o identificavel ja' nao existe. Concluir so' tira o pedido (e o sal).
          ausentes += 1;
          concluidos.push(p.id);
          return;
        }
        if (!lido.ok) throw new Error(`GET: HTTP ${lido.status}`);
        const anonimo = await anonimizarObjetoDoArquivo(await lido.json(), {
          origem: p.origem,
          sal: p.sal,
          perfil: p.perfil,
        });
        const gravado = await fetch(await assinar(anonimo.caminho, "PUT"), {
          method: "PUT",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: anonimo.corpo,
        });
        if (!gravado.ok) throw new Error(`PUT: HTTP ${gravado.status}`);
        copias += 1;
        concluidos.push(p.id);
      } catch (err) {
        // Sem caminho nem sal no log: os dois juntos ligam a copia anonima ao aluno.
        falhos.push({ id: p.id, erro: err instanceof Error ? err.message : String(err) });
      }
    };

    for (let i = 0; i < pedidos.length; i += PARALELO) {
      await Promise.all(pedidos.slice(i, i + PARALELO).map(um));
    }

    try {
      if (concluidos.length > 0) await rpc("pesquisa_anonimizacao_concluir", { p_ids: concluidos });
      if (falhos.length > 0) await rpc("pesquisa_anonimizacao_falhou", { p_itens: falhos });
    } catch (err) {
      // A copia anonima ja' existe e o caminho dela e' deterministico: a proxima rodada refaz e conclui.
      console.error("[pesquisa-arquivar] anonimizacao_concluir:", err);
      return { pedidos: pedidos.length, copias, ausentes, falhas: falhos.length, erro: "concluir" };
    }
    return { pedidos: pedidos.length, copias, ausentes, falhas: falhos.length };
  }
});
