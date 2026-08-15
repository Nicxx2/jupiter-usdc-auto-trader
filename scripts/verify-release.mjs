import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const requiredFiles = [
  'docker-compose.yml',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.github/workflows/validate.yml',
  'CONTRIBUTING.md',
  'LICENSE',
  'SECURITY.md',
  'docs/architecture.md',
  'docs/commissioning.md',
  'docs/images/dashboard-automation.jpg',
  'docs/images/dashboard-gateway-listener.jpg',
  'docs/images/dashboard-overview.jpg',
  'docs/images/dashboard-readiness.jpg',
  'docs/images/dashboard-safety-settings.jpg',
  'docs/images/dashboard-solana-rpc.jpg',
  'docs/images/dashboard-testing-master-on.jpg',
  'docs/images/dashboard-trading-master-off.jpg',
  'docs/images/dashboard-trigger-protection.jpg',
  'docs/images/dashboard-wallet-balances.jpg',
  'docs/images/dashboard-wallets-and-safety.jpg',
  'docs/implementation-audit.md',
  'docs/portainer.md',
  'docs/storage.md',
  'docs/troubleshooting.md',
  'scripts/verify-compose-matrix.mjs',
  'scripts/verify-release.mjs',
  'tests/README.md',
  'tests/controller-inputs.test.mjs',
  'tests/controller-persistence.test.mjs',
  'tests/controller-safety.test.mjs',
  'tests/dashboard-responsive.test.mjs',
  'tests/gateway-rpc.test.mjs',
  'tests/workflow-execution.test.mjs',
  'tests/fixtures/controller-state.mjs',
  'tests/helpers/compose-source.mjs',
  'tests/helpers/workflow-source.mjs',
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

function githubHeadingIds(markdown) {
  const ids = new Set();
  const seen = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!match) continue;
    const base = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/[`*_~\[\]()/.]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-');
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    ids.add(count ? `${base}-${count}` : base);
  }
  return ids;
}

for (const path of requiredFiles) check(existsSync(path), `missing required file: ${path}`);

if (existsSync('package.json')) {
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    check(packageJson.private === true, 'test package must remain private and non-publishable');
    check(packageJson.version === '10.2.5', 'test package version is not v10.2.5');
    check(
      packageJson.scripts?.test === 'node --test --test-concurrency=1',
      'dependency-free regression test command changed',
    );
    check(
      !packageJson.dependencies && !packageJson.devDependencies,
      'regression tests must remain dependency-free',
    );
  } catch (error) {
    failures.push(`package.json is invalid: ${error.message}`);
  }
}

if (existsSync('.github/workflows/validate.yml')) {
  const validationWorkflow = readFileSync('.github/workflows/validate.yml', 'utf8');
  check(
    validationWorkflow.includes('- name: Run controller regression tests') &&
      validationWorkflow.includes('run: npm test'),
    'GitHub validation does not run the behavior regression suite',
  );
}

for (const screenshotPath of requiredFiles.filter((path) => path.startsWith('docs/images/dashboard-'))) {
  if (!existsSync(screenshotPath)) continue;
  const screenshot = readFileSync(screenshotPath);
  check(screenshot.length >= 20_000, `${screenshotPath} is unexpectedly small or empty`);
  check(
    screenshot[0] === 0xff && screenshot[1] === 0xd8 && screenshot.at(-2) === 0xff && screenshot.at(-1) === 0xd9,
    `${screenshotPath} is not a complete JPEG image`,
  );
}

const markdownFiles = requiredFiles.filter((path) => path.endsWith('.md'));
for (const markdownPath of markdownFiles) {
  if (!existsSync(markdownPath)) continue;
  const markdown = readFileSync(markdownPath, 'utf8');
  check(
    (markdown.match(/^```/gm) || []).length % 2 === 0,
    `${markdownPath} has an unbalanced fenced code block`,
  );
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    const [targetPath, fragment = ''] = target.split('#', 2);
    let decodedPath = targetPath;
    let decodedFragment = fragment;
    try { decodedPath = decodeURIComponent(decodedPath); } catch {}
    try { decodedFragment = decodeURIComponent(decodedFragment); } catch {}
    const resolvedTarget = resolve(dirname(markdownPath), decodedPath);
    check(existsSync(resolvedTarget), `${markdownPath} has broken local link: ${match[1]}`);
    if (decodedFragment && existsSync(resolvedTarget) && resolvedTarget.toLowerCase().endsWith('.md')) {
      const targetHeadings = githubHeadingIds(readFileSync(resolvedTarget, 'utf8'));
      check(targetHeadings.has(decodedFragment.toLowerCase()), `${markdownPath} has broken local heading link: ${match[1]}`);
    }
  }
}

