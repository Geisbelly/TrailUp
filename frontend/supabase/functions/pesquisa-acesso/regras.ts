// Regras puras da edge function `pesquisa-acesso`: o que o pedido pode trazer, como a senha é
// gerada e qual e-mail o aluno de teste recebe. Ficam fora do index.ts para o vitest alcançar.

export type Pedido =
  | { acao: "criar"; email: string; nome: string; instituicao: string | null }
  | { acao: "confirmacao"; email: string }
  | { acao: "situacao"; emails: string[] }
  | { acao: "acesso"; email: string }
  | { acao: "acesso_enviado"; email: string };

const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z0-9-]{2,}$/i;
const MAX_EMAILS_POR_CONSULTA = 200;

export function emailValido(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const email = bruto.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

function textoCurto(bruto: unknown, max: number): string | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto.replace(/\s+/g, " ").trim();
  return texto ? texto.slice(0, max) : null;
}

/** Lê o corpo do pedido. Devolve null para qualquer coisa fora do contrato: a função responde 400. */
export function lerPedido(corpo: unknown): Pedido | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  switch (c.acao) {
    case "criar": {
      const email = emailValido(c.email);
      const nome = textoCurto(c.nome, 160);
      if (!email || !nome) return null;
      return { acao: "criar", email, nome, instituicao: textoCurto(c.instituicao, 200) };
    }
    case "confirmacao":
    case "acesso":
    case "acesso_enviado": {
      const email = emailValido(c.email);
      return email ? { acao: c.acao, email } : null;
    }
    case "situacao": {
      if (!Array.isArray(c.emails) || c.emails.length === 0 || c.emails.length > MAX_EMAILS_POR_CONSULTA) return null;
      const emails = c.emails.map(emailValido);
      if (emails.some(e => e === null)) return null;
      return { acao: "situacao", emails: [...new Set(emails as string[])] };
    }
    default:
      return null;
  }
}

// Sem caracteres que se confundem na leitura (0/O, 1/l/I) nem que o e-mail ou a planilha mexem.
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const SIMBOLOS = "!#%+=?@";
const TODOS = MINUSCULAS + MAIUSCULAS + DIGITOS + SIMBOLOS;

/** Inteiro uniforme em [0, n), sem viés de módulo. `bytes` preenche o vetor com aleatório criptográfico. */
function sortear(n: number, bytes: (v: Uint32Array) => void): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n;
  const v = new Uint32Array(1);
  for (;;) {
    bytes(v);
    if (v[0] < limite) return v[0] % n;
  }
}

const aleatorioDoSistema = (v: Uint32Array) => {
  crypto.getRandomValues(v);
};

/**
 * Senha aleatória de `tamanho` caracteres (mínimo 12), com pelo menos uma minúscula, uma maiúscula,
 * um dígito e um símbolo, para passar em qualquer política de senha do Supabase Auth.
 */
export function gerarSenha(tamanho = 14, bytes: (v: Uint32Array) => void = aleatorioDoSistema): string {
  const n = Math.max(12, Math.floor(tamanho));
  const letras = [MINUSCULAS, MAIUSCULAS, DIGITOS, SIMBOLOS].map(c => c[sortear(c.length, bytes)]);
  while (letras.length < n) letras.push(TODOS[sortear(TODOS.length, bytes)]);
  for (let i = letras.length - 1; i > 0; i--) {
    const j = sortear(i + 1, bytes);
    [letras[i], letras[j]] = [letras[j], letras[i]];
  }
  return letras.join("");
}

/** E-mail do aluno de teste: não recebe mensagem nenhuma, só serve de login. */
export function emailDoAlunoDeTeste(dominio: string, bytes: (v: Uint32Array) => void = aleatorioDoSistema): string {
  const dom = dominio.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) throw new Error("PESQUISA_ALUNO_DOMINIO inválido.");
  let sufixo = "";
  while (sufixo.length < 8) sufixo += DIGITOS[sortear(DIGITOS.length, bytes)];
  return `aluno.teste.${sufixo}@${dom}`;
}

/** Para onde o link de confirmação devolve o avaliador: a página pública da pesquisa. */
export function linkDeRetorno(site: string): string {
  const base = new URL(site.trim());
  if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("PESQUISA_SITE_URL precisa ser https.");
  return new URL("/pesquisa/professores?aba=inscricao&confirmado=1", base).toString();
}
