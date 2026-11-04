// Gateway de arquivos: resolve um storage_path e REDIRECIONA para o R2.
//
// A regra que define esta funcao: **por padrao ela nunca devolve o arquivo**.
// O painel do Supabase define egress como "any outgoing traffic including
// Database, Storage, Realtime, Auth, API, Edge Functions, Pooler and Log
// Drains" - servir o byte por aqui manteria a conta identica a de antes da
// migracao, so' que com mais latencia e mais invocacoes. Por isso a resposta e'
// 302 para uma URL assinada: o cliente baixa direto do R2 e o Supabase ve ~200
// bytes por arquivo.
//
// A UNICA excecao e' `?proxy=1`, opt-in por request, para quem precisa LER o
// corpo por fetch() de outra origem - hoje so' o console do professor (markdown
// e deck HTML). O R2 nunca teve CORS configurado, entao o navegador bloqueia a
// resposta do destino do 302. Ver o bloco `if (proxy)` mais abaixo: o volume de
// verdade (mobile, midia grande) nao manda o parametro e segue no 302 puro.
//
// POSTURA DE ACESSO (Opcao A do spec 2026-08-29-r2-gateway-design.md)
//
// Nao exige autenticacao, e isso e' deliberado, nao esquecimento:
//
//   - o app baixa midia com `FileSystem.downloadAsync(url, localUri)`, sem
//     headers; exigir JWT daria 401 em toda midia;
//   - a protecao e' o caminho dificil de adivinhar + a assinatura curta. Desde
//     a #195 (20261024_09) `conteudo_aluno` e' PRIVADO: a URL publica do
//     Storage deixa de funcionar e o unico jeito de baixar sem sessao e' por
//     aqui, com URL assinada que expira no fim da janela (<= 1 h). Quem tem
//     sessao baixa pela API do Storage, sob a RLS de
//     `trailup_pode_ler_arquivo` (aluno da turma, professor da turma, dono).
//
// Risco residual aceito: quem tem um link do gateway (vazado por print/log)
// consegue uma URL nova enquanto o material existir. Fechar isso e' a Opcao B
// abaixo.
//
// O que a consulta ainda garante: so' assina caminho que EXISTE e esta' vivo.
// Sem ela a funcao assinaria qualquer chave que pedissem, virando um oraculo de
// assinatura para o bucket inteiro. Com ela, os 537 arquivos orfaos e qualquer
// chave inventada ficam de fora.
//
// Endurecer isso depois (Opcao B: JWT + RLS via security_invoker, que a view
// 20260829_01 ja suporta) exige mudar o download do mobile para mandar header,
// e confirmar que o Authorization nao vaza para o R2 no 302.
//
// LINK CURTO POR SESSAO (#632, ver link.ts). Em vez do JWT no GET, o cliente
// logado pede os links por POST (com Authorization) e o gateway so' assina o
// caminho que a RLS deixa ele ler. O GET confere `u`/`exp`/`sig` sem cabecalho.
// Transicao: link sem assinatura continua aceito ate' GATEWAY_EXIGE_LINK_ASSINADO
// = "true" (depois da versao minima do app). Link com assinatura errada ou
// vencida e' recusado desde ja'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

import { normalizarStoragePath } from "./caminho.ts";
import { inicioDaJanela, presignR2GetUrl } from "./r2Presign.ts";
import { bucketDoCaminho, urlAssinadaDoSupabase, validadeDaAssinatura } from "./destino.ts";
import { caminhosDoPedido, conferirLink, expiracaoDoLink, montarLink } from "./link.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
};

const JANELA_SEGUNDOS = 3600;
const MAX_CAMINHOS_POR_PEDIDO = 200;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * POST: links curtos para os caminhos que QUEM PEDE pode ler. A permissao e' da
 * RLS: a consulta a view (security_invoker) vai com o JWT do chamador. Caminho
 * que ele nao pode ler simplesmente nao volta - sem dizer se existe.
 */
