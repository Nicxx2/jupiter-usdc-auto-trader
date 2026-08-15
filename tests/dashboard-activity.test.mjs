import assert from 'node:assert/strict';
import test from 'node:test';

import { TEST_MINT, TEST_WALLET } from './fixtures/controller-state.mjs';
import { composeSource, evaluateComposeSource, extractComposeSource } from './helpers/compose-source.mjs';

const activitySource = extractComposeSource(
  'const ACTIVITY_DECISIONS',
  'function persistedSchemaError',
  { label: 'recent alert activity helpers' },
);
const activityPrelude = `
  function isMint(v) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(v || '')); }
  function isSolanaSignature(v) { return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(String(v || '')); }
  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
`;
const {
  activityDecisionRecord,
  activityGuidance,
  mergeRecentAlertActivity,
  normalizeActivityDecision,
  resolveN8nTerminalResponse,
  terminalActivityDecision,
} = evaluateComposeSource(
  activitySource,
  '{ activityDecisionRecord, activityGuidance, mergeRecentAlertActivity, normalizeActivityDecision, resolveN8nTerminalResponse, terminalActivityDecision }',
  activityPrelude,
);

const dashboardStart = composeSource.indexOf('async function dashboard');
const dashboardEnd = composeSource.indexOf('function loginPage', dashboardStart);
const dashboard = composeSource.slice(dashboardStart, dashboardEnd);

test('alert results retain bounded useful fields without trusting malformed values', () => {
  const signature = '1'.repeat(64);
  const controllerState = {
    mode: 'trading',
    master: true,
    tokens: { [TEST_MINT]: { autoBuy: true, autoSell: false } },
  };
  const record = activityDecisionRecord({
    id: 'event-123',
    topic: ' private-topic ',
    title: '  SRE   BUY   alert  ',
  }, {
    decision: 'CONFIRMED',
    reason: `Confirmed ${'r'.repeat(700)}`,
    token: 'SRE',
    mint: TEST_MINT,
    direction: 'buy',
    target: 0.00002,
    assignedWallet: TEST_WALLET,
    walletNickname: 'Small test wallet',
    maxPriceImpactPct: 2,
    maxTradeUSDC: 25,
    balances: {
      wallet: TEST_WALLET,
      backupConfirmed: true,
      sol: 0.05,
      usdc: 8,
      token: 100_000,
      minSolReserve: 0.02,
    },
    trade: {
      usdAmount: 2,
      effectivePrice: 0.000019,
      priceImpactPercent: 0.25,
      signature,
    },
  }, null, controllerState);

  assert.equal(record.id, 'event-123');
  assert.equal(record.topic, 'private-topic');
  assert.equal(record.title, 'SRE BUY alert');
  assert.equal(record.decision, 'TRADE_CONFIRMED');
  assert.equal(record.reason.length, 600);
  assert.equal(record.mint, TEST_MINT);
  assert.equal(record.direction, 'BUY');
  assert.equal(record.mode, 'TRADING');
  assert.equal(record.master, true);
  assert.equal(record.autoEnabled, true);
  assert.equal(record.amountIn, 2);
  assert.equal(record.finalPrice, 0.000019);
  assert.equal(record.priceImpactPercent, 0.25);
  assert.equal(record.maxPriceImpactPct, 2);
  assert.equal(record.maxTradeUSDC, 25);
  assert.equal(record.wallet, TEST_WALLET);
  assert.equal(record.walletNickname, 'Small test wallet');
  assert.equal(record.walletBackupConfirmed, true);
  assert.equal(record.balanceSol, 0.05);
  assert.equal(record.balanceUsdc, 8);
  assert.equal(record.balanceToken, 100_000);
  assert.equal(record.minSolReserve, 0.02);
  assert.equal(record.signature, signature);

  const malformed = activityDecisionRecord({ id: 'x'.repeat(129) }, {
    decision: 'SOMETHING_NEW',
    mint: '<script>',
    direction: 'SIDEWAYS',
    target: '1',
    amountIn: Number.POSITIVE_INFINITY,
    signature: 'not-a-signature',
    assignedWallet: '<script>',
    balances: { backupConfirmed: false, sol: '10', usdc: -1, token: null, minSolReserve: Number.NaN },
  }, null, { mode: 'testing', master: false, tokens: {} });
  assert.equal(malformed.decision, 'PROCESSED');
  assert.equal(malformed.id, null);
  assert.equal(malformed.mint, null);
  assert.equal(malformed.direction, null);
  assert.equal(malformed.target, null);
  assert.equal(malformed.amountIn, null);
  assert.equal(malformed.signature, null);
  assert.equal(malformed.wallet, null);
  assert.equal(malformed.walletBackupConfirmed, null);
  assert.equal(malformed.balanceSol, null);
  assert.equal(malformed.balanceUsdc, null);
  assert.equal(malformed.balanceToken, null);
  assert.equal(malformed.minSolReserve, null);
});

