import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { TEST_MINT, TEST_WALLET } from './fixtures/controller-state.mjs';
import { extractComposeSource } from './helpers/compose-source.mjs';

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

function createBalanceNormalizer(getResponse) {
  const source = extractComposeSource(
    'async function getBalancesNormalized(wallet, mint, name)',
    'function requiredApiPathsPresent(docs)',
    { label: 'controller Gateway balance normalizer' },
  );
  const gateway = async (path, options) => getResponse(path, options);
  const isMint = value => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || ''));
  return new Function('gateway', 'isMint', 'NETWORK', 'WRAPPED_SOL_MINT', `${source}\nreturn getBalancesNormalized;`)(
    gateway,
    isMint,
    'mainnet-beta',
    WRAPPED_SOL_MINT,
  );
}

test('Gateway balances accept finite non-negative numbers', async () => {
  const normalize = createBalanceNormalizer(() => ({
    balances: { SOL: 1.25, USDC: 10, [TEST_MINT]: 3.5 },
  }));
  const result = await normalize(TEST_WALLET, TEST_MINT, 'Token');

  assert.equal(result.configured, true);
  assert.equal(result.wallet, TEST_WALLET);
  assert.equal(result.sol, 1.25);
  assert.equal(result.usdc, 10);
  assert.equal(result.token, 3.5);
});

test('wrong-type, negative, non-finite, and non-object balances normalize fail closed', async () => {
  let response = { balances: { SOL: {}, USDC: ' ', [TEST_MINT]: -1, OTHER: 'Infinity' } };
  const normalize = createBalanceNormalizer(() => response);

  assert.deepEqual(
    await normalize(TEST_WALLET, TEST_MINT, 'Token'),
    {
      configured: true,
      wallet: TEST_WALLET,
      sol: 0,
      usdc: 0,
      token: 0,
      raw: response.balances,
    },
  );

  response = { balances: ['2', '4', '7'] };
  const arrayResult = await normalize(TEST_WALLET, TEST_MINT, 'Token');
  assert.equal(arrayResult.sol, 0);
  assert.equal(arrayResult.usdc, 0);
  assert.equal(arrayResult.token, 0);
  assert.deepEqual(arrayResult.raw, {});

  response = { balances: { SOL: '2', USDC: '4', [TEST_MINT]: '7' } };
  const stringResult = await normalize(TEST_WALLET, TEST_MINT, 'Token');
  assert.equal(stringResult.sol, 0);
  assert.equal(stringResult.usdc, 0);
  assert.equal(stringResult.token, 0);
});

test('a single valid non-SOL/USDC balance remains the bounded fallback', async () => {
  const normalize = createBalanceNormalizer(() => ({
    balances: { SOL: 2, USDC: 4, OTHER: 7 },
  }));
  assert.equal((await normalize(TEST_WALLET, TEST_MINT, 'Unknown token')).token, 7);
});

test('ambiguous balance keys fail closed instead of selecting the first value', async () => {
  let response = { balances: { SOL: 2, sol: 999, USDC: 4, OTHER: 7, SECOND: 8 } };
  const normalize = createBalanceNormalizer(() => response);
  let result = await normalize(TEST_WALLET, TEST_MINT, 'Unknown token');
  assert.equal(result.sol, 0);
  assert.equal(result.token, 0);

  response = { balances: { SOL: 2, USDC: 4, TOKEN: 7, token: 999 } };
  result = await normalize(TEST_WALLET, TEST_MINT, 'TOKEN');
  assert.equal(result.token, 0);
});

test('an unconfigured wallet cannot be mistaken for zero on-chain balances', async () => {
  const normalize = createBalanceNormalizer(() => {
    throw new Error('Gateway must not be called');
  });
  assert.deepEqual(await normalize(null, TEST_MINT, 'Token'), {
    configured: false,
    wallet: null,
    sol: null,
    usdc: null,
    token: null,
    raw: {},
  });
});

