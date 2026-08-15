export const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const TEST_WALLET = '11111111111111111111111111111111';
export const TEST_TIME = '2026-08-15T00:00:00.000Z';

export function validControllerState() {
  return {
    mode: 'trading',
    master: true,
    safetyLock: false,
    safetyReason: null,
    requirePrivateTradingTopic: false,
    burstPolicy: 'collapse',
    selectedWallet: TEST_WALLET,
    tradingNtfyTopic: 'trade-12345678901234567890123456789012',
    lastReadiness: null,
    minSolReserve: 0.02,
    slippagePct: 1,
    maxPriceImpactPct: 2,
    maxTradeUSDC: 25,
    burstWindowSec: 15,
    tokens: {
      [TEST_MINT]: { autoBuy: true, autoSell: false, wallet: TEST_WALLET },
    },
    walletBackups: { [TEST_WALLET]: true },
    walletMeta: { [TEST_WALLET]: { nickname: 'Test bot', createdAt: null } },
  };
}

export function validAuthState() {
  return {
    salt: 'a'.repeat(64),
    hash: 'b'.repeat(128),
    sessionSecret: 'c'.repeat(64),
    sessionVersion: 1,
    mustChange: false,
  };
}

export function validCollections() {
  const target = 1;
  return {
    seenList: ['event-1'],
    trades: [{
      at: TEST_TIME,
      alertId: 'event-1',
      mint: TEST_MINT,
      direction: 'BUY',
      status: 'CONFIRMED',
      wallet: TEST_WALLET,
      target,
      usdAmount: 5,
    }],
    audit: [{ at: TEST_TIME, kind: 'TRADE_CONFIRMED' }],
    triggerGuards: {
      [`${TEST_MINT}|BUY|${Number(target).toPrecision(16)}`]: {
        at: TEST_TIME,
        alertId: 'event-1',
        mint: TEST_MINT,
        direction: 'BUY',
        target,
        resetMinutes: 0,
      },
    },
  };
}

export function clone(value) {
  return structuredClone(value);
}
