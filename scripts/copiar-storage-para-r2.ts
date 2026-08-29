/**
 * Copia o material vivo do Supabase Storage para o Cloudflare R2.
 *
 * Uso:
 *   npx tsx scripts/copiar-storage-para-r2.ts --dry-run
 *   npx tsx scripts/copiar-storage-para-r2.ts
 *   npx tsx scripts/copiar-storage-para-r2.ts --limit=20 --concurrency=8
 *
 * Ambiente (nenhum valor fica no repositorio):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   SUPABASE_BUCKET (opcional, padrao conteudo_aluno)
 *
 * DEPENDE da migration 20260829_01 ter sido aplicada: a lista de arquivos sai
 * de `vw_material_storage_paths`, a MESMA fonte que o gateway usa. Nao e' uma
 * listagem do bucket, de proposito - listar o bucket traria os 537 arquivos
 * orfaos (367 MB) que nenhuma linha viva referencia. Copiar so' o que a view
 * enxerga faz a limpeza acontecer junto com a migracao, sem rotina separada.
 *
 * CUSTO: baixar do Supabase gasta egress, e o projeto ja' esta' em overage. Sao
 * ~327 MB, uma vez so'. Nao ha como evitar - os bytes precisam sair de la' uma
 * vez, inclusive se o Cloudflare os puxasse sozinho. E' o preco de parar de
 * pagar egress para sempre.
 *
 * Idempotente: relanca a vontade. Antes de copiar, compara o tamanho no destino
 * com o da origem e pula o que ja' bate. E' isso que o torna retomavel depois
 * de uma queda no meio dos 558 arquivos, sem manter estado em disco.
 */

import { presignR2GetUrl } from "../frontend/supabase/functions/storage-redirect/r2Presign";

/**
 * `ausente` e distinto de `falha` de proposito. Ha caminhos referenciados no
 * banco cujo arquivo nao existe mais no Storage - medido em 29/08/2026: 26
 * deles, todos de `topico-121`, um topico APAGADO cujas 52 linhas em
 * `materiais_gerados` sobreviveram (25% da tabela). Nada vivo os alcanca.
 *
 * Se isso contasse como falha, a migracao terminaria vermelha por uma condicao
 * pre-existente e as falhas de verdade se perderiam no meio.
 */
type Resultado = "copiado" | "pulado" | "ausente" | "falha";

interface Config {
  supabaseUrl: string;
  serviceKey: string;
  supabaseBucket: string;
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };
  dryRun: boolean;
  limite: number | null;
  concorrencia: number;
}

function lerConfig(argv: string[]): Config {
  const faltando: string[] = [];
  const obrigatorio = (nome: string): string => {
    const v = process.env[nome];
    if (!v) faltando.push(nome);
    return v ?? "";
  };

  const cfg: Config = {
    supabaseUrl: obrigatorio("SUPABASE_URL").replace(/\/+$/, ""),
    serviceKey: obrigatorio("SUPABASE_SERVICE_KEY"),
    supabaseBucket: process.env.SUPABASE_BUCKET || "conteudo_aluno",
    r2: {
      accountId: obrigatorio("R2_ACCOUNT_ID"),
      accessKeyId: obrigatorio("R2_ACCESS_KEY_ID"),
      secretAccessKey: obrigatorio("R2_SECRET_ACCESS_KEY"),
      bucket: obrigatorio("R2_BUCKET"),
    },
    dryRun: argv.includes("--dry-run"),
    limite: null,
    concorrencia: 4,
  };

  for (const arg of argv) {
    const limite = arg.match(/^--limit=(\d+)$/);
    if (limite) cfg.limite = Number(limite[1]);
    const conc = arg.match(/^--concurrency=(\d+)$/);
    if (conc) cfg.concorrencia = Math.max(1, Number(conc[1]));
  }

  if (faltando.length) {
    console.error("Variaveis de ambiente ausentes: " + faltando.join(", "));
    process.exit(2);
  }
  return cfg;
}

