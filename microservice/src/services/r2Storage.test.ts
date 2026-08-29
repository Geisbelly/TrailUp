import assert from "node:assert/strict";
import test from "node:test";

import {
  derivarChaveDeAssinatura,
  lerConfigR2,
  presignR2,
  uploadParaR2,
  urlDoGateway,
} from "./r2Storage";

const CFG = {
  accountId: "a641a8f84cfc447572688bf59f608368",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "segredo-de-teste",
  bucket: "trailup",
};
const CAMINHO = "brainhex/seeker/classe-54/markdown/material-1.md";

function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("a cadeia de assinatura bate com o vetor publicado pela AWS", () => {
  // Esta copia do assinador vive em paralelo a
  // frontend/supabase/functions/storage-redirect/r2Presign.ts (o Dockerfile do
  // microservice nao enxerga fora do pacote). O vetor conhecido e o que impede
  // que qualquer uma das duas se degrade em silencio: assinatura errada so
  // apareceria como 403 do R2, em producao.
  const chave = derivarChaveDeAssinatura(
    "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    "20150830",
    "us-east-1",
    "iam",
  );
  assert.equal(
    chave.toString("hex"),
    "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
  );
});

test("presignR2 aponta para o host e o bucket certos, com assinatura hex", () => {
  const url = new URL(presignR2({ ...CFG, key: CAMINHO, metodo: "PUT" }));
  assert.equal(url.host, "a641a8f84cfc447572688bf59f608368.r2.cloudflarestorage.com");
  assert.equal(url.pathname, `/trailup/${CAMINHO}`);
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
});

test("o verbo muda a assinatura - URL de leitura nao serve para escrever", () => {
  const agoraMs = Date.UTC(2026, 7, 29, 5, 0, 0);
  const put = new URL(presignR2({ ...CFG, key: CAMINHO, metodo: "PUT", agoraMs }));
  const get = new URL(presignR2({ ...CFG, key: CAMINHO, metodo: "GET", agoraMs }));
  assert.notEqual(
    put.searchParams.get("X-Amz-Signature"),
    get.searchParams.get("X-Amz-Signature"),
  );
});

test("lerConfigR2 exige as quatro variaveis, sem meio-termo", () => {
  const completo = {
    R2_ACCOUNT_ID: "conta",
    R2_ACCESS_KEY_ID: "chave",
    R2_SECRET_ACCESS_KEY: "segredo",
    R2_BUCKET: "trailup",
  };
  assert.deepEqual(comEnv(completo, lerConfigR2), {
    accountId: "conta",
    accessKeyId: "chave",
    secretAccessKey: "segredo",
    bucket: "trailup",
  });

  // Faltando qualquer uma, devolve null - e o uploadBuffer cai no Supabase.
  // Config pela metade nao pode virar upload pela metade.
  for (const faltante of Object.keys(completo)) {
    assert.equal(
      comEnv({ ...completo, [faltante]: undefined }, lerConfigR2),
      null,
      `deveria recusar sem ${faltante}`,
    );
  }
});

test("urlDoGateway devolve a URL do gateway, nao a do R2", () => {
  const url = comEnv({ SUPABASE_URL: "https://proj.supabase.co" }, () => urlDoGateway(CAMINHO));
  assert.equal(url, `https://proj.supabase.co/functions/v1/storage-redirect?path=${CAMINHO}`);
  assert.ok(!String(url).includes("r2.cloudflarestorage.com"));
});

test("urlDoGateway tolera barra sobrando e recusa base ausente", () => {
  assert.equal(
    comEnv({ SUPABASE_URL: "https://proj.supabase.co//" }, () => urlDoGateway(CAMINHO)),
    `https://proj.supabase.co/functions/v1/storage-redirect?path=${CAMINHO}`,
  );
  // Sem base, null: gravar URL relativa quebraria o app em silencio.
  assert.equal(comEnv({ SUPABASE_URL: undefined }, () => urlDoGateway(CAMINHO)), null);
});

test("uploadParaR2 faz PUT com o corpo e o content-type recebidos", async () => {
  const chamadas: Array<{ metodo?: string; tipo?: string; bytes: number }> = [];
  const fake = (async (_url: string, init: any) => {
    chamadas.push({
      metodo: init?.method,
      tipo: init?.headers?.["Content-Type"],
      bytes: init?.body?.byteLength ?? 0,
    });
    return { ok: true, status: 200, text: async () => "" };
  }) as unknown as typeof fetch;

  await uploadParaR2(CFG, CAMINHO, Buffer.from("conteudo"), "text/markdown", fake);

  assert.deepEqual(chamadas, [{ metodo: "PUT", tipo: "text/markdown", bytes: 8 }]);
});

test("uploadParaR2 LANCA quando o R2 recusa, em vez de cair para o Supabase", async () => {
  // Fallback silencioso faria a migracao parecer concluida enquanto o egress
  // continuava saindo do Supabase - o defeito que ela existe para corrigir.
  const fake = (async () => ({
    ok: false,
    status: 403,
    text: async () => "SignatureDoesNotMatch",
  })) as unknown as typeof fetch;

  await assert.rejects(
    () => uploadParaR2(CFG, CAMINHO, Buffer.from("x"), "text/plain", fake),
    /upload falhou.*403.*SignatureDoesNotMatch/s,
  );
});
