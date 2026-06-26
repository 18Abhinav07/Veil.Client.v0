import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRecipientDeltas,
  isCompletedLane1State,
} from "./smoke-evidence.mjs";

const recipients = [
  { publicKey: "A" },
  { publicKey: "B" },
  { publicKey: "C" },
];

test("evaluates only recipients executed by a resumed Lane 1 smoke run", () => {
  const rows = evaluateRecipientDeltas({
    recipients,
    before: { C: "100.0000000" },
    after: { A: "100.0000000", B: "200.0000000", C: "200.0000000" },
    expectedDelta: "100.0000000",
    startIndex: 2,
  });

  assert.deepEqual(rows, [
    {
      publicKey: "C",
      before: "100.0000000",
      after: "200.0000000",
      actualDelta: "100.0000000",
      ok: true,
    },
  ]);
});

test("flags mismatched deltas for executed recipients", () => {
  const rows = evaluateRecipientDeltas({
    recipients,
    before: { B: "200.0000000" },
    after: { B: "250.0000000" },
    expectedDelta: "100.0000000",
    startIndex: 1,
  });

  assert.equal(rows[0].actualDelta, "50.0000000");
  assert.equal(rows[0].ok, false);
});

test("detects a completed persisted Lane 1 smoke state for the current note", () => {
  assert.equal(
    isCompletedLane1State(
      { noteCommitmentHex: "note-1", nextStep: 3 },
      { commitmentHex: "note-1" },
      recipients,
    ),
    true,
  );
  assert.equal(
    isCompletedLane1State(
      { noteCommitmentHex: "note-1", nextStep: 2 },
      { commitmentHex: "note-1" },
      recipients,
    ),
    false,
  );
});