/** Percent-encode por segmento, preservando as barras (igual ao Storage). */
function codificarCaminho(caminho: string): string {
  return caminho.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/**
 * Le os caminhos vivos da view, paginando. O PostgREST corta em 1000 por
 * padrao; hoje sao ~584, mas paginar evita truncamento silencioso quando
 * crescer - o tipo de erro que so' apareceria como material faltando no app.
 */
async function listarCaminhosVivos(cfg: Config): Promise<string[]> {
  const caminhos: string[] = [];
  const passo = 500;

  for (let inicio = 0; ; inicio += passo) {
    const url =
      `${cfg.supabaseUrl}/rest/v1/vw_material_storage_paths` +
      `?select=storage_path&order=storage_path.asc`;
    const resposta = await fetch(url, {
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        Range: `${inicio}-${inicio + passo - 1}`,
      },
    });
    if (!resposta.ok) {
      throw new Error(
        `Falha ao listar a view (${resposta.status}). ` +
          "A migration 20260829_01 foi aplicada? " +
          (await resposta.text()).slice(0, 300),
      );
    }
    const pagina = (await resposta.json()) as Array<{ storage_path: string | null }>;
    for (const linha of pagina) {
      if (linha.storage_path) caminhos.push(linha.storage_path);
    }
    if (pagina.length < passo) break;
  }

  return [...new Set(caminhos)].sort();
}

function urlPublicaDoSupabase(cfg: Config, caminho: string): string {
  return (
    `${cfg.supabaseUrl}/storage/v1/object/public/` +
    `${cfg.supabaseBucket}/${codificarCaminho(caminho)}`
  );
}

async function assinarR2(
  cfg: Config,
  caminho: string,
  metodo: "GET" | "PUT" | "HEAD",
): Promise<string> {
  return presignR2GetUrl({
    accountId: cfg.r2.accountId,
    accessKeyId: cfg.r2.accessKeyId,
    secretAccessKey: cfg.r2.secretAccessKey,
    bucket: cfg.r2.bucket,
    key: caminho,
    agoraMs: Date.now(),
    metodo,
  });
}

/**
 * HEAD sem compressao.
 *
 * Origem e destino ficam atras da Cloudflare, que comprime texto e nesse caso
 * OMITE o `content-length` (e devolve ETag fraco, `W/"..."`). Sem isto o
 * tamanho vem `null` para todo .md e .html, e as duas comparacoes do script
 * quebram: a verificacao pos-upload acusa "tamanho divergente" num arquivo que
 * subiu inteiro, e o "pular o que ja esta la" nunca casa - todo arquivo de
 * texto seria recopiado a cada execucao, justamente o egress que queremos
 * evitar. Medido: com `identity` o mesmo objeto responde content-length=4423.
 */
const SEM_COMPRESSAO = { "Accept-Encoding": "identity" };

