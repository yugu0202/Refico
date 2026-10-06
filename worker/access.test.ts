import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { accessJwtIdentity } from "./access.ts";

test("ctx.accessがなくても署名済みAccess JWTを検証し、偽造・別アプリ・期限切れを拒否する", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" }],
  });
  const env = {
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "preview-aud",
  };
  const issuer = "https://test.cloudflareaccess.com";
  const sign = (claims: Record<string, unknown> = {}) =>
    new SignJWT({
      email: "user@example.test",
      sub: "user-uuid",
      iss: issuer,
      aud: "preview-aud",
      exp: Math.floor(Date.now() / 1000) + 60,
      iat: Math.floor(Date.now() / 1000),
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(privateKey);
  assert.deepEqual(await accessJwtIdentity(await sign(), env, keys), {
    user_uuid: "user-uuid",
    email: "user@example.test",
    name: "user@example.test",
  });
  for (const claims of [
    { aud: "other-app" },
    { iss: "https://other.cloudflareaccess.com" },
    { exp: 1 },
    { email: undefined },
    { sub: undefined },
    { exp: undefined },
  ]) {
    assert.equal(await accessJwtIdentity(await sign(claims), env, keys), null);
  }
  const token = await sign();
  const [header, payload, signature] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString()),
      sub: "attacker",
    }),
  ).toString("base64url");
  assert.equal(
    await accessJwtIdentity(
      `${header}.${forgedPayload}.${signature}`,
      env,
      keys,
    ),
    null,
  );
  assert.equal(await accessJwtIdentity("forged", env, keys), null);
  await assert.rejects(accessJwtIdentity(token, {}, keys), /settings/);
});