if (existsSync('README.md')) {
  const readme = readFileSync('README.md', 'utf8');
  check(readme.includes('# 🤖 Jupiter USDC Auto Trader v10.2.5'), 'README release heading is not v10.2.5');
  check(readme.includes('**Current release:** `v10.2.5`'), 'README current-release marker is not v10.2.5');
  check(
    readme.includes('[Regression test design and change rules](tests/README.md)') &&
      readme.includes('npm test'),
    'README does not expose the behavior regression suite',
  );
  check(
    readme.includes('https://github.com/Nicxx2/jupiter-usdc-price-alerts') &&
      readme.includes('**optional execution companion**') &&
      readme.includes('required passive monitoring and signal source'),
    'README does not clearly identify and link the required passive Jupiter Alerts source',
  );
  for (const screenshot of [
    'dashboard-automation.jpg',
    'dashboard-gateway-listener.jpg',
    'dashboard-overview.jpg',
    'dashboard-readiness.jpg',
    'dashboard-safety-settings.jpg',
    'dashboard-solana-rpc.jpg',
    'dashboard-testing-master-on.jpg',
    'dashboard-trading-master-off.jpg',
    'dashboard-trigger-protection.jpg',
    'dashboard-wallet-balances.jpg',
    'dashboard-wallets-and-safety.jpg',
  ]) {
    check(readme.includes(`docs/images/${screenshot}`), `README does not display required screenshot: ${screenshot}`);
  }
  check(
    readme.includes('| `TESTING` | ON |') && readme.includes('| `TRADING` | OFF |'),
    'README does not explain the independent mode and MASTER states',
  );
  for (const instruction of [
    'Test & Apply RPC',
    'leave its key field blank to keep the existing key',
    'Safest: one real trade per coin/direction burst',
    'Do not reset guards merely to retry a failed or uncertain transaction',
    'Treat a private topic like a secret capability',
    'entering Trading recomputes readiness',
    'Last ntfy** and **Last decision** remain blank until an alert has been processed',
  ]) {
    check(readme.includes(instruction), `README advanced visual guide is missing instruction: ${instruction}`);
  }
  const detailsOpen = (readme.match(/<details(?:\s[^>]*)?>/g) || []).length;
  const detailsClose = (readme.match(/<\/details>/g) || []).length;
  const summaries = (readme.match(/<summary(?:\s[^>]*)?>/g) || []).length;
  check(detailsOpen === detailsClose, `README collapsibles are unbalanced: ${detailsOpen} open, ${detailsClose} close`);
  check(detailsOpen === summaries, `README collapsibles need one summary each: ${detailsOpen} details, ${summaries} summaries`);
  const licensePosition = readme.indexOf('## 📄 License & Risk');
  const supportPosition = readme.indexOf('## 💖 Support This Project');
  check(
    licensePosition >= 0 && supportPosition > licensePosition,
    'README Support This Project section must follow License & Risk',
  );
  check(
    readme.trimEnd().endsWith('[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nicxx2)'),
    'README Support This Project section must be the final content',
  );
}

if (existsSync('CHANGELOG.md')) {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const currentReleaseStart = changelog.indexOf('## [10.2.5] - 2026-08-15');
  check(currentReleaseStart >= 0, 'CHANGELOG current release entry is missing');
  const nextReleaseStart = currentReleaseStart >= 0
    ? changelog.indexOf('\n## [', currentReleaseStart + 1)
    : -1;
  const currentRelease = currentReleaseStart >= 0
    ? changelog.slice(currentReleaseStart, nextReleaseStart >= 0 ? nextReleaseStart : undefined)
    : '';
  check(currentRelease.includes('JATCommunity1022'), 'CHANGELOG workflow release identity is missing');
  check(
    currentRelease.includes('trading-wallet selector') &&
      currentRelease.includes('AUTO BUY and AUTO SELL') &&
      currentRelease.includes('missing-target note') &&
      currentRelease.includes('presentation-only patch'),
    'CHANGELOG current release does not include the v10.2.5 mobile alignment summary',
  );
}

if (existsSync('docs/architecture.md')) {
  const architecture = readFileSync('docs/architecture.md', 'utf8');
  check(
    architecture.includes('mounted `n8n_data` and `bootstrap_data` named-volume paths') &&
      !architecture.includes('n8n/bootstrap bind directories'),
    'architecture guide has stale bind-mount terminology for n8n named volumes',
  );
}

if (existsSync('.gitignore')) {
  const gitignore = readFileSync('.gitignore', 'utf8');
  for (const ignoredSafetyPath of [
    '/jupiter-auto-trader-backup-*/',
    '/controller_data/',
    '/gateway_conf/',
    '*.tgz',
    '*.key',
    'docker-compose.override.yml',
    '/.codex/',
    '/.codex-remote-attachments/',
  ]) {
    check(gitignore.includes(ignoredSafetyPath), `.gitignore safety rule missing: ${ignoredSafetyPath}`);
  }
  check(gitignore.includes('!.env.example'), '.gitignore must keep the blank .env.example template publishable');
}

const compose = readFileSync('docker-compose.yml', 'utf8').replaceAll('\r\n', '\n');
check(compose.startsWith('name: jupiter-usdc-auto-trader\n'), 'stable default Compose project name is missing');
check(!/^\s+type:\s+bind\s*$/m.test(compose), 'Compose contains a host bind mount');
check(!/(?<!\$)\$\{[a-z_]/.test(compose), 'embedded runtime interpolation contains an unescaped dollar sign');

const expectedComposeVariables = [
  'APP_API_PORT',
  'APP_API_URL',
  'DASHBOARD_COOKIE_SECURE',
  'GATEWAY_PASSPHRASE',
  'N8N_DB_PASSWORD',
  'N8N_ENCRYPTION_KEY',
  'N8N_RUNNERS_AUTH_TOKEN',
  'NTFY_SERVER',
  'TZ',
];
const actualComposeVariables = [...new Set(
  [...compose.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*)[^}]*\}/g)].map((match) => match[1]),
)].sort();
check(
  JSON.stringify(actualComposeVariables) === JSON.stringify(expectedComposeVariables),
  `Compose environment-variable contract changed: ${actualComposeVariables.join(', ') || '(none)'}`,
);

if (existsSync('README.md') && existsSync('.env.example')) {
  const readme = readFileSync('README.md', 'utf8');
  const envExample = readFileSync('.env.example', 'utf8');
  for (const variable of expectedComposeVariables) {
    check(readme.includes(`\`${variable}\``), `README does not document Compose variable ${variable}`);
    check(envExample.includes(variable), `.env.example does not document Compose variable ${variable}`);
  }
  for (const secret of [
    'N8N_DB_PASSWORD',
    'N8N_ENCRYPTION_KEY',
    'N8N_RUNNERS_AUTH_TOKEN',
    'GATEWAY_PASSPHRASE',
  ]) {
    check(new RegExp(`^${secret}=$`, 'm').test(envExample), `.env.example must leave ${secret} blank`);
  }
}

function compileEmbeddedService(label, serviceName, sourceNeedle, endNeedle) {
  const serviceStart = compose.indexOf(`  ${serviceName}:`);
  const sourceStart = compose.indexOf(sourceNeedle, serviceStart);
  const sourceEnd = compose.indexOf(endNeedle, sourceStart);
  check(serviceStart >= 0 && sourceStart >= serviceStart && sourceEnd > sourceStart, `${label} embedded source was not found`);
  if (sourceStart < serviceStart || sourceEnd <= sourceStart) return;

  try {
    // Compose escapes literal dollar signs as $$; JavaScript receives a single $.
    new Function(compose.slice(sourceStart, sourceEnd).replaceAll('$$', '$'));
  } catch (error) {
    failures.push(`${label} embedded JavaScript has a syntax error: ${error.message}`);
  }
}

