/**
 * O texto que a tela de erro mostra e o aluno copia.
 *
 * Fica fora de `TelaDeErro.tsx` pelo motivo de sempre: aquele arquivo importa
 * `react-native` e não carrega no harness do node. E esta é justamente a parte
 * que não pode falhar — é a última coisa que roda antes de a tela ficar branca
 * de novo, agora por culpa da própria tela de erro.
 */
export type DadosDaPlataforma = { os: string; versao: unknown };

function linhaDoErro(erro: unknown): string {
  if (erro instanceof Error) {
    return erro.name ? `${erro.name}: ${erro.message}` : erro.message;
  }
  // Nem tudo o que é lançado é `Error`. `throw "texto"` e `throw {code: 42}`
  // chegam aqui, e `String({})` devolve "[object Object]" -- inútil no relato,
  // mas melhor que a tela de erro estourar tentando ler `.name`.
  if (erro && typeof erro === "object") {
    const bruto = erro as { name?: unknown; message?: unknown };
    const nome = typeof bruto.name === "string" ? bruto.name : null;
    const msg = typeof bruto.message === "string" ? bruto.message : null;
    if (nome || msg) return nome && msg ? `${nome}: ${msg}` : String(nome ?? msg);
  }
  return String(erro ?? "erro sem mensagem");
}

export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) {
    // Sai AQUI mesmo com mensagem vazia. Cair no `String(erro)` devolveria
    // "Error" -- que nao e vazio, entao passaria pelo `||` abaixo, e diz
    // exatamente nada ao aluno. Medido em teste.
    return erro.message || "Erro sem mensagem.";
  }
  if (erro && typeof erro === "object") {
    const msg = (erro as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
    return "Erro sem mensagem.";
  }
  const texto = String(erro ?? "").trim();
  return texto || "Erro sem mensagem.";
}

export function detalhesDoErro(erro: unknown, plataforma: DadosDaPlataforma): string {
  const pilha =
    erro instanceof Error && typeof erro.stack === "string" && erro.stack
      ? erro.stack
      : // `stack` some em build de produção com minificação agressiva. Dizer
        // isso é mais útil que uma linha vazia -- quem lê o relato saberia que
        // faltou, não que não havia.
        "(sem stack)";

  return [
    linhaDoErro(erro),
    `plataforma: ${plataforma.os} ${String(plataforma.versao)}`,
    "",
    pilha,
  ].join("\n");
}
