const path = require("node:path");

/**
 * Mantém o Chrome dentro do artefato do serviço.
 *
 * O cache padrão do Puppeteer fica em ~/.cache, que pertence à instância de
 * build do Render e não acompanha necessariamente a instância de runtime.
 * Colocando-o dentro de node_modules, o `postinstall` e o processo iniciado
 * por `npm run start` resolvem exatamente o mesmo executável.
 *
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: path.join(__dirname, "node_modules", ".puppeteer_cache"),
};
