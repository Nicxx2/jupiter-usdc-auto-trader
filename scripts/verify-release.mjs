import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const requiredFiles = [
  'docker-compose.yml',
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
  check(readme.includes('# 🤖 Jupiter USDC Auto Trader v10.2.2'), 'README release heading is not v10.2.2');
  check(readme.includes('**Current release:** `v10.2.2`'), 'README current-release marker is not v10.2.2');
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
  check(changelog.includes('## [10.2.2] - 2026-08-14'), 'CHANGELOG current release entry is missing');
  check(changelog.includes('JATCommunity1022'), 'CHANGELOG workflow release identity is missing');
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
  ]) {
    check(gitignore.includes(ignoredSafetyPath), `.gitignore safety rule missing: ${ignoredSafetyPath}`);
  }
  check(gitignore.includes('!.env.example'), '.gitignore must keep the blank .env.example template publishable');
}

const compose = readFileSync('docker-compose.yml', 'utf8').replaceAll('\r\n', '\n');
check(compose.startsWith('name: jupiter-usdc-auto-trader\n'), 'stable default Compose project name is missing');
check(!/^\s+type:\s+bind\s*$/m.test(compose), 'Compose contains a host bind mount');

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
  "state.version = '10.2.2'",
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
const resolverStart = compose.indexOf('function resolveAppApiUrl(fullUrl, portRaw)');
const resolverEnd = compose.indexOf('function atomicJson', resolverStart);
check(booleanParserStart >= 0 && resolverStart > booleanParserStart, 'strict environment boolean parser source was not found');
check(resolverStart >= 0 && resolverEnd > resolverStart, 'APP API resolver source was not found');

if (booleanParserStart >= 0 && resolverStart > booleanParserStart) {
  try {
    const parserSource = compose.slice(booleanParserStart, resolverStart).replaceAll('$$', '$');
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

if (resolverStart >= 0 && resolverEnd > resolverStart) {
  try {
    const resolverSource = compose.slice(resolverStart, resolverEnd).replaceAll('$$', '$');
    const resolveAppApiUrl = new Function(`${resolverSource}\nreturn resolveAppApiUrl;`)();
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
      ['https://alerts.example.com:0/api/tokens', '8000'],
      ['https://alerts.example.com/not-the-api', '8000'],
    ]) {
      let rejected = false;
      try { resolveAppApiUrl(url, port); } catch { rejected = true; }
      check(rejected, `unsafe/invalid APP API input was accepted: url=${url || '(empty)'} port=${port}`);
    }
  } catch (error) {
    failures.push(`APP API resolver could not be evaluated: ${error.message}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log('PASS: public-release files and Compose safety invariants verified');