compileEmbeddedService(
  'trading-controller',
  'trading-controller',
  "      const http = require('http');",
  '\n    ports:',
);
compileEmbeddedService(
  'rpc-configurator',
  'rpc-configurator',
  "      const http=require('http');",
  '\n    volumes:',
);

const bootstrapStart = compose.indexOf('  n8n-bootstrap:');
const bootstrapEnd = compose.indexOf('\nnetworks:', bootstrapStart);
check(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart, 'n8n-bootstrap command source was not found');
if (bootstrapStart >= 0 && bootstrapEnd > bootstrapStart) {
  const bootstrapSource = compose.slice(bootstrapStart, bootstrapEnd);
  const nodeEvalBlocks = [...bootstrapSource.matchAll(/node -e '([\s\S]*?)'/g)];
  check(nodeEvalBlocks.length === 5, `expected 5 n8n-bootstrap node -e blocks, found ${nodeEvalBlocks.length}`);
  const markerWrite = bootstrapSource.lastIndexOf(`printf '%s' "$$EXPECTED_HASH" > "$$MARKER"`);
  const restartedHealth = bootstrapSource.indexOf('workflow installed, published and active after restart');
  check(markerWrite > restartedHealth, 'n8n-bootstrap success marker is written before restarted n8n is healthy');
  for (const [index, match] of nodeEvalBlocks.entries()) {
    try {
      new Function(match[1].replaceAll('$$', '$'));
    } catch (error) {
      failures.push(`n8n-bootstrap node -e block ${index + 1} has a syntax error: ${error.message}`);
    }
  }
}

for (const image of [
  'postgres:16@sha256:11a9d238fbb48bab14599c57e41123254452b1a2d93c6c8595bce96f346bd082',
  'docker.n8n.io/n8nio/n8n:2.31.6@sha256:3c07c723326dd72e46a6969181c66a75260b7a204b9b77ba1ece6d594489c684',
  'n8nio/runners:2.31.6@sha256:fd1c233abcbcc45a5a376132b2d48457e9eaab3c48d642eb276a314d2e4e67ed',
  'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32',
  'hummingbot/gateway:version-2.15.1@sha256:674d441140f3becaeeb9ad0634cdc8c7b1b1268395b8dd9ee004bd63b15180f2',
  'alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce',
]) {
  check(compose.includes(`image: ${image}`), `pinned image missing: ${image}`);
}

const serviceImageRefs = [...compose.matchAll(/^\s+image:\s+(\S+)\s*$/gm)].map((match) => match[1]);
check(serviceImageRefs.length === 9, `expected 9 service image references, found ${serviceImageRefs.length}`);
for (const image of serviceImageRefs) {
  check(/@sha256:[a-f0-9]{64}$/.test(image), `service image is not immutable-digest pinned: ${image}`);
}

for (const secret of [
  'N8N_DB_PASSWORD',
  'N8N_ENCRYPTION_KEY',
  'N8N_RUNNERS_AUTH_TOKEN',
  'GATEWAY_PASSPHRASE',
]) {
  check(compose.includes(`\${${secret}:?`), `fail-fast Compose secret reference missing: ${secret}`);
}

