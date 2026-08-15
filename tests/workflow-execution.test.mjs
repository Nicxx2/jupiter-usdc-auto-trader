import assert from 'node:assert/strict';
import test from 'node:test';

import { TEST_MINT, TEST_WALLET, clone } from './fixtures/controller-state.mjs';
import { runWorkflowCode } from './helpers/workflow-source.mjs';

function authorizationInputs(overrides = {}) {
  const topic = 'test-alert-topic';
  const token = {
    name: 'Test token',
    mint: TEST_MINT,
    enabled: true,
    usd_amount: 10,
    buy_alerts: [1],
    sell_alerts: [2],
    ntfy_topic: topic,
  };
  const controller = {
    mode: 'testing',
    master: true,
    safetyLock: false,
    maxTradeUSDC: 25,
    minSolReserve: 0.02,
    slippagePct: 1,
    maxPriceImpactPct: 2,
    tokens: { [TEST_MINT]: { autoBuy: true, autoSell: true, wallet: TEST_WALLET } },
  };
  const alert = {
    event: 'message',
    id: 'event-1',
    title: 'Buy Price Alert: Test token',
    message: `Token: Test token (${TEST_MINT})\nBuy price $0.95 is <= target $1`,
    topic,
    time: Math.floor(Date.now() / 1000),
    _gatewayTokenReady: true,
    _tradingTopicReady: false,
  };
  const values = {
    api: { tokens: [token], summaries: [{ mint: TEST_MINT, ntfy_effective_topic: topic }] },
    controller,
    alert,
    ...overrides,
  };
  return {
    json: {},
    nodes: {
      'Get Jupiter App State': values.api,
      'Get Trading Controller State': { state: values.controller },
      'NTFY Alert': { body: values.alert },
    },
  };
}

test('workflow authorization accepts an exact, current, enabled BUY alert', async () => {
  const result = await runWorkflowCode('Parse + Authorize', authorizationInputs());
  assert.equal(result.eligible, true);
  assert.equal(result.reason, null);
  assert.equal(result.mint, TEST_MINT);
  assert.equal(result.direction, 'BUY');
  assert.equal(result.target, 1);
  assert.equal(result.usdAmount, 10);
  assert.equal(result.assignedWallet, TEST_WALLET);
});

test('workflow authorization rejects changed controls, duplicate mints, forged topics, and stale alerts', async () => {
  const cases = [];

  const masterOff = authorizationInputs();
  masterOff.nodes['Get Trading Controller State'].state.master = false;
  cases.push([masterOff, /MASTER AUTO TRADING is OFF/]);

  const duplicateMint = authorizationInputs();
  duplicateMint.nodes['Get Jupiter App State'].tokens.push(
    clone(duplicateMint.nodes['Get Jupiter App State'].tokens[0]),
  );
  cases.push([duplicateMint, /does not uniquely match/]);

  const forgedTopic = authorizationInputs();
  forgedTopic.nodes['NTFY Alert'].body.topic = 'wrong-topic';
  cases.push([forgedTopic, /topic does not match/]);

  const stale = authorizationInputs();
  stale.nodes['NTFY Alert'].body.time = Math.floor(Date.now() / 1000) - 121;
  cases.push([stale, /stale\/invalid/]);

  const excessive = authorizationInputs();
  excessive.nodes['Get Jupiter App State'].tokens[0].usd_amount = 26;
  cases.push([excessive, /exceeds max trade cap/]);

  for (const [input, reason] of cases) {
    const result = await runWorkflowCode('Parse + Authorize', input);
    assert.equal(result.eligible, false);
    assert.match(result.reason, reason);
  }
});

test('BUY quote evaluation preserves target and percentage-impact boundaries', async () => {
  const controller = { target: 1, maxPriceImpactPct: 2 };
  const pass = await runWorkflowCode('Evaluate BUY #1', {
    json: { amountIn: 10, amountOut: 10.5, priceImpactPct: 0.02 },
    nodes: { 'Parse + Authorize': controller },
  });
  assert.equal(pass.pass, true);
  assert.equal(pass.price1, 10 / 10.5);
  assert.equal(pass.impact1Percent, 2);

  const priceFail = await runWorkflowCode('Evaluate BUY #1', {
    json: { amountIn: 11, amountOut: 10, priceImpactPct: 0.01 },
    nodes: { 'Parse + Authorize': controller },
  });
  assert.equal(priceFail.pass, false);
  assert.match(priceFail.reason, /price is above/);

  const impactFail = await runWorkflowCode('Evaluate BUY #1', {
    json: { amountIn: 10, amountOut: 11, priceImpactPct: 0.020001 },
    nodes: { 'Parse + Authorize': controller },
  });
  assert.equal(impactFail.pass, false);
  assert.match(impactFail.reason, /price impact/);
});