test('the wrapped-SOL mint uses the native SOL balance reported by Gateway', async () => {
  let requestedTokens;
  const normalize = createBalanceNormalizer((_path, options) => {
    requestedTokens = JSON.parse(options.body).tokens;
    return { balances: { SOL: 2.5, USDC: 4 } };
  });
  const result = await normalize(TEST_WALLET, WRAPPED_SOL_MINT, 'Solana');
  assert.deepEqual(requestedTokens, ['SOL', 'USDC']);
  assert.equal(result.sol, 2.5);
  assert.equal(result.token, 2.5);
});

test('RPC fingerprints are canonical for query ordering and change with endpoint secrets', () => {
  const source = extractComposeSource(
    'function rpcUrlFingerprint(raw)',
    'function rpcRestartAck()',
    { label: 'controller RPC fingerprint' },
  );
  const fingerprint = new Function('crypto', `${source}\nreturn rpcUrlFingerprint;`)({ createHash });
  const first = fingerprint('https://rpc.example.com/path?b=2&a=1');
  const reordered = fingerprint('https://rpc.example.com/path?a=1&b=2#ignored');
  const changed = fingerprint('https://rpc.example.com/path?a=1&b=3');

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.equal(fingerprint('not-a-url'), '');
});

test('RPC diagnostics redact credentials, secret paths, and query values', () => {
  const source = extractComposeSource(
    'function redactRpcUrl(raw)',
    'function classifyRpcUrl(raw)',
    { label: 'controller RPC diagnostic redaction' },
  );
  const redact = new Function(`${source}\nreturn redactRpcUrl;`)();
  const redacted = redact('https://user:pass@rpc.example.com/private-key?api-key=secret');

  assert.equal(redacted.includes('user'), false);
  assert.equal(redacted.includes('pass'), false);
  assert.equal(redacted.includes('private-key'), false);
  assert.equal(redacted.includes('secret'), false);
  assert.match(redacted, /rpc\.example\.com/);
});

function createRpcPreflight(state) {
  const source = extractComposeSource(
    'async function testSolanaRpc(url)',
    'function currentStatus()',
    { label: 'RPC configurator mainnet preflight' },
  );
  const fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const reply = state(request.method);
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.body,
    };
  };
  return new Function('fetch', 'MAINNET_GENESIS_HASH', `${source}\nreturn testSolanaRpc;`)(
    fetch,
    '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  );
}

test('RPC preflight requires Solana mainnet-beta identity and a fresh confirmed blockhash', async () => {
  const preflight = createRpcPreflight(method => ({
    body: method === 'getGenesisHash'
      ? { result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }
      : { result: { context: { slot: 300_000_000 }, value: { blockhash: '1'.repeat(32) } } },
  }));
  assert.deepEqual(await preflight('https://rpc.example.com'), {
    slot: 300_000_000,
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  });
});

test('RPC preflight rejects another cluster, malformed blockhash responses, and RPC errors', async () => {
  const wrongCluster = createRpcPreflight(method => ({
    body: method === 'getGenesisHash'
      ? { result: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1' }
      : { result: {} },
  }));
  await assert.rejects(() => wrongCluster('https://rpc.example.com'), /not Solana mainnet-beta/);

  for (const malformed of [
    { context: { slot: 1 }, value: { blockhash: 'short' } },
    { context: { slot: 1.5 }, value: { blockhash: '1'.repeat(32) } },
    { context: { slot: -1 }, value: { blockhash: '1'.repeat(32) } },
    { context: { slot: '300000000' }, value: { blockhash: '1'.repeat(32) } },
  ]) {
    const preflight = createRpcPreflight(method => ({
      body: method === 'getGenesisHash'
        ? { result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }
        : { result: malformed },
    }));
    await assert.rejects(() => preflight('https://rpc.example.com'), /valid confirmed mainnet-beta blockhash/);
  }

  const rpcError = createRpcPreflight(() => ({ body: { error: { message: 'provider unavailable' } } }));
  await assert.rejects(() => rpcError('https://rpc.example.com'), /provider unavailable/);
});
