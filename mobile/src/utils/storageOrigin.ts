// A URL do material as vezes chega apontando pro host ERRADO.
//
// Caso real (2026-08-25, log do app): a API monta a URL publica do storage
// como `{base}/storage/v1/object/public/...` a partir de SUPABASE_URL. Com essa
// variavel apontando pro servico interno do deploy, o material saiu gravado
// como http://trailup-microservice-gmgqkw:3000/storage/v1/object/public/... -
// endereco que existe entre containers e nao existe pro celular. No app isso
// aparece como net::ERR_NAME_NOT_RESOLVED, e nenhuma correcao de renderizacao
// resolve: o arquivo nunca chega.
//
// O app, porem, SABE a origem certa (EXPO_PUBLIC_SUPABASE_URL - e a mesma que
// ele usa pra falar com o banco). Entao a URL que veio nao precisa ser
// obedecida: o caminho dentro do bucket e o que importa, e a origem pode ser
// recolocada localmente.
//
// Modulo puro (sem import do cliente Supabase) pra poder ser testado no node.

/** Host que serve storage do Supabase de verdade. */
function mesmaOrigem(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
}

/**
 * A origem da URL do material bate com a que o app usa? Quando nao bate, a URL
 * nao serve - foi montada com a base errada no servidor.
 */
export function origemDeStorageConfiavel(
  urlOrigin: string | null | undefined,
  appOrigin: string | null | undefined,
): boolean {
  // Sem origem conhecida do app, nao ha base pra desconfiar: mantem o que veio
  // em vez de quebrar o que hoje funciona.
  if (!appOrigin) return true;
  return mesmaOrigem(urlOrigin, appOrigin);
}

/**
 * Recoloca o caminho do bucket na origem do app, em modo publico.
 * Devolve null quando falta informacao pra remontar (ai quem chama mantem a
 * URL original em vez de inventar).
 */
export function reancorarNaOrigemDoApp(params: {
  appOrigin: string | null | undefined;
  bucket: string | null | undefined;
  objectPath: string | null | undefined;
  /**
   * Query da URL original (ex.: `?hideQuiz=1`). O deck LE a propria
   * `location.search` pra decidir o que esconder, entao perde-la aqui traria de
   * volta o quiz duplicado que a flag existe pra suprimir.
   */
  search?: string | null;
}): string | null {
  const { appOrigin, bucket, objectPath, search } = params;
  if (!appOrigin || !bucket || !objectPath) return null;

  const caminho = String(objectPath)
    .split("/")
    .filter(Boolean)
    .map((segmento) => encodeURIComponent(segmento))
    .join("/");
  if (!caminho) return null;

  const query = String(search ?? "").replace(/^\?*/, "");
  return (
    `${String(appOrigin).replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${caminho}` +
    (query ? `?${query}` : "")
  );
}

// Segundo formato de URL errada, achado em 2026-08-25 no log do app:
//
//   https://trailup-microservice-gmgqkw:3000/api/v1/decks/conteudo_aluno/
//     brainhex/survivor/classe-32/.../parte-01.html?hideQuiz=1
//
// Nao e URL de storage - e o endpoint do BrainHexPDF que RESSERVE um deck ja
// gravado (`GET /api/v1/decks/:bucket/*`). A origem interna vem de
// `buildAppUrl`, que cai pro header Host da requisicao quando APP_URL nao esta
// configurado; dentro da rede de containers esse header e sempre um nome
// interno, e a URL vai gravada no banco assim.
//
// NAO da pra trocar por URL publica de storage, por mais tentador que pareca:
// o gateway publico do Supabase serve .html como text/plain + CSP sandbox
// (protecao anti-XSS da plataforma, nao configuravel por bucket - ver o
// comentario em BrainHexPDF/server.ts:2216). O WebView passaria a mostrar o
// codigo-fonte do deck em vez de executa-lo: URL que resolve, conteudo que nao
// serve. O deck TEM que continuar vindo do endpoint que devolve text/html de
// verdade - o que precisa mudar e o HOST, nao a rota.
const PADRAO_DECK_SERVIDO = /\/api\/v1\/decks\/([^/]+)\/(.+)$/i;