check(compose.includes('APP_API_PORT: ${APP_API_PORT:-8000}'), 'APP_API_PORT default is missing');
check(compose.includes('APP_API_URL: ${APP_API_URL:-}'), 'APP_API_URL override is missing');
check(compose.includes('DASHBOARD_COOKIE_SECURE: ${DASHBOARD_COOKIE_SECURE:-false}'), 'secure-cookie reverse-proxy option is missing');
check(compose.includes("DASHBOARD_COOKIE_SECURE?'; Secure':''"), 'session cookie does not honor secure-cookie option');
check(compose.includes("parseEnvBoolean('DASHBOARD_COOKIE_SECURE'"), 'secure-cookie option does not use strict boolean validation');
check(compose.includes("u.pathname==='/internal/source-state'"), 'controller source-state proxy is missing');
check(compose.includes('const topic=currentEffectiveTopic(data,t.mint).trim();'), 'ntfy subscription does not use the canonical effective-topic helper');
check(compose.includes('configuration volume is non-empty but root.yml is missing'), 'Gateway partial-volume overwrite guard is missing');
check(compose.includes('required Gateway configuration is missing or empty'), 'Gateway configuration completeness guard is missing');
check((compose.match(/^    logging: \*default-logging$/gm) || []).length === 9, 'every service must use bounded default logging');
check(compose.includes('driver: local') && compose.includes('max-size: 10m') && compose.includes("max-file: '3'"), 'bounded local logging policy changed');
check(compose.includes('stop_grace_period: 60s'), 'PostgreSQL graceful-stop window is missing');
check((compose.match(/^    stop_grace_period: 30s$/gm) || []).length === 3, 'n8n, runner, and Gateway graceful-stop windows changed');
check(compose.includes('Cannot read persisted controller state'), 'corrupt persisted JSON does not fail closed');
check(compose.includes('function persistControllerJson(path,value,label)') && compose.includes("state.mode='testing';state.master=false;state.safetyLock=true;") && compose.includes('setImmediate(()=>process.exit(1))'), 'controller write failures do not force safe state and a durable-state reload');
check((compose.match(/persistControllerJson\(/g) || []).length === 7, 'not every durable controller JSON writer uses fail-closed persistence');
check(compose.includes('function validatePersistedState(path, value)'), 'persisted controller state-schema validation is missing');
check(compose.includes('function validatePersistedAuth(path, value)'), 'persisted controller authentication-schema validation is missing');
check(compose.includes('function validatePersistedCollections()'), 'persisted controller collection-schema validation is missing');
check(compose.includes('validatePersistedCollections();'), 'persisted controller collection validation is not called');
check(compose.includes("const t=timeoutSignal(360000);"), 'controller-to-n8n handoff timeout no longer covers the bounded resolution path');
check(compose.includes('Close the asynchronous validation window immediately before lock acquisition/submission.'), 'final pre-submit controller recheck is missing');
check(compose.includes('existingTrade=trades.find(t=>t.alertId===alertId);'), 'post-async duplicate-event recheck is missing');
check(compose.includes('if(tokenMatches.length!==1)') && compose.includes('if(finalTokenMatches.length!==1)'), 'controller source rechecks do not reject duplicate mint configurations');
check(compose.includes('sourceMints.length>0&&sourceMints.every(isMint)&&new Set(sourceMints).size===sourceMints.length'), 'readiness does not require a non-empty list of valid unique source mints');
check(compose.includes('if (!isMint(t?.mint)) continue;') && compose.includes('if(t.enabled!==true||!isMint(t.mint)) continue;'), 'malformed source mints can enter durable controls or ntfy subscriptions');
check(compose.includes("typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null") && compose.includes('matches.length === 1') && compose.includes('candidates.length === 1'), 'malformed or ambiguous Gateway balances are not normalized fail-closed');
check(compose.includes('function pruneExpiredTriggerGuards()') && !compose.includes('function pruneTriggerGuards(app)'), 'transient source omissions can prune durable trigger guards');
check(compose.includes('const resetMinutes=Number(row.resetMinutes ?? 0);'), 'trigger-guard expiry is not using the reset window captured at submission');
check(compose.includes('const sourceResetMinutes=Number(finalToken.alert_reset_minutes??0);'), 'new trigger guards can capture a stale pre-validation source reset window');
check(compose.includes("function guardRequiresExplicitReset(row)") && compose.includes('!guardRequiresExplicitReset(row)&&resetMinutes>0'), 'a timed guard can expire while its transaction still requires an explicit reset');
check(compose.includes('recoveredUnresolvedGuards') && compose.includes('if(!triggerGuards[guardKey])'), 'restart recovery does not rebuild a guard across the trade/guard write boundary');
check(compose.includes("const uncertainOnStartup=trades.filter(t=>t.status==='UNCERTAIN')"), 'persisted uncertain trades do not re-engage the safety lock');
check(compose.includes("trade.status='REVIEWED'") && compose.includes("'UNCERTAIN','REVIEWED'"), 'manual uncertainty review is not durably distinguished from an unresolved trade');
check((compose.match(/rec\.status='UNCERTAIN'[\s\S]{0,350}?saveState\(\);\s+saveTrades\(\);/g) || []).length === 2, 'uncertain trade state can persist before its safety lock');
check(compose.includes('function isSolanaSignature(v)') && compose.includes("rec.signature=isSolanaSignature(result?.signature)?String(result.signature):null;") && compose.includes("if (result?.status === 1 && rec.signature)") && compose.includes("if (poll?.txStatus === 1)"), 'Gateway can be recorded CONFIRMED without a Base58-shaped Solana signature and numeric success status');
check(compose.includes("const quoteId=typeof q.quoteId==='string'?q.quoteId.trim():'';") && compose.includes("typeof amountIn!=='number'") && compose.includes("typeof raw === 'number'") && compose.includes("if(!Number.isFinite(effective)||effective<=0)"), 'controller accepts malformed final quote identifiers or numeric values');
check(compose.includes("const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';") && compose.includes('mint !== WRAPPED_SOL_MINT') && compose.includes('function requiredSolBalance(mint,direction,amountIn,minReserve)') && compose.includes('const finalRequiredSol=requiredSolBalance(mint,direction,amountIn,state.minSolReserve);'), 'native SOL balance mapping or SELL reserve protection is missing');
check(compose.includes('Number(state.minSolReserve)>=0.001') && compose.includes('name="minSolReserve" step="0.001" min="0.001"') && compose.includes('!Number.isFinite(reserve)||reserve<0.001'), 'Trading can accept an impractically small SOL reserve');
check(compose.includes("pendingRecovery.set(added.address, {expires:") && !compose.includes('pendingRecovery.set(added.address, {secret:'), 'one-time wallet recovery material is retained unnecessarily after rendering');
check(compose.includes("console.log('[ntfy] topic subscription count:',next.length)") && !compose.includes("console.log('[ntfy] topics:'"), 'routine logs expose full ntfy topic names');
check(!compose.includes('loginPassword.length>256') && !compose.includes('name="password" maxlength="256" autofocus'), 'login compatibility with an existing long admin password was restricted');
check(compose.includes('p.length < 12 || p.length > 256'), 'new admin passwords are not bounded to 12–256 characters');
check(compose.includes('state.lastReadiness = null; // Runtime checks are never carried across a container restart/update.'), 'restart can display a stale readiness result');
check(compose.includes("const MAINNET_GENESIS_HASH='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';"), 'Solana mainnet-beta identity constant is missing');
check(compose.includes("call('getGenesisHash')"), 'RPC preflight does not verify Solana cluster identity');
check(compose.includes("call('getLatestBlockhash'"), 'RPC preflight does not verify a fresh blockhash');
check(compose.includes("!Number.isSafeInteger(slot)||slot<0"), 'RPC preflight accepts a malformed confirmed slot/blockhash response');
check(compose.includes('const RPC_RESTART_ACK_FILE ='), 'controller RPC restart acknowledgement path is missing');
check(compose.includes('rpcRestartAck()===requestId && providerMatches && endpointMatches'), 'controller does not require the matching RPC restart acknowledgement and endpoint');
check(compose.includes('requestGatewayRestart(rpcUrl)'), 'RPC configurator restart/fingerprint handshake is missing');
check(compose.includes('rpcUrlHash:rpcUrlFingerprint(rpcUrl)'), 'RPC configurator does not fingerprint the preflighted endpoint');
check(compose.includes('pending_ack="$$(cat /gateway-control/restart.request'), 'Gateway supervisor does not acknowledge the exact restart request');
check(compose.includes('let rpcChangeLock = false;') && compose.includes('let applyInProgress=false;'), 'concurrent RPC-change serialization is missing');
check(compose.includes("if(rpcChangeLock)throw new Error('RPC configuration changed during final controller validation')"), 'final transaction boundary does not reject an RPC change');
check(compose.includes("if(rpcChangeLock || activeTradeLock || state.mode!=='trading')"), 'MASTER activation does not recheck concurrent controller state');
check(compose.includes("if(rpcChangeLock || activeTradeLock || state.mode!=='testing' || state.master)"), 'Trading-mode activation does not recheck concurrent controller state');
check(compose.includes('waitForGatewayRpc(provider,applied?.requestId,applied?.rpcUrlHash,120000)'), 'Gateway RPC restart acknowledgement window is too short for slow hosts');
check(compose.includes("if(!state.safetyLock) return send(res,409,'No safety lock is active."), 'manual safety-lock clearing can release a normal in-flight trade');
check(compose.includes('Persisted RPC-control token is invalid'), 'RPC-control authentication token validation is missing');
check(compose.includes("!/^[-_A-Za-z0-9]{8,200}$$/.test(apiKey)"), 'Helius API-key canonical-character validation is missing');
check(compose.includes("Choose Solana Public for the official public endpoint"), 'custom-RPC handling can apply the public endpoint and then time out on provider classification');
check((compose.match(/hostname\.toLowerCase\(\)\.replace\(\/\\\.\+\$\$\/,''\)/g) || []).length === 2, 'RPC provider classification does not normalize trailing-dot hostname aliases');
check((compose.match(/if\(u\.pathname&&u\.pathname!=='\/'\)u\.pathname='\/\*\*\*';/g) || []).length === 2, 'controller/configurator RPC path-secret redaction changed');
check(compose.includes("if(buffer.length>1024*1024)throw new Error('ntfy stream line exceeded 1 MiB')"), 'ntfy incomplete-line bound is missing');
check(compose.includes("typeof msg.id!=='string'||!msg.id||msg.id.length>128"), 'ntfy event-ID validation is missing');

const publishedPorts = [...compose.matchAll(/^\s+-\s+["']?(\d+):(\d+)["']?\s*$/gm)]
  .map((match) => `${match[1]}:${match[2]}`);
check(
  publishedPorts.length === 1 && publishedPorts[0] === '5680:5680',
  `expected only host port 5680:5680, found: ${publishedPorts.join(', ') || '(none)'}`,
);

const persistentVolumes = [
  'postgres_data',
  'n8n_data',
  'bootstrap_data',
  'controller_data',
  'gateway_control',
  'gateway_conf',
  'gateway_logs',
];
for (const volume of persistentVolumes) {
  check(new RegExp(`^  ${volume}:$`, 'm').test(compose), `named volume declaration missing: ${volume}`);
}
check(!/^\s+container_name:/m.test(compose), 'Compose contains a host-global fixed container name');
check((compose.match(/^\s+nocopy:\s+true$/gm) || []).length === 15, 'every persistent mount must explicitly use volume.nocopy');

for (const [source, target] of [
  ['postgres_data', '/var/lib/postgresql/data'],
  ['n8n_data', '/home/node/.n8n'],
  ['bootstrap_data', '/bootstrap'],
  ['controller_data', '/data'],
  ['gateway_control', '/gateway-control'],
  ['gateway_conf', '/home/gateway/conf'],
  ['gateway_logs', '/home/gateway/logs'],
  ['gateway_conf', '/gateway-conf'],
  ['n8n_data', '/n8n-data'],
]) {
  check(
    compose.includes(`source: ${source}\n      target: ${target}`),
    `persistent mount mapping missing: ${source} -> ${target}`,
  );
}

for (const marker of [
  "state.mode = 'testing'",
  'state.master = false',
  "rec.status='UNCERTAIN'",
  'state.safetyLock=true',
  'Global trade lock held by',
  'START_SERVER=true node dist/index.js --dev',
  'jupiter-ntfy-event',
  "const APP_VERSION = '10.2.5'",
  'state.version = APP_VERSION',
  '<span class="version">v$${APP_VERSION}</span>',
  'version:APP_VERSION, state:safePublicState()',
  'version:`$${APP_VERSION}-portable-storage`',
]) {
  check(compose.includes(marker), `runtime safety marker missing: ${marker}`);
}

const b64Match = compose.match(/^\s+JAT_WORKFLOW_B64:\s+(\S+)\s*$/m);
check(Boolean(b64Match), 'embedded n8n workflow was not found');

if (b64Match) {
  const workflowTemplateBytes = Buffer.from(b64Match[1], 'base64');
  let workflow;
  try {
    workflow = JSON.parse(workflowTemplateBytes.toString('utf8'));
  } catch (error) {
    failures.push(`embedded workflow is not valid JSON: ${error.message}`);
  }

  const expectedHash = compose.match(/EXPECTED_HASH="([a-f0-9]{64})"/)?.[1];
  check(Boolean(expectedHash), 'bootstrap EXPECTED_HASH is missing');

  if (workflow) {
    check(workflow.name === 'Jupiter Auto Trader v10.2.2 - Community Internal', 'embedded workflow template name is stale');
    check(workflow.id === 'JATCommunity1022', 'embedded workflow template ID is stale');
    workflow.name = 'Jupiter Auto Trader v10.2.2 - Community Internal';
    workflow.id = 'JATCommunity1022';
    const sourceNames = new Set(['Get Jupiter App State', 'BUY Final App State', 'SELL Final App State']);
    for (const node of workflow.nodes || []) {
      if (sourceNames.has(node?.name)) node.parameters.url = 'http://trading-controller:8080/internal/source-state';
      if (node?.name === 'Architecture / Safety') {
        node.parameters.content = [
          '## Jupiter USDC Auto Trader v10.2.2',
          'Controller: **http://<server>:5680**',
          '',
          'First public release. Safe defaults: TESTING, MASTER OFF, new token automation OFF, no wallet assignment, and public RPC for testing only. The dashboard supports Helius or a custom Solana RPC for Testing and Trading.',
          '',
          'Execution safety: exact mint, topic, and target validation; repeated Gateway target and price-impact checks; maximum USDC cap; per-token wallet assignment; live balances and SOL reserve; final executable quote; global trade lock; trigger guards; and uncertain-transaction lockout.',
          '',
          'BUY and SELL execution expressions include the required n8n parser-safe object spacing and are verified by the release checks.',
        ].join('\n');
      }
    }

    const workflowBytes = Buffer.from(JSON.stringify(workflow));
    const actualHash = createHash('sha256').update(workflowBytes).digest('hex');
    check(actualHash === expectedHash, `generated workflow hash mismatch: expected ${expectedHash}, got ${actualHash}`);
    check(workflow.id === 'JATCommunity1022', `unexpected generated workflow ID: ${workflow.id}`);
    check(workflow.name === 'Jupiter Auto Trader v10.2.2 - Community Internal', `unexpected generated workflow name: ${workflow.name}`);
    check(workflow.nodes?.length === 52, `expected 52 workflow nodes, found ${workflow.nodes?.length}`);

    const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
    check(
      String(byName.get('Architecture / Safety')?.parameters?.content || '').startsWith('## Jupiter USDC Auto Trader v10.2.2'),
      'workflow Architecture / Safety note has a stale release version',
    );
    check(byName.get('NTFY Alert')?.parameters?.path === 'jupiter-ntfy-event', 'production webhook path changed');

    for (const node of workflow.nodes || []) {
      const code = node?.parameters?.jsCode;
      if (typeof code !== 'string') continue;
      try {
        // n8n Code nodes may use top-level await and return.
        new AsyncFunction(code);
      } catch (error) {
        failures.push(`workflow Code node ${JSON.stringify(node.name)} has a syntax error: ${error.message}`);
      }
    }

    for (const name of ['BUY Execute via Controller', 'SELL Execute via Controller']) {
      const body = String(byName.get(name)?.parameters?.body || '');
      check(body.includes('priceImpactPct:$json.priceImpactPct} }) }}'), `${name} lost the spaced nested-object expression fix`);
      check(!body.includes('priceImpactPct:$json.priceImpactPct}})'), `${name} regressed to adjacent braces before the n8n expression terminator`);
    }

    const workflowText = JSON.stringify(workflow);
    for (const forbiddenGate of ['rules_status', 'confirmed_ready', 'RSI readiness']) {
      check(!workflowText.includes(forbiddenGate), `informational source field became a workflow gate: ${forbiddenGate}`);
    }

    const appUrls = [...sourceNames].map((name) => byName.get(name)?.parameters?.url);
    check(
      appUrls.every((url) => url === 'http://trading-controller:8080/internal/source-state'),
      `generated workflow bypasses the controller source proxy: ${appUrls.join(', ')}`,
    );
  }
}

const booleanParserStart = compose.indexOf('function parseEnvBoolean(name, value)');
const persistedHelpersStart = compose.indexOf('function isMint(v)');
const persistedHelpersEnd = compose.indexOf('function approx(a, b', persistedHelpersStart);
const rpcFingerprintStart = compose.indexOf('function rpcUrlFingerprint(raw)');
const rpcFingerprintEnd = compose.indexOf('function rpcRestartAck()', rpcFingerprintStart);
const balanceHelperStart = compose.indexOf('async function getBalancesNormalized(wallet, mint, name)');
const balanceHelperEnd = compose.indexOf('function requiredApiPathsPresent(docs)', balanceHelperStart);
const rpcPreflightStart = compose.indexOf('async function testSolanaRpc(url)');
const rpcPreflightEnd = compose.indexOf('function currentStatus()', rpcPreflightStart);
const hostHelperStart = compose.indexOf('function isContainerLoopbackHost(rawHost)');
const resolverStart = compose.indexOf('function resolveAppApiUrl(fullUrl, portRaw)');
const ntfyResolverStart = compose.indexOf('function resolveNtfyServer(raw)');
const resolverEnd = compose.indexOf('function atomicJson', resolverStart);
check(booleanParserStart >= 0 && hostHelperStart > booleanParserStart, 'strict environment boolean parser source was not found');
check(persistedHelpersStart >= 0 && persistedHelpersEnd > persistedHelpersStart, 'persisted-state validator source was not found');
check(rpcFingerprintStart >= 0 && rpcFingerprintEnd > rpcFingerprintStart, 'controller RPC endpoint fingerprint source was not found');
check(balanceHelperStart >= 0 && balanceHelperEnd > balanceHelperStart, 'controller balance normalizer source was not found');
check(rpcPreflightStart >= 0 && rpcPreflightEnd > rpcPreflightStart, 'RPC mainnet preflight source was not found');
check(hostHelperStart >= 0 && resolverStart > hostHelperStart && ntfyResolverStart > resolverStart && resolverEnd > ntfyResolverStart, 'source/ntfy URL resolver source was not found');

if (rpcFingerprintStart >= 0 && rpcFingerprintEnd > rpcFingerprintStart) {
  try {
    const source=compose.slice(rpcFingerprintStart,rpcFingerprintEnd).replaceAll('$$','$');
    const fingerprint=new Function('crypto',`${source}\nreturn rpcUrlFingerprint;`)({createHash});
    const a=fingerprint('https://rpc.example.com/path?b=2&a=1');
    const b=fingerprint('https://rpc.example.com/path?a=1&b=2');
    const c=fingerprint('https://rpc.example.com/path?a=1&b=3');
    check(/^[a-f0-9]{64}$/.test(a) && a===b && a!==c, 'RPC endpoint fingerprint is not canonical and secret-sensitive');
    check(fingerprint('not a URL')==='', 'RPC endpoint fingerprint accepted an invalid URL');
  } catch (error) {
    failures.push(`RPC endpoint fingerprint could not be evaluated: ${error.message}`);
  }
}

if (persistedHelpersStart >= 0 && persistedHelpersEnd > persistedHelpersStart) {
  try {
    const helperSource = compose.slice(persistedHelpersStart, persistedHelpersEnd).replaceAll('$$', '$');
    const validators = new Function(`
      const SEEN_FILE='seen.json', TRADES_FILE='trades.json', AUDIT_FILE='audit.json', TRIGGER_GUARDS_FILE='trigger-guards.json';
      let seenList, trades, audit, triggerGuards;
      ${helperSource}
      return {
        state: validatePersistedState,
        auth: validatePersistedAuth,
        collections(value) {
          seenList=value.seenList; trades=value.trades; audit=value.audit; triggerGuards=value.triggerGuards;
          validatePersistedCollections();
        }
      };
    `)();
    const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const wallet='11111111111111111111111111111111';
    const validState={
      mode:'trading', master:true, safetyLock:false, safetyReason:null,
      requirePrivateTradingTopic:false, burstPolicy:'collapse', selectedWallet:wallet,
      tradingNtfyTopic:'trade-12345678901234567890123456789012', lastReadiness:null,
      minSolReserve:0.02, slippagePct:1, maxPriceImpactPct:2, maxTradeUSDC:25, burstWindowSec:15,
      tokens:{[mint]:{autoBuy:true,autoSell:false,wallet}},
      walletBackups:{[wallet]:true}, walletMeta:{[wallet]:{nickname:'Bot',createdAt:null}},
    };
    validators.state('state.json', validState);
    validators.auth('auth.json', {
      salt:'a'.repeat(64), hash:'b'.repeat(128), sessionSecret:'c'.repeat(64), sessionVersion:1, mustChange:false,
    });
    const validCollections={
      seenList:['event-1'],
      trades:[{at:'2026-08-15T00:00:00.000Z',alertId:'event-1',mint,direction:'BUY',status:'CONFIRMED',wallet,target:1,usdAmount:5}],
      audit:[{at:'2026-08-15T00:00:00.000Z',kind:'TRADE_CONFIRMED'}],
      triggerGuards:{[`${mint}|BUY|${Number(1).toPrecision(16)}`]:{at:'2026-08-15T00:00:00.000Z',alertId:'event-1',mint,direction:'BUY',target:1,resetMinutes:0}},
    };
    validators.collections(validCollections);
    validators.collections({...validCollections,trades:[{...validCollections.trades[0],status:'REVIEWED'}]});

    const rejected = (fn) => { try { fn(); return false; } catch { return true; } };
    for (const [label, mutate] of [
      ['non-boolean safety lock', value => { value.safetyLock='false'; }],
      ['string risk cap', value => { value.maxTradeUSDC='25'; }],
      ['array controls map', value => { value.tokens=[]; }],
      ['non-boolean AUTO control', value => { value.tokens[mint].autoBuy='true'; }],
      ['non-boolean backup evidence', value => { value.walletBackups[wallet]=1; }],
      ['invalid private topic', value => { value.tradingNtfyTopic='trade-short'; }],
    ]) {
      const value=JSON.parse(JSON.stringify(validState));
      mutate(value);
      check(rejected(() => validators.state('state.json', value)), `persisted-state validator accepted ${label}`);
    }
    check(rejected(() => validators.auth('auth.json', {
      salt:'a'.repeat(64), hash:'not-a-hash', sessionSecret:'c'.repeat(64), sessionVersion:1, mustChange:false,
    })), 'persisted-auth validator accepted an invalid password hash');
    for (const [label, value] of [
      ['non-string event ID', {...validCollections,seenList:[{}]}],
      ['oversized event ID', {...validCollections,seenList:['x'.repeat(129)]}],
      ['unknown trade status', {...validCollections,trades:[{...validCollections.trades[0],status:'UNKNOWN'}]}],
      ['audit record without kind', {...validCollections,audit:[{at:'2026-08-15T00:00:00.000Z'}]}],
      ['guard with invalid reset window', {...validCollections,triggerGuards:{guard:{at:'2026-08-15T00:00:00.000Z',alertId:'event-1',mint,direction:'BUY',target:1,resetMinutes:null}}}],
      ['guard under a mismatched key', {...validCollections,triggerGuards:{guard:{at:'2026-08-15T00:00:00.000Z',alertId:'event-1',mint,direction:'BUY',target:1,resetMinutes:0}}}],
    ]) {
      check(rejected(() => validators.collections(value)), `persisted-collection validator accepted ${label}`);
    }
  } catch (error) {
    failures.push(`persisted-state validators could not be evaluated: ${error.message}`);
  }
}

if (balanceHelperStart >= 0 && balanceHelperEnd > balanceHelperStart) {
  try {
    const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    let gatewayResponse={balances:{SOL:1.25,USDC:'not-a-number',[mint]:3.5}};
    const gateway=async()=>gatewayResponse;
    const isMint=value=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value||''));
    const source=compose.slice(balanceHelperStart,balanceHelperEnd).replaceAll('$$','$');
    const normalize=new Function('gateway','isMint','NETWORK','WRAPPED_SOL_MINT',`${source}\nreturn getBalancesNormalized;`)(gateway,isMint,'mainnet-beta','So11111111111111111111111111111111111111112');

    let result=await normalize('11111111111111111111111111111111',mint,'Token');
    check(result.sol===1.25 && result.usdc===0 && result.token===3.5, 'balance normalization did not fail closed on a malformed requested balance');

    gatewayResponse={balances:{SOL:{},USDC:' ',[mint]:-1,OTHER:'Infinity'}};
    result=await normalize('11111111111111111111111111111111',mint,'Token');
    check(result.sol===0 && result.usdc===0 && result.token===0, 'balance normalization accepted an object, blank, negative, or non-finite value');

    gatewayResponse={balances:['2','4','7']};
    result=await normalize('11111111111111111111111111111111',mint,'Token');
    check(result.sol===0 && result.usdc===0 && result.token===0, 'balance normalization accepted a non-object balance collection');

    gatewayResponse={balances:{SOL:2,USDC:4,OTHER:7}};
    result=await normalize('11111111111111111111111111111111',mint,'Token');
    check(result.token===7, 'single-token balance fallback did not accept the one requested non-core balance');

    gatewayResponse={balances:{SOL:2,sol:999,USDC:4,OTHER:7,SECOND:8}};
    result=await normalize('11111111111111111111111111111111',mint,'Token');
    check(result.sol===0 && result.token===0, 'ambiguous balance keys did not fail closed');

    gatewayResponse={balances:{SOL:2.5,USDC:4}};
    result=await normalize('11111111111111111111111111111111','So11111111111111111111111111111111111111112','Solana');
    check(result.sol===2.5 && result.token===2.5, 'wrapped-SOL balance did not map to native SOL');
  } catch (error) {
    failures.push(`controller balance normalizer could not be evaluated: ${error.message}`);
  }
}

if (rpcPreflightStart >= 0 && rpcPreflightEnd > rpcPreflightStart) {
  try {
    const mainnetHash='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
    const validBlockhash='11111111111111111111111111111111';
    let genesisHash=mainnetHash;
    let blockhash=validBlockhash;
    let slot=300_000_000;
    const fetch=async(_url,options)=>{
      const request=JSON.parse(options.body);
      const result=request.method==='getGenesisHash'
        ? genesisHash
        : {context:{slot},value:{blockhash}};
      return {ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:request.id,result})};
    };
    const source=compose.slice(rpcPreflightStart,rpcPreflightEnd).replaceAll('$$','$');
    const preflight=new Function('fetch','MAINNET_GENESIS_HASH',`${source}\nreturn testSolanaRpc;`)(fetch,mainnetHash);
    const rejected=async()=>{try{await preflight('https://rpc.example.com');return false;}catch{return true;}};

    const valid=await preflight('https://rpc.example.com');
    check(valid.genesisHash===mainnetHash && valid.slot===slot, 'RPC preflight rejected a valid mainnet identity/blockhash response');

    genesisHash='EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
    check(await rejected(), 'RPC preflight accepted a non-mainnet genesis hash');
    genesisHash=mainnetHash;
    blockhash='short';
    check(await rejected(), 'RPC preflight accepted a malformed blockhash');
    blockhash=validBlockhash;
    slot=1.5;
    check(await rejected(), 'RPC preflight accepted a non-integer slot');
    slot='300000000';
    check(await rejected(), 'RPC preflight accepted a string slot');
  } catch (error) {
    failures.push(`RPC mainnet preflight could not be evaluated: ${error.message}`);
  }
}

