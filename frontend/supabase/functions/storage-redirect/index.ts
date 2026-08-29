// Gateway de arquivos: resolve um storage_path e REDIRECIONA para o R2.
//
// A regra que define esta funcao inteira: **ela nunca devolve o arquivo**.
// O painel do Supabase define egress como "any outgoing traffic including
// Database, Storage, Realtime, Auth, API, Edge Functions, Pooler and Log
// Drains" - servir o byte por aqui manteria a conta identica a de antes da
// migracao, so' que com mais latencia e mais invocacoes. Por isso a resposta e'
// 302 para uma URL assinada: o cliente baixa direto do R2 e o Supabase ve ~200
// bytes por arquivo.
//
// POSTURA DE ACESSO (Opcao A do spec 2026-08-29-r2-gateway-design.md)
//
// Nao exige autenticacao, e isso e' deliberado, nao esquecimento:
//
//   - o app baixa midia com `FileSystem.downloadAsync(url, localUri)`, sem
//     headers; exigir JWT daria 401 em toda midia;
//   - nao ha protecao a preservar: os quatro buckets de hoje sao `public: true`.
//     O material ja e' legivel por quem tiver o link. A RLS protege a LISTAGEM
//     (quais materiais existem para aquele aluno), nunca o objeto.
//
// O resultado e' mais restrito que hoje, nao menos: a URL de hoje e' publica e
// permanente; a que sai daqui expira no fim da janela de assinatura.
//
// O que a consulta ainda garante: so' assina caminho que EXISTE e esta' vivo.
// Sem ela a funcao assinaria qualquer chave que pedissem, virando um oraculo de
// assinatura para o bucket inteiro. Com ela, os 537 arquivos orfaos e qualquer
// chave inventada ficam de fora.
//
// Endurecer isso depois (Opcao B: JWT + RLS via security_invoker, que a view
// 20260829_01 ja suporta) exige mudar o download do mobile para mandar header,
// e confirmar que o Authorization nao vaza para o R2 no 302.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

import { normalizarStoragePath } from "./caminho.ts";
import { inicioDaJanela, presignR2GetUrl } from "./r2Presign.ts";
import { urlPublicaDoSupabase } from "./destino.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JANELA_SEGUNDOS = 3600;

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") return erro(405, "Use GET.");

  const caminho = normalizarStoragePath(new URL(req.url).searchParams.get("path"));
  if (!caminho) return erro(400, "Parametro 'path' ausente ou invalido.");

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
  let url: string;
  try {
    const noR2 = await fetch(await assinar("HEAD"), { method: "HEAD" });
    url = noR2.ok
      ? await assinar("GET")
      : urlPublicaDoSupabase(Deno.env.get("SUPABASE_URL") ?? "", bucketSupabase, caminho);
  } catch (e) {
    // R2 inacessivel nao pode derrubar material que o Supabase ainda serve.
    console.error("[storage-redirect] R2 indisponivel, caindo no Supabase", (e as Error).message);
    url = urlPublicaDoSupabase(Deno.env.get("SUPABASE_URL") ?? "", bucketSupabase, caminho);
  }

  // O 302 pode ser cacheado ate' o fim da janela: dentro dela a assinatura e' a
  // mesma para todo mundo, entao `public` vale e poupa invocacao.
  const fimDaJanela = (inicioDaJanela(agoraMs, JANELA_SEGUNDOS) + JANELA_SEGUNDOS) * 1000;
  const segundosRestantes = Math.max(1, Math.floor((fimDaJanela - agoraMs) / 1000));

  return new Response(null, {
    status: 302,
    headers: {
      ...CORS,
      Location: url,
      "Cache-Control": `public, max-age=${segundosRestantes}`,
    },
  });
});
