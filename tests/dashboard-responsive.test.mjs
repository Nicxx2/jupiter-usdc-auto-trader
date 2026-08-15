import assert from 'node:assert/strict';
import test from 'node:test';

import { composeSource } from './helpers/compose-source.mjs';

const dashboardStart = composeSource.indexOf('async function dashboard');
const dashboardEnd = composeSource.indexOf('function loginPage', dashboardStart);
const dashboard = composeSource.slice(dashboardStart, dashboardEnd);
const auxiliaryPages = composeSource.slice(dashboardEnd, composeSource.indexOf('const admin = http.createServer', dashboardEnd));

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('responsive breakpoints use CSS viewport capabilities rather than device detection', () => {
  for (const marker of [
    '@media(max-width:1100px)',
    '@media(max-width:700px)',
    '@media(max-width:420px)',
    '@media(hover:none) and (pointer:coarse)',
    '@media(prefers-reduced-motion:reduce)',
    'env(safe-area-inset-left)',
    'env(safe-area-inset-bottom)',
  ]) {
    assert.ok(dashboard.includes(marker), marker);
  }

  assert.doesNotMatch(dashboard, /navigator\.userAgent|user-agent|sec-ch-ua/i);
  assert.ok((composeSource.match(/viewport-fit=cover/g) || []).length >= 4);
  assert.ok((composeSource.match(/<!doctype html><html lang="en">/g) || []).length >= 4);
});

test('complex dashboard tables become labelled cards without hiding safety data', () => {
  assert.ok(dashboard.includes('class="mobile-cards coins-table"'));
  assert.ok(dashboard.includes('class="mobile-cards trades-table"'));
  assert.ok(dashboard.includes('aria-label="Coin automation controls"'));
  assert.ok(dashboard.includes('aria-label="Recent trade history"'));
  assert.ok(dashboard.includes('aria-label="Selected wallet balances"'));

  for (const label of [
    'Coin',
    'Source',
    'Scenario',
    'Configured targets',
    'ntfy topic',
    'Trading wallet',
    'Automation',
    'Time',
    'Token',
    'Side',
    'Status',
    'Impact',
    'Signature',
  ]) {
    assert.ok(dashboard.includes(`data-label="${label}"`), label);
  }

  assert.ok(dashboard.includes('table.mobile-cards td:before{content:attr(data-label)'));
  assert.ok(dashboard.includes('table.mobile-cards,table.mobile-cards *{box-sizing:border-box}'));
  assert.ok(dashboard.includes('No coin configuration is currently available from Jupiter USDC Price Alerts.'));
  assert.ok(dashboard.includes('class="cell-value wallet-control"'));
  assert.ok(dashboard.includes('class="cell-value automation-controls"'));
  assert.equal(occurrences(dashboard, 'class="automation-option"'), 2);
  assert.ok(dashboard.includes('class="muted automation-note">No BUY target configured'));
  assert.ok(dashboard.includes('class="muted automation-note">No SELL target configured'));
  assert.ok(dashboard.includes('.automation-note{display:block;margin:2px 0 0 28px}'));
  assert.ok(dashboard.includes('.mint{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all'));
  assert.ok(dashboard.includes('.breakable{overflow-wrap:anywhere;word-break:break-word}'));

  const walletCell = dashboard.match(/<td data-label="Trading wallet">([\s\S]*?)<\/td>/)?.[1] || '';
  assert.ok(walletCell.startsWith('<div class="cell-value wallet-control">'));
  assert.ok(walletCell.includes('class="muted assignment-status"'));

  const automationCell = dashboard.match(/<td data-label="Automation">([\s\S]*?)<\/td>/)?.[1] || '';
  assert.ok(automationCell.includes('<div class="cell-value automation-controls">'));
  assert.equal(occurrences(automationCell, 'class="automation-option"'), 2);
  assert.ok(automationCell.includes("$${t.enabled&&buyConfigured ? '' : 'disabled'}"));
  assert.ok(automationCell.includes("$${t.enabled&&sellConfigured ? '' : 'disabled'}"));
  assert.doesNotMatch(automationCell, /<br\s*\/?\s*>/i);
});

test('responsive presentation keeps one authoritative copy of every trading control', () => {
  for (const marker of [
    'name="wallet_$${html(t.mint)}"',
    'name="autoBuy_$${html(t.mint)}"',
    'name="autoSell_$${html(t.mint)}"',
    'action="/admin/controls"',
    'action="/admin/mode"',
    'action="/admin/master"',
  ]) {
    assert.equal(occurrences(dashboard, marker), 1, marker);
  }

  assert.ok(dashboard.includes('aria-label="Trading wallet for $${html(t.name)}"'));
  assert.ok(dashboard.includes('class="toggle-line"'));
});

test('mobile controls remain touch-sized, keyboard-friendly, and fully visible', () => {
  for (const marker of [
    'min-height:44px',
    'font-size:16px',
    ':focus-visible{outline:3px solid #79b8ff',
    'inputmode="decimal"',
    'inputmode="numeric"',
    'autocapitalize="characters"',
    'spellcheck="false"',
    'enterkeyhint="done"',
  ]) {
    assert.ok(dashboard.includes(marker), marker);
  }

  assert.ok(dashboard.includes('button,select,input:not([type="hidden"]):not([type="checkbox"]){min-height:44px;font-size:16px}'));
  assert.ok(dashboard.includes('details.panel>summary,.panelbody details>summary{min-height:48px}'));
  assert.ok(dashboard.includes('.top-links a,.panelbody p>a{display:inline-flex;align-items:center;min-height:44px}'));
});

test('login, one-time recovery, and diagnostics pages have bounded mobile layouts', () => {
  for (const marker of [
    'min-height:100dvh',
    'autocomplete="current-password"',
    'autocomplete="new-password"',
    'Type I SAVED IT to confirm',
    'Gateway Diagnostics · v$${APP_VERSION}',
    'padding-left:max(12px,env(safe-area-inset-left))',
  ]) {
    assert.ok(composeSource.includes(marker), marker);
  }

  assert.ok((auxiliaryPages.match(/@media\(max-width:(?:600|700)px\)/g) || []).length >= 3);
});
