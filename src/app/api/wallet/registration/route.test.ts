import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet registration API prepares and stores public pool registration only", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "registration", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /getWalletServerEnv/);
  assert.match(source, /ASP_MEMBERSHIP_ADMIN_SECRET/);
  assert.match(source, /RegistrationServiceConfigError/);
  assert.match(source, /status: error instanceof RegistrationServiceConfigError \? 503 : 400/);
  assert.match(source, /prove\/register-asp-membership/);
  assert.match(source, /prove\/register/);
  assert.match(source, /membershipLeafHex/);
  assert.match(source, /notePublicKeyHex/);
  assert.match(source, /encryptionPublicKeyHex/);
  assert.match(source, /membershipBlindingHex/);
  assert.match(source, /markWalletRegisteredInPool/);
  assert.doesNotMatch(source, /stellarSecretKey/);
  assert.doesNotMatch(source, /notePrivateKeyHex/);
  assert.doesNotMatch(source, /x25519PrivateJwk/);
});