async function emitirLinks(req: Request, segredo: string | undefined): Promise<Response> {
  if (!segredo) {
    console.error("[storage-redirect] GATEWAY_LINK_SEGREDO ausente: nao ha como assinar link");
    return erro(503, "Links do gateway indisponiveis.");
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return erro(401, "Sessao obrigatoria.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const servico = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
  const { data: sessao, error: erroSessao } = await servico.auth.getUser(token);
  if (erroSessao || !sessao?.user) return erro(401, "Sessao invalida.");

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "Corpo JSON invalido.");
  }
  const pedidos = caminhosDoPedido(corpo, MAX_CAMINHOS_POR_PEDIDO);
  if (!pedidos) return erro(400, `Envie { paths: [...] } com 1 a ${MAX_CAMINHOS_POR_PEDIDO} caminhos.`);
  const caminhos = pedidos.map(normalizarStoragePath).filter((c): c is string => c !== null);

  const comoQuemPede = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = caminhos.length
    ? await comoQuemPede.from("vw_material_storage_paths").select("storage_path").in("storage_path", caminhos)
    : { data: [], error: null };
  if (error) {
    console.error("[storage-redirect] consulta dos links falhou", error.message);
    return erro(500, "Falha ao resolver os materiais.");
  }

  const expira = expiracaoDoLink(Math.floor(Date.now() / 1000), JANELA_SEGUNDOS);
  const links: Record<string, string> = {};
  for (const linha of data ?? []) {
    const caminho = (linha as { storage_path: string }).storage_path;
    links[caminho] = await montarLink({ base: supabaseUrl, segredo, caminho, usuario: sessao.user.id, expira });
  }
  return json(200, { expira_em: expira, links });
}

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const segredoDoLink = Deno.env.get("GATEWAY_LINK_SEGREDO") || undefined;
  if (req.method === "POST") return emitirLinks(req, segredoDoLink);
  if (req.method !== "GET" && req.method !== "HEAD") return erro(405, "Use GET.");

  const parametros = new URL(req.url).searchParams;
  const caminho = normalizarStoragePath(parametros.get("path"));
  if (!caminho) return erro(400, "Parametro 'path' ausente ou invalido.");

  // Link curto (#632). Sem segredo configurado, so' o link antigo funciona:
  // assinatura que nao da' para conferir e' recusada, nunca aceita no escuro.
  const temAssinatura = parametros.has("u") || parametros.has("exp") || parametros.has("sig");
  const link = segredoDoLink
    ? await conferirLink({
      segredo: segredoDoLink,
      caminho,
      busca: parametros,
      agoraS: Math.floor(Date.now() / 1000),
      janelaS: JANELA_SEGUNDOS,
    })
    : temAssinatura ? "invalido" : "sem_assinatura";
  if (link === "invalido") return erro(403, "Link invalido.");
  if (link === "vencido") return erro(403, "Link vencido: peca um novo.");
  if (link === "sem_assinatura" && Deno.env.get("GATEWAY_EXIGE_LINK_ASSINADO") === "true") {
    return erro(401, "Link sem assinatura: peca um link com sessao.");
  }
  const proxy = parametros.get("proxy") === "1";

  const contaR2 = Deno.env.get("R2_ACCOUNT_ID");
  const chaveR2 = Deno.env.get("R2_ACCESS_KEY_ID");
  const segredoR2 = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketR2 = Deno.env.get("R2_BUCKET");
  // O bucket do Supabase NAO e o do R2: la e "conteudo_aluno", aqui e
  // "trailup". Usar o mesmo nome nos dois lados gera uma URL de fallback
  // para um bucket que nao existe - e como o fallback so entra quando o
  // objeto ainda nao foi copiado, o erro so apareceria em producao.
  const bucketSupabase = Deno.env.get("SUPABASE_BUCKET") ?? "conteudo_aluno";
  if (!contaR2 || !chaveR2 || !segredoR2 || !bucketR2) {
    // Falta de segredo e' erro de deploy, nao do chamador - e nao pode virar
    // 404, que mandaria o cliente concluir que o material sumiu.
    console.error("[storage-redirect] segredos do R2 ausentes no ambiente");
    return erro(500, "Gateway de arquivos nao configurado.");
  }

  // Service role: a checagem aqui e' de EXISTENCIA do caminho, nao de permissao
  // (ver a nota de postura acima). Com a chave anonima a view devolveria vazio
  // para todo mundo, porque ela e' security_invoker.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("vw_material_storage_paths")
    .select("storage_path")
    .eq("storage_path", caminho)
    .limit(1);

  if (error) {
    console.error("[storage-redirect] consulta falhou", error.message);
    return erro(500, "Falha ao resolver o material.");
  }
  if (!data || data.length === 0) return erro(404, "Material nao encontrado.");

  const agoraMs = Date.now();
  const assinar = (metodo: "GET" | "HEAD") =>
    presignR2GetUrl({
      accountId: contaR2,
      accessKeyId: chaveR2,
      secretAccessKey: segredoR2,
      bucket: bucketR2,
      key: caminho,
      agoraMs,
      janelaSegundos: JANELA_SEGUNDOS,
      metodo,
    });

  // O material vive nos DOIS lugares. Prefere o R2, que nao cobra egress, e cai
  // no Supabase quando o objeto ainda nao foi copiado - ver destino.ts.
  //
  // E' esse fallback que desacopla a troca das URLs da copia: o gateway responde
  // certo para arquivo copiado e para arquivo ainda nao copiado, entao nenhum
  // dos dois passos precisa esperar o outro.
  // O 302 pode ser cacheado ate' o fim da janela: dentro dela a assinatura e' a
  // mesma para todo mundo, entao `public` vale e poupa invocacao.
  const fimDaJanela = (inicioDaJanela(agoraMs, JANELA_SEGUNDOS) + JANELA_SEGUNDOS) * 1000;
  const segundosRestantes = Math.max(1, Math.floor((fimDaJanela - agoraMs) / 1000));

  // Fallback: URL ASSINADA do Storage (o bucket e' privado desde a #195), com
  // validade que cobre o cache do 302. Nunca a URL publica.
  const urlDoSupabase = () =>
    urlAssinadaDoSupabase(
      Deno.env.get("SUPABASE_URL") ?? "",
      async (bucket, chave, segundos) => {
        const { data, error: erroAssinatura } = await supabase.storage
          .from(bucket)
          .createSignedUrl(chave, segundos);
        return { signedUrl: data?.signedUrl ?? null, erro: erroAssinatura?.message ?? null };
      },
      bucketDoCaminho(caminho, bucketSupabase),
      caminho,
      validadeDaAssinatura(segundosRestantes, JANELA_SEGUNDOS),
    );

  let url: string | null;
  try {
    const noR2 = await fetch(await assinar("HEAD"), { method: "HEAD" });
    url = noR2.ok ? await assinar("GET") : await urlDoSupabase();
  } catch (e) {
    // R2 inacessivel nao pode derrubar material que o Supabase ainda serve.
    console.error("[storage-redirect] R2 indisponivel, caindo no Supabase", (e as Error).message);
    url = await urlDoSupabase().catch(() => null);
  }
  if (!url) return erro(404, "Arquivo indisponivel.");

  // EXCECAO opt-in a regra "nunca devolve o arquivo" (ver topo). O 302 resolve
  // quem NAVEGA ate a URL ou baixa sem fetch — o mobile, com
  // FileSystem.downloadAsync, e o "abrir em nova aba" do console. Nao resolve
  // quem precisa LER o corpo por fetch() de outra origem: o R2 nunca teve CORS
  // configurado, entao o navegador bloqueia a resposta do destino do redirect
  // (o header desta funcao nao vale para o salto seguinte). Sao dois casos no
  // console do professor, ambos obrigados a ler o texto: markdown pra
  // renderizar e deck HTML pra injetar via <iframe srcDoc> (a URL direta nao
  // serve em <iframe src> porque volta como text/plain).
  //
  // Por que isto nao reabre o custo que a funcao evita: e' opt-in por request.
  // Quem nao manda `proxy=1` continua no 302 puro — inclusive o mobile, que e'
  // o volume de verdade e o unico que puxa midia grande (audio, video, pdf).
  // Aqui passam so' texto e HTML lidos por um professor navegando o console.
  if (proxy) {
    let origem: Response;
    try {
      origem = await fetch(url, { method: req.method });
    } catch (e) {
      console.error("[storage-redirect] proxy: origem inacessivel", (e as Error).message);
      return erro(502, "Falha ao buscar o arquivo na origem.");
    }
    if (!origem.ok) {
      return erro(origem.status === 404 ? 404 : 502, "Arquivo indisponivel na origem.");
    }

    const headers = new Headers(CORS);
    const tipo = origem.headers.get("content-type");
    if (tipo) headers.set("Content-Type", tipo);
    headers.set("Cache-Control", `public, max-age=${segundosRestantes}`);
    return new Response(origem.body, { status: 200, headers });
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...CORS,
      Location: url,
      "Cache-Control": `public, max-age=${segundosRestantes}`,
    },
  });
});
