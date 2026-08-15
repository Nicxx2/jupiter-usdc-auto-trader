import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEST_MINT,
  TEST_WALLET,
  clone,
  validAuthState,
  validCollections,
  validControllerState,
} from './fixtures/controller-state.mjs';
import { extractComposeSource } from './helpers/compose-source.mjs';

const source = extractComposeSource(
  'function isMint(v)',
  'function approx(a, b',
  { label: 'controller persisted-state validators' },
);

const validators = new Function(`
  const SEEN_FILE='seen.json';
  const TRADES_FILE='trades.json';
  const AUDIT_FILE='audit.json';
  const TRIGGER_GUARDS_FILE='trigger-guards.json';
  let seenList;
  let trades;
  let audit;
  let triggerGuards;
  ${source}
  return {
    isMint,
    isSolanaSignature,
    state: validatePersistedState,
    auth: validatePersistedAuth,
    collections(value) {
      seenList=value.seenList;
      trades=value.trades;
      audit=value.audit;
      triggerGuards=value.triggerGuards;
      validatePersistedCollections();
    },
  };
`)();

test('Solana mint, wallet, and transaction-signature shapes are bounded', () => {
  assert.equal(validators.isMint(TEST_MINT), true);
  assert.equal(validators.isMint(TEST_WALLET), true);
  assert.equal(validators.isMint('0'.repeat(32)), false);
  assert.equal(validators.isMint('1'.repeat(31)), false);
  assert.equal(validators.isMint('1'.repeat(45)), false);

  assert.equal(validators.isSolanaSignature('1'.repeat(64)), true);
  assert.equal(validators.isSolanaSignature('1'.repeat(100)), true);
  assert.equal(validators.isSolanaSignature('1'.repeat(63)), false);
  assert.equal(validators.isSolanaSignature('0'.repeat(64)), false);
  assert.equal(validators.isSolanaSignature('1'.repeat(101)), false);
});

test('complete controller, authentication, and collection fixtures are accepted', () => {
  assert.doesNotThrow(() => validators.state('state.json', validControllerState()));
  assert.doesNotThrow(() => validators.auth('auth.json', validAuthState()));
  assert.doesNotThrow(() => validators.collections(validCollections()));
});

test('controller safety fields reject wrong types and unsafe ranges', () => {
  const mutations = [
    value => { value.mode = 'live'; },
    value => { value.master = 'true'; },
    value => { value.safetyLock = 0; },
    value => { value.selectedWallet = 'not-a-wallet'; },
    value => { value.tradingNtfyTopic = 'trade-short'; },
    value => { value.minSolReserve = -1; },
    value => { value.slippagePct = 10.1; },
    value => { value.maxPriceImpactPct = Number.NaN; },
    value => { value.maxTradeUSDC = '25'; },
    value => { value.burstWindowSec = 5.5; },
    value => { value.tokens = []; },
    value => { value.tokens[TEST_MINT].autoBuy = 'true'; },
    value => { value.tokens[TEST_MINT].wallet = 'invalid'; },
    value => { value.walletBackups[TEST_WALLET] = 1; },
    value => { value.walletMeta[TEST_WALLET].createdAt = false; },
  ];

  for (const mutate of mutations) {
    const value = validControllerState();
    mutate(value);
    assert.throws(() => validators.state('state.json', value));
  }
});

test('authentication state rejects malformed hashes and session metadata', () => {
  for (const [field, replacement] of [
    ['salt', 'short'],
    ['hash', 'not-hex'.repeat(20)],
    ['sessionSecret', 'g'.repeat(64)],
    ['sessionVersion', 0],
    ['mustChange', 'false'],
  ]) {
    const value = validAuthState();
    value[field] = replacement;
    assert.throws(() => validators.auth('auth.json', value));
  }
});

test('all documented durable trade statuses remain schema-compatible', () => {
  for (const status of ['SUBMITTING', 'PENDING', 'CONFIRMED', 'FAILED', 'UNCERTAIN', 'REVIEWED']) {
    const value = validCollections();
    value.trades[0].status = status;
    assert.doesNotThrow(() => validators.collections(value), status);
  }
});

test('malformed replay, trade, audit, and trigger-guard evidence is rejected', () => {
  const mutations = [
    value => { value.seenList = [{}]; },
    value => { value.seenList = ['x'.repeat(129)]; },
    value => { value.trades[0].status = 'UNKNOWN'; },
    value => { value.trades[0].target = 0; },
    value => { value.trades[0].wallet = 'invalid'; },
    value => { delete value.audit[0].kind; },
    value => { value.audit[0].at = 'not-a-date'; },
    value => { Object.values(value.triggerGuards)[0].resetMinutes = -1; },
    value => {
      const row = Object.values(value.triggerGuards)[0];
      value.triggerGuards = { 'wrong-key': row };
    },
  ];

  for (const mutate of mutations) {
    const value = clone(validCollections());
    mutate(value);
    assert.throws(() => validators.collections(value));
  }
});
