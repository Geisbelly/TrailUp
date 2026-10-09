import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_CALLBACK_PATH,
  isExpoGoEnvironment,
  parseOAuthCallbackParams,
  requirePkceAuthorizationCode,
  resolveAppScheme,
  resolveGoogleRedirectOptions,
} from "./googleRedirect.core";
test("issue #217: native callback uses the scheme declared in app config", () => {
  assert.deepEqual(resolveGoogleRedirectOptions("trailupappdsm2502", false), {
    scheme: "trailupappdsm2502",
    path: "auth/callback",
  });
  assert.equal(GOOGLE_CALLBACK_PATH, "auth/callback");
});

test("issue #217: Expo Go callback is derived without a native build scheme", () => {
  assert.deepEqual(resolveGoogleRedirectOptions("trailupappdsm2502", true), {
    path: "auth/callback",
  });
});

test("issue #217: refuses native redirect when app scheme is absent", () => {
  assert.equal(resolveAppScheme(undefined), null);
  assert.equal(resolveAppScheme(["", "trailupappdsm2502"]), null);
  assert.throws(
    () => resolveGoogleRedirectOptions(undefined, false),
    /Scheme do aplicativo não configurado/,
  );
});

test("issue #217: reads string and array schemes from Expo app config", () => {
  assert.equal(resolveAppScheme("trailupappdsm2502"), "trailupappdsm2502");
  assert.equal(resolveAppScheme(["trailupappdsm2502", "trailup"]), "trailupappdsm2502");
});

test("issue #217: recognizes Expo Go environments", () => {
  assert.equal(isExpoGoEnvironment({ executionEnvironment: "storeClient" }), true);
  assert.equal(isExpoGoEnvironment({ appOwnership: "expo" }), true);
  assert.equal(isExpoGoEnvironment({ executionEnvironment: "bare", appOwnership: "standalone" }), false);
});

test("issue #217: parses PKCE query callbacks", () => {
  const params = parseOAuthCallbackParams("trailupappdsm2502://auth/callback?code=pkce-code&state=123");
  assert.equal(params.get("code"), "pkce-code");
  assert.equal(params.get("state"), "123");
});

test("issue #217: provider errors are parsed and bearer tokens without PKCE code are rejected", () => {
  const tokenParams = parseOAuthCallbackParams(
    "trailupappdsm2502://auth/callback#access_token=access&refresh_token=refresh",
  );
  assert.throws(() => requirePkceAuthorizationCode(tokenParams), /Resposta OAuth incompleta/);

  const errorParams = parseOAuthCallbackParams(
    "trailupappdsm2502://auth/callback?error=denied#error_description=consent%20denied",
  );
  assert.equal(errorParams.get("error_description"), "consent denied");
  assert.equal(errorParams.get("error"), "denied");
});

test("issue #217: fragment values override duplicate query parameters", () => {
  const params = parseOAuthCallbackParams("trailupappdsm2502://auth/callback?code=stale#code=current");
  assert.equal(params.get("code"), "current");
});
