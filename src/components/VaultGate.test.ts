import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("VaultGate exposes create, unlock, recovery restore, password rotation, lock, and reset flows", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /createWalletVault/);
  assert.match(source, /decryptVaultWithPassword/);
  assert.match(source, /decryptVaultWithRecoveryKey/);
  assert.match(source, /rotateVaultPassword/);
  assert.match(source, /setWallet\(null\)/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /serializeVaultForStorage/);
  assert.doesNotMatch(source, /localStorage/);
});

test("VaultGate has recoverable Block 1 wallet onboarding states", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /Retry vault check/);
  assert.match(source, /Create vault/);
  assert.match(source, /Unlock vault/);
  assert.match(source, /Recovery restore/);
  assert.match(source, /Vault security/);
  assert.match(source, /Recovery key saved/);
  assert.match(source, /data-testid="vault-gate"/);
  assert.match(source, /data-testid="vault-security-bar"/);
});

test("VaultGate does not show a full onboarding step before unlock", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.doesNotMatch(source, /Security Gate/);
  assert.doesNotMatch(source, /Checking local vault/);
  assert.doesNotMatch(source, /Connecting to your secure cryptographic local vault/);
  assert.doesNotMatch(source, /fixed left-1\/2 top-1\/2 h-1 w-20/);
  assert.doesNotMatch(source, /loadingSlow/);
  assert.match(source, /InitialVaultLookup/);
});

test("VaultGate waits for pool registration status before showing registration form", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /registrationStatus === null/);
  assert.match(source, /Checking pool registration/);
  assert.match(source, /registrationStatus !== null && !registrationStatus\.registeredInPool/);
});

test("VaultGate presents wallet bootstrap as the third post-membership sign-in step", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /prepareWallet\?:/);
  assert.match(source, /walletPreparing/);
  assert.match(source, /runWalletPreparation/);
  assert.match(source, /Loading wallet/);
  assert.match(source, /<StepItem number=\{3\} text="Loading wallet" active/);
  assert.match(source, /Retry loading wallet/);
});

test("VaultGate can keep an unlocked vault only for the current browser tab", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /KEEP_UNLOCKED_SESSION_KEY/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /rememberUnlockedVault/);
  assert.match(source, /restoreRememberedVault/);
  assert.match(source, /Keep vault unlocked for this tab/);
  assert.match(source, /const \[keepUnlockedForTab, setKeepUnlockedForTab\] = useState\(true\)/);
  assert.doesNotMatch(source, /localStorage/);
});

test("VaultGate remembers created and unlocked wallets in the current tab by default", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(
    source,
    /const unlocked = await decryptVaultWithPassword\(vault, password\);[\s\S]*rememberUnlockedVault\(unlocked\)/,
  );
  assert.match(
    source,
    /const unlocked = await decryptVaultWithPassword\(toVault\(remoteVault\), password\);[\s\S]*rememberUnlockedVault\(unlocked\)/,
  );
  assert.match(source, /Locking the wallet clears it/);
});

test("VaultGate checks remembered tab vault before rendering the unlock form", () => {
  const source = readFileSync(join(root, "src", "components", "VaultGate.tsx"), "utf8");

  assert.match(source, /rememberedVaultChecked/);
  assert.match(source, /setRememberedVaultChecked\(false\)/);
  assert.match(source, /setRememberedVaultChecked\(true\)/);
  assert.match(source, /remoteVault && !wallet && !rememberedVaultChecked/);
  assert.match(source, /restoreRememberedVault\(\)/);
});
