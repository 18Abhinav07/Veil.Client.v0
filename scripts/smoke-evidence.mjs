export function evaluateRecipientDeltas({
  recipients,
  before,
  after,
  expectedDelta,
  startIndex = 0,
}) {
  return recipients.slice(startIndex).map((recipient) => {
    const publicKey = recipient.publicKey;
    const beforeBalance = before[publicKey] ?? "0.0000000";
    const afterBalance = after[publicKey] ?? "0.0000000";
    const actualDeltaNumber = Number(afterBalance) - Number(beforeBalance);
    const actualDelta = actualDeltaNumber.toFixed(7);
    const ok = Math.abs(actualDeltaNumber - Number(expectedDelta)) < 1e-6;

    return {
      publicKey,
      before: beforeBalance,
      after: afterBalance,
      actualDelta,
      ok,
    };
  });
}

export function isCompletedLane1State(state, note, recipients) {
  return (
    state?.noteCommitmentHex === note?.commitmentHex &&
    Number(state?.nextStep ?? -1) >= recipients.length
  );
}
