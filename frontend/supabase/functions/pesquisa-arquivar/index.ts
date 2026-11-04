// Edge Function `pesquisa-arquivar` (#17): copia para o R2 a telemetria de quem consentiu pesquisa.
//
// Quem chama e' o pg_cron (`pesquisa_arquivo_disparar`, a cada 10 min), com o header
// `x-trailup-segredo`. A funcao pergunta ao banco o que falta (`pesquisa_arquivo_pendentes`), sobe
// cada registro em `pesquisa/...` e registra o caminho (`pesquisa_arquivo_registrar`). O que falhar
// fica pendente e volta na proxima rodada: nada e' registrado sem o upload ter dado certo.
//
// Fica fora da API pela regra de fronteira: arquivar nao tem modelo de linguagem no meio. As
// credenciais do R2 ja' moram nos secrets das Edge Functions (ver `storage-upload-url`).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { presignR2GetUrl } from "../storage-redirect/r2Presign.ts";
import {
  type Arquivado,
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
  for (let i = 0; i < arquivados.length; i += REGISTRO_POR_CHAMADA) {
    try {
      registros.push(await rpc("pesquisa_arquivo_registrar", { p_itens: arquivados.slice(i, i + REGISTRO_POR_CHAMADA) }));
    } catch (err) {
      // O objeto ja' esta no R2 e o caminho e' deterministico: a proxima rodada sobrescreve e registra.
      console.error("[pesquisa-arquivar] registrar:", err);
      return json(502, { error: "Subi, mas nao consegui registrar.", subidos: arquivados.length, falhas });
    }
  }

  return json(200, { pendentes: pendentes.length, arquivados: arquivados.length, falhas, registros });
});
