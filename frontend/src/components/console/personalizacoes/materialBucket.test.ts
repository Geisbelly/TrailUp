import { describe, expect, it } from "vitest";

import { bucketDaUrlSupabase, resolverBucketDoMaterial } from "./materialBucket";

const URL_PUBLICA =
  "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudo_aluno/" +
  "brainhex/seeker/classe-54/topico-131/conteudo-192/apresentacao/parte-03.html";

describe("bucketDaUrlSupabase", () => {
  it("extrai o bucket do caminho publico", () => {
    expect(bucketDaUrlSupabase(URL_PUBLICA)).toBe("conteudo_aluno");
  });

  it("extrai tambem de URL assinada", () => {
    expect(
      bucketDaUrlSupabase(
        "https://x.supabase.co/storage/v1/object/sign/conteudo_aluno/a/b.html?token=abc",
      ),
    ).toBe("conteudo_aluno");
  });

  it("ignora o que nao e' URL de storage", () => {
    expect(bucketDaUrlSupabase("https://exemplo.com/arquivo.html")).toBeNull();
    expect(bucketDaUrlSupabase("")).toBeNull();
    expect(bucketDaUrlSupabase(null)).toBeNull();
    expect(bucketDaUrlSupabase(42)).toBeNull();
  });
});

describe("resolverBucketDoMaterial", () => {
  it("prefere o campo declarado", () => {
    expect(
      resolverBucketDoMaterial({ bucket: "outro_bucket", arquivo_url: URL_PUBLICA }),
    ).toBe("outro_bucket");
  });

  it("deriva da URL do material quando o campo falta", () => {
    // Foi assim que a apresentacao 3680 chegou ao banco: sem `bucket`.
    expect(resolverBucketDoMaterial({ arquivo_url: URL_PUBLICA })).toBe("conteudo_aluno");
  });

  it("deriva da primeira parte com arquivo quando a raiz e' nula", () => {
    // O caso real: material por partes tem arquivo_url/storage_path nulos na
    // raiz, e algumas partes falharam. A primeira parte VALIDA e' que resolve.
    expect(
      resolverBucketDoMaterial({
        arquivo_url: null,
        storage_path: null,
        partes: [
          { ordem: 1, failed: true, arquivo_url: null },
          { ordem: 2, failed: true, arquivo_url: null },
          { ordem: 3, failed: false, arquivo_url: URL_PUBLICA },
        ],
      }),
    ).toBe("conteudo_aluno");
  });

  it("devolve null quando nao ha de onde tirar", () => {
    expect(resolverBucketDoMaterial(null)).toBeNull();
    expect(resolverBucketDoMaterial({})).toBeNull();
    expect(
      resolverBucketDoMaterial({ arquivo_url: null, partes: [{ arquivo_url: null }] }),
    ).toBeNull();
  });
});