test('only recognized terminal n8n decisions can complete a handoff', () => {
  for (const [input, expected] of [
    ['IGNORED', 'IGNORED'],
    ['WOULD_TRADE', 'WOULD_TRADE'],
    ['TRADE_CONFIRMED', 'TRADE_CONFIRMED'],
    ['CONFIRMED', 'TRADE_CONFIRMED'],
    ['FAILED', 'TRADE_FAILED'],
    ['PENDING', 'TRADE_UNCERTAIN'],
    ['UNCERTAIN', 'TRADE_UNCERTAIN'],
    ['TRIGGER_GUARD_SUPPRESSED', 'TRIGGER_GUARD_SUPPRESSED'],
  ]) {
    assert.equal(terminalActivityDecision(input), expected, input);
  }
  for (const input of [null, '', 'PROCESSING', 'PROCESSED', 'OK', 'SUCCESS', 'SOMETHING_NEW', {}, []]) {
    assert.equal(terminalActivityDecision(input), null, String(input));
  }
});

test('invalid successful n8n responses stop safely or recover only a durable trade result', () => {
  const valid = { decision: 'IGNORED', reason: 'Not a normal price alert' };
  const accepted = resolveN8nTerminalResponse(valid);
  assert.equal(accepted.result, valid);
  assert.equal(accepted.terminalDecision, 'IGNORED');
  assert.equal(accepted.responseProblem, null);

  for (const invalid of [null, [], 'OK', { decision: 'PROCESSING' }, { decision: 'SOMETHING_NEW' }]) {
    const stopped = resolveN8nTerminalResponse(invalid);
    assert.equal(stopped.terminalDecision, 'ABORTED');
    assert.equal(stopped.result.execution, 'NONE');
    assert.match(stopped.result.reason, /will not be replayed automatically/);
    assert.equal(stopped.recoveredFromTrade, false);
  }

  const trade = { status: 'CONFIRMED', alertId: 'event-123', signature: '1'.repeat(64) };
  const recovered = resolveN8nTerminalResponse(null, trade, 'n8n returned a non-JSON response');
  assert.equal(recovered.terminalDecision, 'TRADE_CONFIRMED');
  assert.equal(recovered.result.trade, trade);
  assert.equal(recovered.recoveredFromTrade, true);
  assert.match(recovered.result.activityNote, /durable trade record was used/);

  const matching = resolveN8nTerminalResponse({ decision: 'TRADE_CONFIRMED' }, trade);
  assert.equal(matching.terminalDecision, 'TRADE_CONFIRMED');
  assert.equal(matching.responseProblem, null);
  assert.equal(matching.result.trade, trade);
  assert.equal(matching.result.activityNote, null);

  const conflicting = resolveN8nTerminalResponse({ decision: 'IGNORED' }, trade);
  assert.equal(conflicting.terminalDecision, 'TRADE_CONFIRMED');
  assert.match(conflicting.responseProblem, /conflicted with the durable trade result/);
  assert.equal(conflicting.result.trade, trade);
  assert.match(conflicting.result.activityNote, /durable trade record was used/);

  const unresolved = resolveN8nTerminalResponse({}, { status: 'SUBMITTING', alertId: 'event-456' });
  assert.equal(unresolved.terminalDecision, 'TRADE_UNCERTAIN');
  assert.equal(unresolved.recoveredFromTrade, true);
});