if (booleanParserStart >= 0 && hostHelperStart > booleanParserStart) {
  try {
    const parserSource = compose.slice(booleanParserStart, hostHelperStart).replaceAll('$$', '$');
    const parseEnvBoolean = new Function(`${parserSource}\nreturn parseEnvBoolean;`)();
    check(parseEnvBoolean('TEST_VALUE', 'true') === true, 'strict environment boolean parser rejected true');
    check(parseEnvBoolean('TEST_VALUE', 'OFF') === false, 'strict environment boolean parser rejected false');
    let invalidRejected = false;
    try { parseEnvBoolean('TEST_VALUE', 'tru'); } catch { invalidRejected = true; }
    check(invalidRejected, 'strict environment boolean parser accepted a typo');
  } catch (error) {
    failures.push(`strict environment boolean parser could not be evaluated: ${error.message}`);
  }
}

if (hostHelperStart >= 0 && resolverEnd > ntfyResolverStart) {
  try {
    const resolverSource = compose.slice(hostHelperStart, resolverEnd).replaceAll('$$', '$');
    const resolveAppApiUrl = new Function(`${resolverSource}\nreturn resolveAppApiUrl;`)();
    const resolveNtfyServer = new Function(`${resolverSource}\nreturn resolveNtfyServer;`)();
    check(resolveAppApiUrl('', '1') === 'http://host.docker.internal:1/api/tokens', 'minimum APP_API_PORT resolution failed');
    check(resolveAppApiUrl('', '8000') === 'http://host.docker.internal:8000/api/tokens', 'default APP API URL resolution failed');
    check(resolveAppApiUrl('', '8001') === 'http://host.docker.internal:8001/api/tokens', 'custom same-host APP_API_PORT resolution failed');
    check(resolveAppApiUrl('', '65535') === 'http://host.docker.internal:65535/api/tokens', 'maximum APP_API_PORT resolution failed');
    check(
      resolveAppApiUrl('https://alerts.example.com/api/tokens', '8001') === 'https://alerts.example.com/api/tokens',
      'full remote APP_API_URL did not override APP_API_PORT',
    );
    check(
      resolveAppApiUrl('https://alerts.example.com/api/tokens///', '8001') === 'https://alerts.example.com/api/tokens',
      'full remote APP_API_URL trailing slash was not normalized',
    );

    for (const [url, port] of [
      ['', '0'],
      ['', '65536'],
      ['', 'not-a-port'],
      ['ftp://alerts.example.com/api/tokens', '8000'],
      ['https://user:pass@alerts.example.com/api/tokens', '8000'],
      ['https://alerts.example.com/api/tokens?key=secret', '8000'],
      ['http://localhost:8000/api/tokens', '8000'],
      ['http://127.0.0.2:8000/api/tokens', '8000'],
      ['http://[::]:8000/api/tokens', '8000'],
      ['http://[::ffff:127.0.0.1]:8000/api/tokens', '8000'],
      ['http://[::ffff:0.0.0.0]:8000/api/tokens', '8000'],
      ['https://api.localhost:8000/api/tokens', '8000'],
      ['https://api.localhost.:8000/api/tokens', '8000'],
      ['https://alerts.example.com:0/api/tokens', '8000'],
      ['https://alerts.example.com/not-the-api', '8000'],
    ]) {
      let rejected = false;
      try { resolveAppApiUrl(url, port); } catch { rejected = true; }
      check(rejected, `unsafe/invalid APP API input was accepted: url=${url || '(empty)'} port=${port}`);
    }

    check(resolveNtfyServer('https://ntfy.sh') === 'https://ntfy.sh', 'default ntfy URL resolution failed');
    check(resolveNtfyServer('https://notify.example.com/prefix///') === 'https://notify.example.com/prefix', 'ntfy path-prefix normalization failed');
    check(resolveNtfyServer('http://host.docker.internal:8080/') === 'http://host.docker.internal:8080', 'same-host ntfy URL resolution failed');
    for (const url of [
      '',
      'ftp://notify.example.com',
      'https://user:pass@notify.example.com',
      'https://notify.example.com?token=secret',
      'https://notify.example.com/#fragment',
      'http://localhost:8080',
      'http://localhost.:8080',
      'http://127.0.0.2:8080',
      'http://[::1]:8080',
      'https://notify.example.com:0',
    ]) {
      let rejected = false;
      try { resolveNtfyServer(url); } catch { rejected = true; }
      check(rejected, `unsafe/invalid NTFY_SERVER input was accepted: ${url || '(empty)'}`);
    }
  } catch (error) {
    failures.push(`source/ntfy URL resolvers could not be evaluated: ${error.message}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log('PASS: public-release files and Compose safety invariants verified');
