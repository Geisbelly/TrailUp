// Imagem no teste: o Metro transforma `require("./x.png")` num número (o id do asset); o Node puro
// tentaria executar o PNG como JavaScript e cairia em `SyntaxError: Invalid or unexpected token`.
// Aqui a imagem vira 1, como no app. Carregado por `rodar-testes.mjs` em todos os grupos.
for (const extensao of [".png", ".jpg", ".jpeg", ".gif", ".webp"]) {
  require.extensions[extensao] = (modulo) => {
    modulo.exports = 1;
  };
}
