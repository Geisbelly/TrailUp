import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Cada seção depende de estados e hooks diferentes para renderizar; o que se confere aqui é que o
// título de cada uma carrega a explicação certa. O componente em si é testado em
// comum/ExplicacaoDaMetrica.test.tsx.
const fonte = (arquivo: string) => readFileSync(fileURLToPath(new URL(arquivo, import.meta.url)), "utf-8");

const SECOES: [string, string][] = [
  ["PrecisamDeAtencao.tsx", "prof.precisam_atencao"],
  ["AbandonoPorPerfil.tsx", "prof.abandono_por_perfil"],
  ["DistribuicaoNotas.tsx", "prof.distribuicao_notas"],
  ["InatividadePorPerfil.tsx", "prof.inatividade"],
  ["AbandonoPorEtapa.tsx", "prof.abandono_por_etapa"],
  ["RiscoDeReprovacao.tsx", "prof.risco_reprovacao"],
  ["GargalosDePersonalizacao.tsx", "prof.gargalos_personalizacao"],
  ["FilaDePersonalizacao.tsx", "prof.fila_personalizacao"],
];

describe("seções da visão geral explicam a origem dos números", () => {
  for (const [arquivo, chave] of SECOES) {
    it(`${arquivo} traz a explicação ${chave} junto do título`, () => {
      const src = fonte(`./${arquivo}`);
      expect(src).toContain(`<ExplicacaoDaMetrica chave="${chave}"`);
      const titulo = src.indexOf("<h3");
      const icone = src.indexOf("<ExplicacaoDaMetrica");
      expect(icone).toBeGreaterThan(titulo);
      expect(icone - titulo).toBeLessThan(400);
    });
  }

  it("a tabela de alunos explica nota e progresso no cabeçalho, fora da linha clicável", () => {
    const src = fonte("./TabelaAlunos.tsx");
    const thead = src.slice(src.indexOf("<thead"), src.indexOf("</thead>"));
    expect(thead).toContain('<ExplicacaoDaMetrica chave="prof.media_notas"');
    expect(thead).toContain('<ExplicacaoDaMetrica chave="prof.conclusao_media"');
  });
});