export type ReferenciaDeDeck = {
  bucket: string;
  objectPath: string;
  search: string;
};

/**
 * Extrai bucket + caminho do objeto de uma URL de deck resservido.
 *
 * Devolve null pra qualquer outra coisa - inclusive pra URL de storage de
 * verdade, que ja tem tratamento proprio.
 */
export function extrairReferenciaDeDeck(rawUrl: string | null | undefined): ReferenciaDeDeck | null {
  const valor = String(rawUrl ?? "").trim();
  if (!valor) return null;

  let caminho = valor;
  let search = "";
  try {
    const url = new URL(valor);
    caminho = url.pathname;
    search = url.search;
  } catch {
    // Caminho relativo tambem serve: o que importa e o padrao /api/v1/decks/.
    const corte = valor.indexOf("?");
    if (corte >= 0) {
      caminho = valor.slice(0, corte);
      search = valor.slice(corte);
    }
  }

  const casou = PADRAO_DECK_SERVIDO.exec(caminho);
  if (!casou) return null;

  const bucket = decodeURIComponent(casou[1] ?? "").trim();
  const objectPath = casou[2]
    .split("/")
    .filter(Boolean)
    .map((segmento) => {
      try {
        return decodeURIComponent(segmento);
      } catch {
        return segmento;
      }
    })
    .join("/");

  if (!bucket || !objectPath) return null;
  return { bucket, objectPath, search };
}


/**
 * Host que so existe dentro da rede do deploy.
 *
 * Heuristica deliberadamente estreita: nome de rotulo unico (sem ponto) que nao
 * e localhost nem IP. E exatamente a forma dos nomes de servico do Docker
 * (`trailup-microservice-gmgqkw`), e nenhum host publico da internet tem essa
 * forma. Serve pra dar uma mensagem honesta em vez de tela branca com erro de
 * navegador -- nao pra bloquear nada: `localhost` e IP de rede local sao
 * legitimos em desenvolvimento e passam.
 */
export function hostSoAlcancavelNoDeploy(rawUrl: string | null | undefined): boolean {
  const valor = String(rawUrl ?? "").trim();
  if (!valor) return false;

  let hostname: string;
  try {
    hostname = new URL(valor).hostname;
  } catch {
    return false;
  }
  if (!hostname) return false;

  const minusculo = hostname.toLowerCase();
  if (minusculo === "localhost" || minusculo.endsWith(".localhost")) return false;
  // IPv4/IPv6 literais: alcancaveis (ou nao) por roteamento, nao por DNS.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(minusculo) || minusculo.includes(":")) return false;

  return !minusculo.includes(".");
}

/**
 * Recoloca a URL do deck numa origem publica do servico que o serve.
 *
 * Mantem rota e query intactas -- so o host muda. A rota tem que continuar sendo
 * `/api/v1/decks/...` porque e ela que devolve `text/html` de verdade; trocar
 * pelo storage publico quebraria a execucao do deck.
 *
 * Devolve null sem origem publica configurada: melhor a URL original falhando
 * de forma visivel do que uma URL fabricada apontando pra lugar nenhum.
 */
export function reancorarDeckNaOrigemPublica(params: {
  deckUrl: string | null | undefined;
  publicOrigin: string | null | undefined;
}): string | null {
  const { deckUrl, publicOrigin } = params;
  const referencia = extrairReferenciaDeDeck(deckUrl);
  if (!referencia || !publicOrigin) return null;

  let base: string;
  try {
    base = new URL(String(publicOrigin)).origin;
  } catch {
    return null;
  }

  const caminho = referencia.objectPath
    .split("/")
    .filter(Boolean)
    .map((segmento) => encodeURIComponent(segmento))
    .join("/");
  if (!caminho) return null;

  return (
    `${base}/api/v1/decks/${encodeURIComponent(referencia.bucket)}/${caminho}` +
    (referencia.search || "")
  );
}
