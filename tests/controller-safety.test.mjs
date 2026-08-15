import assert from 'node:assert/strict';
import test from 'node:test';

import { TEST_MINT, TEST_TIME } from './fixtures/controller-state.mjs';
import { evaluateComposeSource, extractComposeSource } from './helpers/compose-source.mjs';

const numericSource = extractComposeSource(
  'function approx(a, b',
  'function isDefaultPublicSolanaRpc(url)',
  { label: 'controller numeric safety helpers' },
);
const { approx, priceImpactPercent, impactWithinLimit, requiredSolBalance } = evaluateComposeSource(
  numericSource,
  '{ approx, priceImpactPercent, impactWithinLimit, requiredSolBalance }',
  "const state={maxPriceImpactPct:2}; const WRAPPED_SOL_MINT='So11111111111111111111111111111111111111112';",
);

test('approximate comparison is finite and uses a tight relative tolerance', () => {
  assert.equal(approx(1, 1 + 1e-10), true);
  assert.equal(approx(1, 1.00001), false);
  assert.equal(approx(Number.NaN, 1), false);
  assert.equal(approx(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY), false);
});

test('Jupiter price impact is converted from a ratio to percentage points', () => {
  assert.equal(priceImpactPercent(0), 0);
  assert.equal(priceImpactPercent(0.019), 1.9);
  assert.equal(priceImpactPercent('0.02'), null);
  assert.equal(priceImpactPercent(null), null);
  assert.equal(priceImpactPercent(''), null);
  assert.equal(priceImpactPercent(undefined), null);
  assert.equal(priceImpactPercent(-0.01), null);
  assert.equal(priceImpactPercent('not-a-number'), null);

  assert.equal(impactWithinLimit(0.02), true);
  assert.equal(impactWithinLimit(0.020001), false);
  assert.equal(impactWithinLimit(0.01, Number.NaN), false);
});

test('a native SOL sale reserves both the trade amount and configured fee balance', () => {
  const wrappedSol = 'So11111111111111111111111111111111111111112';
  assert.equal(requiredSolBalance(wrappedSol, 'SELL', 1.5, 0.02), 1.52);
  assert.equal(requiredSolBalance(wrappedSol, 'BUY', 1.5, 0.02), 0.02);
  assert.equal(requiredSolBalance(TEST_MINT, 'SELL', 1.5, 0.02), 0.02);
  assert.equal(requiredSolBalance(wrappedSol, 'SELL', '1.5', 0.02), Number.POSITIVE_INFINITY);
  assert.equal(requiredSolBalance(wrappedSol, 'SELL', 1.5, '0.02'), Number.POSITIVE_INFINITY);
});

function createGuardHarness(initialGuards = {}, initialTrades = []) {
  const guardSource = extractComposeSource(
    'function triggerGuardKey(mint,direction,target)',
    '// Crash/restart recovery: an unresolved submission is never silently retried.',
    { label: 'controller trigger-guard helpers' },
  );
  return new Function('initialGuards', 'initialTrades', `
    let triggerGuards=structuredClone(initialGuards);
    let trades=structuredClone(initialTrades);
    let saveCount=0;
    function saveTriggerGuards(){saveCount+=1;}
    ${guardSource}
    return {
      triggerGuardKey,
      guardStatus,
      pruneExpiredTriggerGuards,
      guards:()=>structuredClone(triggerGuards),
      saveCount:()=>saveCount,
    };
  `)(initialGuards, initialTrades);
}

function guardFixture(overrides = {}) {
  return {
    at: TEST_TIME,
    alertId: 'event-1',
    mint: TEST_MINT,
    direction: 'BUY',
    target: 1,
    resetMinutes: 5,
    ...overrides,
  };
}

test('trigger-guard keys use a stable full-mint, direction, and target identity', () => {
  const harness = createGuardHarness();
  assert.equal(
    harness.triggerGuardKey(TEST_MINT, 'BUY', 1),
    `${TEST_MINT}|BUY|${Number(1).toPrecision(16)}`,
  );
  assert.notEqual(
    harness.triggerGuardKey(TEST_MINT, 'BUY', 1),
    harness.triggerGuardKey(TEST_MINT, 'SELL', 1),
  );
});

test('an expired resolved guard is removed and persisted', () => {
  const row = guardFixture({ at: new Date(Date.now() - 10 * 60_000).toISOString() });
  const key = `${row.mint}|${row.direction}|${Number(row.target).toPrecision(16)}`;
  const harness = createGuardHarness({ [key]: row }, [{ alertId: row.alertId, status: 'CONFIRMED' }]);

  assert.deepEqual(harness.guardStatus({ mint: TEST_MINT }, 'BUY', 1), { blocked: false, key, row: null });
  assert.deepEqual(harness.guards(), {});
  assert.equal(harness.saveCount(), 1);
});

test('zero-minute and unresolved or reviewed guards require explicit reset', () => {
  for (const status of ['SUBMITTING', 'PENDING', 'UNCERTAIN', 'REVIEWED']) {
    const row = guardFixture({ at: new Date(Date.now() - 24 * 60 * 60_000).toISOString() });
    const key = `${row.mint}|${row.direction}|${Number(row.target).toPrecision(16)}`;
    const harness = createGuardHarness({ [key]: row }, [{ alertId: row.alertId, status }]);
    assert.equal(harness.guardStatus({ mint: TEST_MINT }, 'BUY', 1).blocked, true, status);
    assert.equal(harness.saveCount(), 0, status);
  }

  const zero = guardFixture({ resetMinutes: 0, at: new Date(0).toISOString() });
  const zeroKey = `${zero.mint}|${zero.direction}|${Number(zero.target).toPrecision(16)}`;
  const zeroHarness = createGuardHarness({ [zeroKey]: zero }, []);
  assert.equal(zeroHarness.guardStatus({ mint: TEST_MINT }, 'BUY', 1).blocked, true);
});

test('bulk guard pruning removes only expired, resolved timed guards', () => {
  const expired = guardFixture({ alertId: 'resolved', at: new Date(Date.now() - 10 * 60_000).toISOString() });
  const uncertain = guardFixture({ alertId: 'uncertain', at: new Date(Date.now() - 10 * 60_000).toISOString(), target: 2 });
  const active = guardFixture({ alertId: 'active', at: new Date().toISOString(), target: 3 });
  const zero = guardFixture({ alertId: 'zero', at: new Date(0).toISOString(), target: 4, resetMinutes: 0 });
  const keyed = Object.fromEntries([expired, uncertain, active, zero].map(row => [
    `${row.mint}|${row.direction}|${Number(row.target).toPrecision(16)}`,
    row,
  ]));
  const harness = createGuardHarness(keyed, [{ alertId: 'uncertain', status: 'UNCERTAIN' }]);

  harness.pruneExpiredTriggerGuards();
  const remaining = Object.values(harness.guards()).map(row => row.alertId).sort();
  assert.deepEqual(remaining, ['active', 'uncertain', 'zero']);
  assert.equal(harness.saveCount(), 1);
});
