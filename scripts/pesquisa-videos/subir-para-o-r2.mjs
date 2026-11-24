// Sobe os vídeos e o PDF da cartilha da pesquisa para o R2, em `publico/pesquisa/`.
//
// Não usa credencial do R2: pede à Edge Function `storage-upload-url` uma URL assinada de PUT com a
// chave de serviço do projeto (o mesmo caminho da API e do microservice) e sobe direto no R2. A
// página lê pelo gateway (`storage-redirect?path=publico/...`), que serve esse prefixo sem sessão.
//
// Uso (na raiz do repositório):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=... \
//     node scripts/pesquisa-videos/subir-para-o-r2.mjs <pasta>
//
// <pasta> tem os arquivos com o nome final (é o que o caminho no R2 usa):
//   cartilha-pesquisa-professores.pdf
//   videos/pesquisa-passo-a-passo.mp4 videos/pesquisa-passo-a-passo.jpg
//   videos/apresentacao-trailup.mp4   videos/apresentacao-trailup.jpg
//   videos/para-o-professor.mp4       videos/para-o-professor.jpg
//   videos/guia-primeiro-acesso.mp4   videos/guia-primeiro-acesso.jpg
//
// Os caminhos são os de frontend/src/features/pesquisa/videosDaPesquisa.ts (o teste compara).
// Depois de subir, confere cada um pelo gateway, sem sessão, como a página vai fazer.

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export const ARQUIVOS = [
  ["cartilha-pesquisa-professores.pdf", "publico/pesquisa/cartilha-pesquisa-professores.pdf", "application/pdf"],
  ["videos/pesquisa-passo-a-passo.mp4", "publico/pesquisa/videos/pesquisa-passo-a-passo.mp4", "video/mp4"],
  ["videos/pesquisa-passo-a-passo.jpg", "publico/pesquisa/videos/pesquisa-passo-a-passo.jpg", "image/jpeg"],
  ["videos/apresentacao-trailup.mp4", "publico/pesquisa/videos/apresentacao-trailup.mp4", "video/mp4"],
  ["videos/apresentacao-trailup.jpg", "publico/pesquisa/videos/apresentacao-trailup.jpg", "image/jpeg"],
  ["videos/para-o-professor.mp4", "publico/pesquisa/videos/para-o-professor.mp4", "video/mp4"],
  ["videos/para-o-professor.jpg", "publico/pesquisa/videos/para-o-professor.jpg", "image/jpeg"],
  ["videos/guia-primeiro-acesso.mp4", "publico/pesquisa/videos/guia-primeiro-acesso.mp4", "video/mp4"],
  ["videos/guia-primeiro-acesso.jpg", "publico/pesquisa/videos/guia-primeiro-acesso.jpg", "image/jpeg"],
];

function exigir(nome) {
  const valor = (process.env[nome] ?? "").trim();
  if (!valor) {
    console.error(`Falta ${nome} no ambiente.`);
    process.exit(2);
  }
  return valor;
}

async function pedirUrl(base, chave, caminho) {
  const resposta = await fetch(`${base}/functions/v1/storage-upload-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ path: caminho, metodo: "PUT" }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.metodo !== "PUT" || !corpo.url) {
    // 400 "fora dos prefixos" = a função publicada ainda não conhece `publico/`.
    throw new Error(`URL recusada para ${caminho}: ${resposta.status} ${corpo.error ?? ""}`.trim());
  }
  return corpo.url;
}

async function conferir(base, caminho, tamanho) {
  const gateway = `${base}/functions/v1/storage-redirect?path=${encodeURIComponent(caminho)}`;
  const salto = await fetch(gateway, { redirect: "manual" });
  if (salto.status !== 302) throw new Error(`gateway devolveu ${salto.status} para ${caminho}`);
  // A URL é assinada para GET (HEAD daria 403). Um byte basta, e o 206 confirma de quebra que o
  // R2 atende Range, que é como o player do navegador avança no vídeo.
  const destino = await fetch(salto.headers.get("location"), { headers: { Range: "bytes=0-0" } });
  await destino.body?.cancel();
  const recebido = Number((destino.headers.get("content-range") ?? "").split("/")[1]);
  if (destino.status !== 206 || recebido !== tamanho) {
    throw new Error(`no R2 ${caminho} veio ${destino.status} com ${recebido} bytes (esperado ${tamanho})`);
  }
  return destino.headers.get("content-type");
}

async function principal() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error("Uso: node scripts/pesquisa-videos/subir-para-o-r2.mjs <pasta>");
    process.exit(2);
  }
  const base = exigir("SUPABASE_URL").replace(/\/+$/, "");
  const chave = exigir("SUPABASE_SERVICE_KEY");

  // Confere a pasta inteira antes de subir qualquer coisa.
  for (const [local] of ARQUIVOS) await stat(join(resolve(pasta), local));

  for (const [local, caminho, tipo] of ARQUIVOS) {
    const corpo = await readFile(join(resolve(pasta), local));
    const url = await pedirUrl(base, chave, caminho);
    const envio = await fetch(url, {
      method: "PUT",
      body: corpo,
      headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=86400" },
    });
    if (!envio.ok) throw new Error(`PUT de ${caminho} falhou: ${envio.status} ${(await envio.text()).slice(0, 200)}`);
    const tipoNoR2 = await conferir(base, caminho, corpo.length);
    console.log(`ok  ${caminho}  ${(corpo.length / 1e6).toFixed(1)} MB  ${tipoNoR2}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch(erro => {
    console.error(erro.message);
    process.exit(1);
  });
}
