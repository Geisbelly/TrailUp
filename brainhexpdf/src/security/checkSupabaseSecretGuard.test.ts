import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSupabaseSecretGuard } from "./checkSupabaseSecretGuard";

// Decisao de seguranca (2026-08-17): SUPABASE_SERVICE_ROLE_KEY configurada
// sem API_SHARED_SECRET vira escrita arbitraria nao autenticada no Storage
// via /api/v1/render-and-store. Isso agora e HARD-FAIL no startup (recusa
// subir o servidor), nao mais so um console.warn.
test("lanca quando SUPABASE_SERVICE_ROLE_KEY esta presente e API_SHARED_SECRET ausente", () => {
  assert.throws(
    () => checkSupabaseSecretGuard({
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-fake",
      API_SHARED_SECRET: undefined,
    }),
    /API_SHARED_SECRET/,
  );
});

test("lanca quando API_SHARED_SECRET e string vazia ou so espacos", () => {
  assert.throws(() => checkSupabaseSecretGuard({
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-fake",
    API_SHARED_SECRET: "",
  }));
  assert.throws(() => checkSupabaseSecretGuard({
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-fake",
    API_SHARED_SECRET: "   ",
  }));
});

test("nao lanca quando os dois estao configurados", () => {
  assert.doesNotThrow(() => checkSupabaseSecretGuard({
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-fake",
    API_SHARED_SECRET: "segredo-compartilhado",
  }));
});

test("nao lanca quando SUPABASE_SERVICE_ROLE_KEY nao esta configurada (dev local sem Storage real)", () => {
  assert.doesNotThrow(() => checkSupabaseSecretGuard({
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    API_SHARED_SECRET: undefined,
  }));
});
