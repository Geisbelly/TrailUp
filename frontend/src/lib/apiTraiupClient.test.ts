import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { buildApiBaseUrlCandidates } from "./apiTraiupClient";

describe("buildApiBaseUrlCandidates", () => {
  it("usa o proxy same-origin da Vercel e ignora a env var http:// numa pagina https", () => {
    const candidates = buildApiBaseUrlCandidates({
      envBaseUrl: "http://trailup-frontend-8nw9al-e68946-87-99-146-75.traefik.me",
      origin: "https://trailup.vercel.app",
      hostname: "trailup.vercel.app",
      protocol: "https:",
    });

    expect(candidates).toEqual(["https://trailup.vercel.app/trailup-api"]);
  });

  it("mantem a env var quando ela tambem e https", () => {
    const candidates = buildApiBaseUrlCandidates({
      envBaseUrl: "https://trailup-frontend-8nw9al-e68946-87-99-146-75.traefik.me",
      origin: "https://trailup.vercel.app",
      hostname: "trailup.vercel.app",
      protocol: "https:",
    });

    expect(candidates).toEqual([
      "https://trailup.vercel.app/trailup-api",
      "https://trailup-frontend-8nw9al-e68946-87-99-146-75.traefik.me",
    ]);
  });

  it("usa o fallback local (porta 8000) e nao o proxy em dev local", () => {
    const candidates = buildApiBaseUrlCandidates({
      envBaseUrl: "",
      origin: "http://localhost:8080",
      hostname: "localhost",
      protocol: "http:",
    });

    expect(candidates).toEqual(["http://localhost:8000"]);
  });

  it("nao repete candidatos identicos", () => {
    const candidates = buildApiBaseUrlCandidates({
      envBaseUrl: "https://trailup.vercel.app/trailup-api",
      origin: "https://trailup.vercel.app",
      hostname: "trailup.vercel.app",
      protocol: "https:",
    });

    expect(candidates).toEqual(["https://trailup.vercel.app/trailup-api"]);
  });
});