test('second BUY quote cannot override a failed first validation', async () => {
  const result = await runWorkflowCode('Evaluate BUY #2', {
    json: { amountIn: 9, amountOut: 10, priceImpactPct: 0.01 },
    nodes: {
      'Parse + Authorize': { target: 1, maxPriceImpactPct: 2 },
      'Evaluate BUY #1': { pass: false, reason: 'first quote failed', price1: 1.1, impact1Percent: 1 },
    },
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'first quote failed');
});

test('SELL quote evaluation reuses the scenario-sized token amount', async () => {
  const controller = { target: 1, maxPriceImpactPct: 2 };
  const pass = await runWorkflowCode('Evaluate SELL #1', {
    json: { amountIn: 5, amountOut: 5.5, priceImpactPct: 0.01 },
    nodes: {
      'Parse + Authorize': controller,
      'Scenario Quote #1': { amountOut: 5, priceImpactPct: 0.01 },
    },
  });
  assert.equal(pass.pass, true);
  assert.equal(pass.tokenAmount, 5);
  assert.equal(pass.price1, 1.1);

  const mismatch = await runWorkflowCode('Evaluate SELL #1', {
    json: { amountIn: 4.9, amountOut: 5.5, priceImpactPct: 0.01 },
    nodes: {
      'Parse + Authorize': controller,
      'Scenario Quote #1': { amountOut: 5, priceImpactPct: 0.01 },
    },
  });
  assert.equal(mismatch.pass, false);
  assert.match(mismatch.reason, /differs from scenario sizing/);
});

function finalSafetyInputs(direction = 'BUY') {
  const target = 1;
  const context = {
    name: 'Test token',
    mint: TEST_MINT,
    direction,
    target,
    topic: 'test-alert-topic',
    usdAmount: 10,
    assignedWallet: TEST_WALLET,
    maxPriceImpactPct: 2,
    maxTradeUSDC: 25,
  };
  const token = {
    name: 'Test token',
    mint: TEST_MINT,
    enabled: true,
    usd_amount: 10,
    buy_alerts: [target],
    sell_alerts: [target],
    ntfy_topic: context.topic,
  };
  const state = {
    mode: 'trading',
    master: true,
    safetyLock: false,
    minSolReserve: 0.02,
    maxPriceImpactPct: 2,
    maxTradeUSDC: 25,
    tokens: {
      [TEST_MINT]: { autoBuy: true, autoSell: true, wallet: TEST_WALLET },
    },
  };
  const balances = {
    assigned: true,
    configured: true,
    backupConfirmed: true,
    wallet: TEST_WALLET,
    sol: 0.1,
    usdc: 20,
    token: 20,
  };
  const quote = direction === 'BUY'
    ? { quoteId: 'quote-buy', tokenIn: 'USDC', tokenOut: TEST_MINT, amountIn: 10, amountOut: 11, priceImpactPct: 0.01 }
    : { quoteId: 'quote-sell', tokenIn: TEST_MINT, tokenOut: 'USDC', amountIn: 10, amountOut: 11, priceImpactPct: 0.01 };
  return { context, token, state, balances, quote, effectiveTopic: context.topic };
}

async function runFinalSafety(direction, values) {
  const prefix = direction === 'BUY' ? 'BUY' : 'SELL';
  return runWorkflowCode(`${prefix} Final Safety Evaluation`, {
    json: values.quote,
    nodes: {
      'Parse + Authorize': values.context,
      [`${prefix} Final App State`]: {
        tokens: [values.token],
        summaries: [{ mint: TEST_MINT, ntfy_effective_topic: values.effectiveTopic }],
      },
      [`${prefix} Final Controller State`]: { state: values.state },
      [`${prefix} Wallet Balances`]: values.balances,
    },
  });
}

test('final BUY and SELL workflow safety evaluations accept complete stable inputs', async () => {
  for (const direction of ['BUY', 'SELL']) {
    const result = await runFinalSafety(direction, finalSafetyInputs(direction));
    assert.equal(result.pass, true, direction);
    assert.equal(result.reason, null, direction);
    assert.equal(result.execution_capable, true, direction);
    assert.equal(result.assignedWallet, TEST_WALLET, direction);
  }
});

test('final workflow safety evaluation rejects configuration and wallet changes', async () => {
  const cases = [];

  const masterOff = finalSafetyInputs();
  masterOff.state.master = false;
  cases.push([masterOff, /MASTER\/coin control\/safety lock changed/]);

  const reassigned = finalSafetyInputs();
  reassigned.state.tokens[TEST_MINT].wallet = 'Vote111111111111111111111111111111111111111';
  cases.push([reassigned, /assignment changed/]);

  const topicChanged = finalSafetyInputs();
  topicChanged.effectiveTopic = 'new-topic';
  cases.push([topicChanged, /topic changed/]);

  const backupMissing = finalSafetyInputs();
  backupMissing.balances.backupConfirmed = false;
  cases.push([backupMissing, /backup is not confirmed/]);

  const insufficient = finalSafetyInputs();
  insufficient.balances.usdc = 9;
  cases.push([insufficient, /balance or SOL reserve is insufficient/]);

  const capReduced = finalSafetyInputs();
  capReduced.state.maxTradeUSDC = 9;
  cases.push([capReduced, /exceeds max trade cap/]);

  for (const [values, reason] of cases) {
    const result = await runFinalSafety('BUY', values);
    assert.equal(result.pass, false);
    assert.match(result.reason, reason);
  }
});