test('live-trade outcomes require a durable controller record while suppressions do not', () => {
  for (const unsupported of [
    { decision: 'TRADE_CONFIRMED' },
    { decision: 'TRADE_FAILED' },
    { decision: 'TRADE_UNCERTAIN' },
    { decision: 'TRADE_RESULT' },
  ]) {
    const stopped = resolveN8nTerminalResponse(unsupported);
    assert.equal(stopped.terminalDecision, 'ABORTED');
    assert.match(stopped.responseProblem, /without a durable controller record/);
    assert.equal(stopped.recoveredFromTrade, false);
  }

  for (const suppression of [
    { decision: 'BURST_SUPPRESSED' },
    { decision: 'TRIGGER_GUARD_SUPPRESSED' },
  ]) {
    const accepted = resolveN8nTerminalResponse(suppression);
    assert.equal(accepted.terminalDecision, suppression.decision);
    assert.equal(accepted.responseProblem, null);
  }
});

test('retries merge into one alert and a terminal result cannot be replaced by replay noise', () => {
  const rows = [
    { at: '2026-08-15T10:00:00.000Z', kind: 'NTFY_RECEIVED', id: 'retry-1', title: 'SRE SELL' },
    { at: '2026-08-15T10:00:01.000Z', kind: 'NTFY_PROCESSING_ERROR', id: 'retry-1', publicReason: 'Temporary handoff failure' },
    { at: '2026-08-15T10:00:02.000Z', kind: 'NTFY_RECEIVED', id: 'retry-1', title: 'SRE SELL retry' },
    {
      at: '2026-08-15T10:00:03.000Z', kind: 'NTFY_DECISION', id: 'retry-1',
      decision: 'WOULD_TRADE', reason: 'Testing mode blocks submission', token: 'SRE',
      mint: TEST_MINT, direction: 'SELL', mode: 'TESTING', master: false,
    },
    { at: '2026-08-15T10:00:04.000Z', kind: 'NTFY_RECEIVED', id: 'retry-1', title: 'late duplicate' },
    { at: '2026-08-15T10:00:05.000Z', kind: 'NTFY_DECISION', id: 'retry-1', decision: 'WOULD_TRADE' },
    { at: '2026-08-15T10:00:06.000Z', kind: 'NTFY_DECISION', id: 'retry-1', decision: 'unknown legacy value' },
    { at: '2026-08-15T10:01:00.000Z', kind: 'NTFY_DECISION', id: 'newer-2', decision: 'IGNORED', reason: 'RSI alert' },
  ];

  const activity = mergeRecentAlertActivity(rows, 10);
  assert.equal(activity.length, 2);
  assert.equal(activity[0].id, 'newer-2');
  assert.equal(activity[1].id, 'retry-1');
  assert.equal(activity[1].decision, 'WOULD_TRADE');
  assert.equal(activity[1].receivedAt, '2026-08-15T10:00:00.000Z');
  assert.equal(activity[1].updatedAt, '2026-08-15T10:00:05.000Z');
  assert.equal(activity[1].title, 'SRE SELL retry');
  assert.equal(activity[1].token, 'SRE');
  assert.equal(activity[1].mint, TEST_MINT);
  assert.equal(activity[1].reason, 'Testing mode blocks submission');

  assert.deepEqual(mergeRecentAlertActivity(rows, 1).map(item => item.id), ['newer-2']);
  assert.equal(mergeRecentAlertActivity(null, 10).length, 0);
  assert.equal(mergeRecentAlertActivity([
    { at: '2026-08-15T10:02:00.000Z', kind: 'NTFY_RECEIVED', id: 'x'.repeat(129) },
    { at: '2026-08-15T10:02:01.000Z', kind: 'NTFY_RECEIVED', id: 123 },
    { at: '2026-08-15T10:02:02.000Z', kind: 'NTFY_RECEIVED', id: '   ' },
  ], 10).length, 0);
});

