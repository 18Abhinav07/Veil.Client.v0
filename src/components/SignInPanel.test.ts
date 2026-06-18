import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSignInPanel() {
  return readFileSync(join(root, "src", "components", "SignInPanel.tsx"), "utf8");
}

test("sign-in panel keeps the Google OAuth and remembered-account contract", () => {
  const source = readSignInPanel();

  assert.match(source, /Continue with Google/);
  assert.match(source, /session-card/);
  assert.match(source, /Continue as/);
  assert.match(source, /Use another account/);
  assert.match(source, /login_hint/);
  assert.match(source, /prompt:\s*"select_account"/);
});

test("sign-in panel shows a button loader immediately after Google continuation starts", () => {
  const source = readSignInPanel();

  assert.match(source, /Loader2/);
  assert.match(source, /pendingAction/);
  assert.match(source, /setPendingAction/);
  assert.match(source, /aria-busy=\{pendingAction !== null\}/);
  assert.match(source, /disabled=\{pendingAction !== null\}/);
  assert.match(source, /animate-spin/);
});

test("sign-in panel is production themed with high-end media and font dependencies", () => {
  const source = readSignInPanel();

  assert.match(source, /<video/);
  assert.match(source, /cloudfront\.net/);
  assert.match(source, /fonts\.googleapis\.com/);
  assert.match(source, /font-family:\s*"Inter"/);
  assert.match(source, /Veil/);
  assert.match(source, /Create your wallet/);
  assert.match(source, /Configure your account/);
  assert.match(source, /Start paying/);
});