function tamanhoDe(resposta: Response): number | null {
  const bruto = resposta.headers.get("content-length");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

async function copiarUm(
  cfg: Config,
  caminho: string,
): Promise<{ estado: Resultado; bytes: number; nota?: string }> {
  // 1. Tamanho na origem. HEAD traz so' cabecalho, entao o egress e' irrelevante.
  const origemHead = await fetch(urlPublicaDoSupabase(cfg, caminho), { method: "HEAD", headers: SEM_COMPRESSAO });
  if (origemHead.status === 404 || origemHead.status === 400) {
    // Referencia morta no banco, nao falha da copia. Ver o tipo Resultado.
    return { estado: "ausente", bytes: 0, nota: `origem ${origemHead.status}` };
  }
  if (!origemHead.ok) {
    return { estado: "falha", bytes: 0, nota: `origem respondeu ${origemHead.status}` };
  }
  const tamanhoOrigem = tamanhoDe(origemHead);

  // 2. Ja' esta' no destino com o mesmo tamanho? Pula - e' o que torna o script
  //    retomavel sem guardar progresso em lugar nenhum.
  const destinoHead = await fetch(await assinarR2(cfg, caminho, "HEAD"), { method: "HEAD", headers: SEM_COMPRESSAO });
  if (destinoHead.ok && tamanhoOrigem !== null && tamanhoDe(destinoHead) === tamanhoOrigem) {
    return { estado: "pulado", bytes: tamanhoOrigem };
  }

  if (cfg.dryRun) return { estado: "copiado", bytes: tamanhoOrigem ?? 0, nota: "dry-run" };

  // 3. Baixa e sobe.
  const origem = await fetch(urlPublicaDoSupabase(cfg, caminho));
  if (!origem.ok) return { estado: "falha", bytes: 0, nota: `download ${origem.status}` };
  const corpo = new Uint8Array(await origem.arrayBuffer());

  const put = await fetch(await assinarR2(cfg, caminho, "PUT"), {
    method: "PUT",
    body: corpo,
    headers: {
      "Content-Type": origem.headers.get("content-type") || "application/octet-stream",
    },
  });
  if (!put.ok) {
    const detalhe = (await put.text()).slice(0, 200);
    return { estado: "falha", bytes: 0, nota: `PUT ${put.status} ${detalhe}` };
  }

  // 4. Confere o que chegou. Sem isto um upload truncado passaria por sucesso e
  //    so' apareceria como material quebrado na mao do aluno.
  const conferencia = await fetch(await assinarR2(cfg, caminho, "HEAD"), { method: "HEAD", headers: SEM_COMPRESSAO });
  const tamanhoDestino = conferencia.ok ? tamanhoDe(conferencia) : null;
  if (tamanhoDestino !== corpo.byteLength) {
    return {
      estado: "falha",
      bytes: 0,
      nota: `tamanho divergente: origem ${corpo.byteLength}, destino ${tamanhoDestino}`,
    };
  }

  return { estado: "copiado", bytes: corpo.byteLength };
}

function emMB(bytes: number): string {
  return (bytes / 1048576).toFixed(1) + " MB";
}

async function main() {
  const cfg = lerConfig(process.argv.slice(2));

  console.log(`Origem : ${cfg.supabaseUrl} / bucket ${cfg.supabaseBucket}`);
  console.log(`Destino: R2 bucket ${cfg.r2.bucket}`);
  if (cfg.dryRun) console.log("MODO DRY-RUN: nada sera escrito no R2.");

  let caminhos = await listarCaminhosVivos(cfg);
  console.log(`${caminhos.length} caminhos vivos na view.`);
  if (cfg.limite !== null) {
    caminhos = caminhos.slice(0, cfg.limite);
    console.log(`Limitado a ${caminhos.length}.`);
  }

  const contagem: Record<Resultado, number> = { copiado: 0, pulado: 0, ausente: 0, falha: 0 };
  const falhas: string[] = [];
  const ausentes: string[] = [];
  let bytes = 0;
  let processados = 0;
  let proximo = 0;

  async function trabalhador() {
    for (;;) {
      const indice = proximo++;
      if (indice >= caminhos.length) return;
      const caminho = caminhos[indice];
      try {
        const r = await copiarUm(cfg, caminho);
        contagem[r.estado]++;
        if (r.estado === "copiado") bytes += r.bytes;
        if (r.estado === "falha") falhas.push(`${caminho} -> ${r.nota}`);
        if (r.estado === "ausente") ausentes.push(caminho);
      } catch (e) {
        contagem.falha++;
        falhas.push(`${caminho} -> ${(e as Error).message}`);
      }
      processados++;
      if (processados % 25 === 0 || processados === caminhos.length) {
        console.log(
          `  ${processados}/${caminhos.length} | copiados ${contagem.copiado} | ` +
            `pulados ${contagem.pulado} | falhas ${contagem.falha} | ${emMB(bytes)}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(cfg.concorrencia, caminhos.length) }, trabalhador),
  );

  console.log("");
  console.log(`copiados: ${contagem.copiado} (${emMB(bytes)})`);
  console.log(`pulados : ${contagem.pulado} (ja estavam no destino)`);
  console.log(`ausentes: ${contagem.ausente} (referencia morta no banco, arquivo nao existe)`);
  for (const a of ausentes.slice(0, 10)) console.log("  - " + a);
  if (ausentes.length > 10) console.log(`  ... e mais ${ausentes.length - 10}`);
  console.log(`falhas  : ${contagem.falha}`);
  for (const f of falhas.slice(0, 30)) console.log("  ! " + f);
  if (falhas.length > 30) console.log(`  ... e mais ${falhas.length - 30}`);

  // So falha de verdade muda o codigo de saida. Referencia morta e condicao
  // pre-existente do banco: reportada, nunca fatal.
  process.exit(contagem.falha > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
