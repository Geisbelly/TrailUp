// URL assinada de UPLOAD (ou de remocao) no R2, para os servicos que geram arquivo.
//
// As credenciais do R2 ficam so' aqui (secrets das Edge Functions). Quem gera
// arquivo (BrainHexPDF, API, microservice) chama esta funcao com a chave de
// servico, recebe uma URL de PUT e sobe o arquivo DIRETO no R2. Esta funcao
// nunca recebe nem devolve o arquivo: tudo que sai de uma Edge Function conta
// como egress do Supabase, e o egress e' o que a migracao para o R2 elimina.
// Ver `pedido.ts` e o spec 2026-08-29-r2-gateway-design.md.
//
//   POST /functions/v1/storage-upload-url
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//   { "path": "brainhex/<perfil>/classe-N/.../material-1.html", "metodo"?: "PUT" | "DELETE" }
//   -> 200 { url, metodo, bucket, expira_em_segundos, url_de_leitura }
//
// `metodo` volta na resposta para quem pediu DELETE conferir que a funcao
// publicada ja' sabe assinar DELETE: a versao anterior ignorava o campo e
// devolvia uma URL de PUT. `bucket` vai para o ponteiro da telemetria
// (`_bucket`), que a retencao confere antes de apagar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { presignR2GetUrl } from "../storage-redirect/r2Presign.ts";
import { criarConferenciaDeServico, lerPedido, urlDeLeitura } from "./pedido.ts";

// Janela curta: a URL so' precisa viver o tempo de um upload. Dentro da janela
// a assinatura e' a mesma para o mesmo caminho; a validade e' o dobro, senao a
// URL emitida no fim da janela nasceria vencida.
const JANELA_SEGUNDOS = 300;
const VALIDADE_SEGUNDOS = 600;

function json(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const autorizado = criarConferenciaDeServico(() => ({
  chaveDeServico: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
}));

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  if (!(await autorizado(req.headers.get("authorization")))) {
    return json(401, { error: "So' a chave de servico pede URL de upload." });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return json(400, { error: "Corpo JSON invalido." });
  }
  const pedido = lerPedido(corpo);
  if ("erro" in pedido) return json(400, { error: pedido.erro });

  const contaR2 = Deno.env.get("R2_ACCOUNT_ID");
  const chaveR2 = Deno.env.get("R2_ACCESS_KEY_ID");
  const segredoR2 = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketR2 = Deno.env.get("R2_BUCKET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!contaR2 || !chaveR2 || !segredoR2 || !bucketR2 || !supabaseUrl) {
    // Erro de deploy, nao do chamador: 500, e quem chama falha a geracao em
    // vez de gravar em outro lugar.
    console.error("[storage-upload-url] segredos do R2 ausentes no ambiente");
    return json(500, { error: "Upload para o R2 nao configurado." });
  }

  const url = await presignR2GetUrl({
    accountId: contaR2,
    accessKeyId: chaveR2,
    secretAccessKey: segredoR2,
    bucket: bucketR2,
    key: pedido.caminho,
    agoraMs: Date.now(),
    janelaSegundos: JANELA_SEGUNDOS,
    validadeSegundos: VALIDADE_SEGUNDOS,
    metodo: pedido.metodo,
  });

  return json(200, {
    url,
    metodo: pedido.metodo,
    bucket: bucketR2,
    expira_em_segundos: VALIDADE_SEGUNDOS,
    url_de_leitura: urlDeLeitura(supabaseUrl, pedido.caminho),
  });
});