test('a received alert without a terminal result becomes visibly stale without changing persistence', () => {
  const received = { at: '2026-08-15T10:00:00.000Z', kind: 'NTFY_RECEIVED', id: 'interrupted-1' };
  const stillProcessing = mergeRecentAlertActivity([received], 10, Date.parse('2026-08-15T10:09:59.000Z'))[0];
  const stale = mergeRecentAlertActivity([received], 10, Date.parse('2026-08-15T10:10:01.000Z'))[0];

  assert.equal(stillProcessing.decision, 'PROCESSING');
  assert.equal(stale.decision, 'PROCESSING_ERROR');
  assert.match(stale.reason, /No terminal decision was recorded within 10 minutes/);
  assert.deepEqual(received, { at: '2026-08-15T10:00:00.000Z', kind: 'NTFY_RECEIVED', id: 'interrupted-1' });
});

test('activity guidance distinguishes expected filters, dry runs, safety stops, and uncertain trades', () => {
  assert.match(activityGuidance({ decision: 'IGNORED', reason: 'This is an RSI alert' }), /Only fresh normal BUY\/SELL/);
  assert.match(activityGuidance({ decision: 'IGNORED', reason: 'MASTER is OFF' }), /Turn MASTER on/);
  assert.match(activityGuidance({ decision: 'ABORTED', reason: 'Insufficient USDC balance' }), /will not silently reduce/);
  assert.match(activityGuidance({ decision: 'WOULD_TRADE', reason: 'Testing mode' }), /expected dry-run/);
  assert.match(activityGuidance({ decision: 'UNCERTAIN', reason: 'Unknown result' }), /Do not retry/);
  assert.equal(normalizeActivityDecision('UNCERTAIN'), 'TRADE_UNCERTAIN');
});

test('dashboard activity and trade histories are compact, expandable, responsive, and private by default', () => {
  for (const marker of [
    '<details class="panel activity-panel">',
    'class="summarymeta activity-summarymeta"',
    'alertActivity.slice(0,3)',
    'alertActivity.slice(3)',
    'recentTradeRows=trades.slice(-10).reverse()',
    'recentTradeRows.slice(0,3)',
    'recentTradeRows.slice(3)',
    'class="more-results activity-more"',
    'class="more-results trades-more"',
    'Retried delivery updates the same alert entry.',
    '.activity-summarymeta{display:block',
    '.activity-grid{grid-template-columns:minmax(0,1fr)}',
  ]) {
    assert.ok(dashboard.includes(marker), marker);
  }

  assert.doesNotMatch(dashboard, /<details class="panel activity-panel"\s+open/);
  assert.doesNotMatch(dashboard, /activityDetailField\(['"](?:Topic|Raw payload|Raw response)/i);
  assert.ok(dashboard.includes('<details class="activity-item tone-$${tone}">'));
  assert.ok(dashboard.includes('<b>What to check:</b>'));
  assert.ok(dashboard.includes("activityDetailField('Mode at receipt'"));
  assert.ok(dashboard.includes("activityDetailField('MASTER at receipt'"));
  assert.ok(dashboard.includes("activityDetailField('AUTO direction at receipt'"));
  assert.ok(dashboard.includes("activityDetailField('Assigned wallet'"));
  assert.ok(dashboard.includes("activityDetailField('Wallet SOL'"));
  assert.ok(dashboard.includes("activityDetailField('Impact cap'"));
  assert.ok(dashboard.includes("activityDetailField('Internal response note'"));
  assert.ok(dashboard.includes('item.signature?'));
  assert.ok(composeSource.includes('isSolanaSignature(signatureCandidate)'));
  assert.ok(composeSource.includes('activityDecisionRecord(msg,result,lastDecision,activityStateAtReceipt)'));
  assert.ok(composeSource.includes("responseProblem='n8n returned a non-JSON response'"));
  assert.ok(composeSource.includes("terminalDecision='ABORTED'"));
  assert.ok(composeSource.includes('this alert was stopped and will not be replayed automatically'));
  assert.ok(composeSource.includes('using the durable idempotent trade result'));
  assert.ok(composeSource.includes("addAudit('TRADE_UNCERTAIN_INVALID_N8N_RESPONSE',{alertId:msg.id})"));
});
