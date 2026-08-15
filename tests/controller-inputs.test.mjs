import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateComposeSource, extractComposeSource } from './helpers/compose-source.mjs';

const source = extractComposeSource(
  'function parseEnvBoolean(name, value)',
  'function atomicJson(path, value)',
  { label: 'controller environment and endpoint resolvers' },
);
const { parseEnvBoolean, resolveAppApiUrl, resolveNtfyServer } = evaluateComposeSource(
  source,
  '{ parseEnvBoolean, resolveAppApiUrl, resolveNtfyServer }',
);

test('strict environment booleans accept documented values', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(parseEnvBoolean('OPTION', value), true);
  }
  for (const value of ['0', 'false', 'FALSE', 'no', 'off', '', undefined]) {
    assert.equal(parseEnvBoolean('OPTION', value), false);
  }
});

test('strict environment booleans reject typos', () => {
  for (const value of ['tru', 'enabled', '2', 'null']) {
    assert.throws(() => parseEnvBoolean('OPTION', value), /must be true or false/);
  }
});

test('same-host source ports resolve across the complete valid range', () => {
  assert.equal(resolveAppApiUrl('', '1'), 'http://host.docker.internal:1/api/tokens');
  assert.equal(resolveAppApiUrl('', '8000'), 'http://host.docker.internal:8000/api/tokens');
  assert.equal(resolveAppApiUrl('', '8001'), 'http://host.docker.internal:8001/api/tokens');
  assert.equal(resolveAppApiUrl('', '65535'), 'http://host.docker.internal:65535/api/tokens');
});

test('a complete remote source URL overrides the same-host port and is normalized', () => {
  assert.equal(
    resolveAppApiUrl(' https://alerts.example.com/base/api/tokens/// ', 'not-used'),
    'https://alerts.example.com/base/api/tokens',
  );
});

test('invalid same-host source ports fail closed', () => {
  for (const port of ['', '0', '65536', '-1', '1.5', '8000x']) {
    assert.throws(() => resolveAppApiUrl('', port), /APP_API_PORT/);
  }
});

test('unsafe or malformed remote source URLs fail closed', () => {
  for (const url of [
    'not-a-url',
    'ftp://alerts.example.com/api/tokens',
    'https://user:pass@alerts.example.com/api/tokens',
    'https://alerts.example.com/api/tokens?key=secret',
    'https://alerts.example.com/api/tokens#fragment',
    'https://alerts.example.com/not-the-api',
    'http://localhost:8000/api/tokens',
    'http://localhost.:8000/api/tokens',
    'http://api.localhost:8000/api/tokens',
    'http://127.0.0.2:8000/api/tokens',
    'http://127.1:8000/api/tokens',
    'http://2130706433:8000/api/tokens',
    'http://0x7f000001:8000/api/tokens',
    'http://0177.0.0.1:8000/api/tokens',
    'http://[::]:8000/api/tokens',
    'http://[::1]:8000/api/tokens',
    'http://[::ffff:127.0.0.1]:8000/api/tokens',
    'https://alerts.example.com:0/api/tokens',
  ]) {
    assert.throws(() => resolveAppApiUrl(url, '8000'), undefined, url);
  }
});

test('ntfy base URLs preserve an optional path and remove trailing slashes', () => {
  assert.equal(resolveNtfyServer('https://ntfy.sh'), 'https://ntfy.sh');
  assert.equal(resolveNtfyServer('https://notify.example.com/base///'), 'https://notify.example.com/base');
  assert.equal(resolveNtfyServer('http://host.docker.internal:8080/'), 'http://host.docker.internal:8080');
});

test('unsafe or unsupported ntfy URLs fail closed', () => {
  for (const url of [
    '',
    'not-a-url',
    'ftp://notify.example.com',
    'https://user:pass@notify.example.com',
    'https://notify.example.com?token=secret',
    'https://notify.example.com/#fragment',
    'http://localhost:8080',
    'http://localhost.:8080',
    'http://127.0.0.2:8080',
    'http://2130706433:8080',
    'http://0x7f000001:8080',
    'http://[::1]:8080',
    'https://notify.example.com:0',
  ]) {
    assert.throws(() => resolveNtfyServer(url), undefined, url || '(empty)');
  }
});
