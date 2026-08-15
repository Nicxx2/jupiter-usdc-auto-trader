import { spawnSync } from 'node:child_process';

const stableTestSecrets = {
  N8N_DB_PASSWORD: 'validation-only-db-password',
  N8N_ENCRYPTION_KEY: 'validation-only-encryption-key',
  N8N_RUNNERS_AUTH_TOKEN: 'validation-only-runner-token',
  GATEWAY_PASSPHRASE: 'validation-only-gateway-passphrase',
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

function runConfig(overrides = {}, omitted = [], projectName = 'jat-validation') {
  const env = { ...process.env, ...stableTestSecrets, ...overrides };
  for (const name of omitted) env[name] = '';
  const args = ['compose'];
  if (projectName) args.push('--project-name', projectName);
  args.push('-f', 'docker-compose.yml', 'config', '--format', 'json');
  const result = spawnSync(
    'docker',
    args,
    { env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  return result;
}

function validConfig(label, overrides, expectedPort, expectedUrl, expectedSecureCookie = 'false') {
  const result = runConfig(overrides);
  if (result.status !== 0) fail(`${label} Compose config failed: ${result.error?.message || result.stderr || result.stdout || 'unknown error'}`);

  let model;
  try { model = JSON.parse(result.stdout); }
  catch (error) { fail(`${label} Compose JSON could not be parsed: ${error.message}`); }

  const controller = model.services?.['trading-controller'];
  if (!controller) fail(`${label} trading-controller service is missing`);
  for (const serviceName of ['trading-controller', 'rpc-configurator', 'gateway']) {
    const aliases = model.services?.[serviceName]?.extra_hosts || {};
    const hasHostGateway = Array.isArray(aliases)
      ? aliases.some((value) => /^host\.docker\.internal[:=]host-gateway$/.test(String(value)))
      : aliases['host.docker.internal'] === 'host-gateway';
    if (!hasHostGateway) fail(`${label} ${serviceName} is missing the Linux host-gateway alias`);
  }
  if (String(controller.environment?.APP_API_PORT) !== expectedPort) {
    fail(`${label} APP_API_PORT expected ${expectedPort}, got ${controller.environment?.APP_API_PORT}`);
  }
  if (String(controller.environment?.APP_API_URL ?? '') !== expectedUrl) {
    fail(`${label} APP_API_URL expected ${expectedUrl || '(empty)'}, got ${controller.environment?.APP_API_URL}`);
  }
  if (String(controller.environment?.DASHBOARD_COOKIE_SECURE) !== expectedSecureCookie) {
    fail(`${label} DASHBOARD_COOKIE_SECURE expected ${expectedSecureCookie}, got ${controller.environment?.DASHBOARD_COOKIE_SECURE}`);
  }

  const expectedVolumes = [
    'bootstrap_data',
    'controller_data',
    'gateway_conf',
    'gateway_control',
    'gateway_logs',
    'n8n_data',
    'postgres_data',
  ];
  const actualVolumes = Object.keys(model.volumes || {}).sort();
  if (JSON.stringify(actualVolumes) !== JSON.stringify(expectedVolumes)) {
    fail(`${label} named volumes differ: ${actualVolumes.join(', ') || '(none)'}`);
  }
  for (const volume of expectedVolumes) {
    if (model.volumes?.[volume]?.name !== `jat-validation_${volume}`) {
      fail(`${label} ${volume} is not project-scoped`);
    }
  }

  const expectedMounts = {
    postgres: [['postgres_data', '/var/lib/postgresql/data']],
    n8n: [['n8n_data', '/home/node/.n8n'], ['bootstrap_data', '/bootstrap']],
    'trading-controller': [['controller_data', '/data'], ['gateway_control', '/gateway-control']],
    'gateway-init': [['gateway_conf', '/home/gateway/conf']],
    gateway: [
      ['gateway_conf', '/home/gateway/conf'],
      ['gateway_logs', '/home/gateway/logs'],
      ['gateway_control', '/gateway-control'],
    ],
    'rpc-configurator': [['gateway_conf', '/gateway-conf'], ['gateway_control', '/gateway-control']],
    'n8n-permissions': [['n8n_data', '/n8n-data'], ['bootstrap_data', '/bootstrap']],
    'n8n-bootstrap': [['n8n_data', '/home/node/.n8n'], ['bootstrap_data', '/bootstrap']],
  };
  for (const [serviceName, expected] of Object.entries(expectedMounts)) {
    const service = model.services?.[serviceName];
    if (!service) fail(`${label} persistent service is missing: ${serviceName}`);
    if (service.container_name) fail(`${label} ${serviceName} has a host-global container_name`);
    const actual = (service.volumes || [])
      .map((mount) => [mount.source, mount.target, mount.type, mount.volume?.nocopy])
      .sort((a, b) => a[1].localeCompare(b[1]));
    const wanted = expected.map(([source, target]) => [source, target, 'volume', true])
      .sort((a, b) => a[1].localeCompare(b[1]));
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      fail(`${label} ${serviceName} persistent mounts differ: ${JSON.stringify(actual)}`);
    }
  }

  for (const [serviceName, service] of Object.entries(model.services || {})) {
    if (service.container_name) fail(`${label} ${serviceName} has a host-global container_name`);
    if (!Object.hasOwn(expectedMounts, serviceName) && (service.volumes || []).length) {
      fail(`${label} unexpected persistent mounts on ${serviceName}`);
    }
    for (const mount of service.volumes || []) {
      if (mount.type !== 'volume') fail(`${label} ${serviceName} contains non-volume storage at ${mount.target}`);
      if (mount.volume?.nocopy !== true) fail(`${label} ${serviceName} mount ${mount.target} is missing nocopy`);
      if (!expectedVolumes.includes(mount.source)) fail(`${label} ${serviceName} uses undeclared storage source ${mount.source}`);
    }
  }

  const expectedNetworks = {
    postgres: ['n8n_db'],
    n8n: ['n8n_db', 'n8n_runners', 'trading_control'],
    'n8n-runner': ['n8n_runners'],
    'trading-controller': ['trading_control'],
    gateway: ['trading_control'],
    'rpc-configurator': ['trading_control'],
    'n8n-bootstrap': ['n8n_db', 'trading_control'],
  };
  const isolatedServices = new Set(['gateway-init', 'n8n-permissions']);
  for (const [serviceName, service] of Object.entries(model.services || {})) {
    const actual = Object.keys(service.networks || {}).sort();
    const expected = (expectedNetworks[serviceName] || []).toSorted();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${label} ${serviceName} network boundary changed: ${actual.join(', ') || '(none)'}`);
    }
    if (isolatedServices.has(serviceName) && service.network_mode !== 'none') {
      fail(`${label} ${serviceName} must use network_mode none`);
    }
  }
  const actualNetworkKeys = Object.keys(model.networks || {}).sort();
  if (JSON.stringify(actualNetworkKeys) !== JSON.stringify(['n8n_db', 'n8n_runners', 'trading_control'])) {
    fail(`${label} top-level networks changed: ${actualNetworkKeys.join(', ') || '(none)'}`);
  }

  const expectedDependencies = {
    n8n: { postgres: 'service_healthy', 'n8n-permissions': 'service_completed_successfully' },
    'n8n-runner': { n8n: 'service_healthy', 'n8n-bootstrap': 'service_completed_successfully' },
    'trading-controller': {
      n8n: 'service_healthy',
      gateway: 'service_healthy',
      'rpc-configurator': 'service_healthy',
      'n8n-bootstrap': 'service_completed_successfully',
    },
    gateway: { 'gateway-init': 'service_completed_successfully' },
    'rpc-configurator': { 'gateway-init': 'service_completed_successfully' },
    'n8n-bootstrap': { n8n: 'service_healthy' },
  };
  for (const [serviceName, service] of Object.entries(model.services || {})) {
    const actual = Object.fromEntries(
      Object.entries(service.depends_on || {}).map(([dependency, value]) => [dependency, value.condition]),
    );
    const expected = expectedDependencies[serviceName] || {};
    if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(expected).sort())) {
      fail(`${label} ${serviceName} dependency lifecycle changed: ${JSON.stringify(actual)}`);
    }
  }

  const longRunning = new Set(['postgres', 'n8n', 'n8n-runner', 'trading-controller', 'gateway', 'rpc-configurator']);
  for (const [serviceName, service] of Object.entries(model.services || {})) {
    const expectedRestart = longRunning.has(serviceName) ? 'unless-stopped' : 'no';
    if (service.restart !== expectedRestart) {
      fail(`${label} ${serviceName} restart expected ${expectedRestart}, got ${service.restart}`);
    }
    if (service.logging?.driver !== 'local' || String(service.logging?.options?.['max-size']) !== '10m' ||
        String(service.logging?.options?.['max-file']) !== '3') {
      fail(`${label} ${serviceName} must use bounded local logging (10m × 3)`);
    }
  }

  const expectedStopGrace = {
    postgres: new Set(['60s', '1m0s']),
    n8n: new Set(['30s']),
    'n8n-runner': new Set(['30s']),
    gateway: new Set(['30s']),
  };
  for (const [serviceName, accepted] of Object.entries(expectedStopGrace)) {
    const actual = String(model.services?.[serviceName]?.stop_grace_period || '');
    if (!accepted.has(actual)) fail(`${label} ${serviceName} graceful-stop window changed: ${actual || '(missing)'}`);
  }

  const gatewayHealth = model.services?.gateway?.healthcheck;
  if (!gatewayHealth) fail(`${label} gateway healthcheck is missing`);
  if (String(gatewayHealth.interval) !== '20s') {
    fail(`${label} gateway health interval expected 20s, got ${gatewayHealth.interval}`);
  }
  if (String(gatewayHealth.timeout) !== '10s') {
    fail(`${label} gateway health timeout expected 10s, got ${gatewayHealth.timeout}`);
  }
  if (Number(gatewayHealth.retries) !== 10) {
    fail(`${label} gateway health retries expected 10, got ${gatewayHealth.retries}`);
  }
  if (!['90s', '1m30s'].includes(String(gatewayHealth.start_period))) {
    fail(`${label} gateway health start period expected 90s, got ${gatewayHealth.start_period}`);
  }
  const gatewayHealthTest = Array.isArray(gatewayHealth.test)
    ? gatewayHealth.test.join(' ')
    : String(gatewayHealth.test || '');
  if (!gatewayHealthTest.includes("fetch('http://127.0.0.1:15888/')")) {
    fail(`${label} Gateway healthcheck must probe its internal HTTP root`);
  }

  const gatewayCommand = Array.isArray(model.services?.gateway?.command)
    ? model.services.gateway.command.join('\n')
    : String(model.services?.gateway?.command || '');
  if (!gatewayCommand.includes('START_SERVER=true node dist/index.js --dev')) {
    fail(`${label} Gateway must start the tracked Node process explicitly in private HTTP mode`);
  }
  if (String(model.services?.gateway?.environment?.DEV) !== 'true') {
    fail(`${label} Gateway DEV environment marker must remain true`);
  }
  if (String(controller.environment?.GATEWAY_URL) !== 'http://gateway:15888') {
    fail(`${label} controller Gateway URL must remain on the private HTTP service endpoint`);
  }

  const published = Object.values(model.services || {}).flatMap((service) => service.ports || []);
  if (published.length !== 1 || String(published[0].published) !== '5680' || Number(published[0].target) !== 5680) {
    fail(`${label} expected only published port 5680:5680`);
  }
}

validConfig('default source', {}, '8000', '');
validConfig('same-host custom port', { APP_API_PORT: '8001' }, '8001', '');
validConfig('HTTPS reverse-proxy cookie', { DASHBOARD_COOKIE_SECURE: 'true' }, '8000', '', 'true');
validConfig(
  'remote full URL',
  { APP_API_PORT: '8001', APP_API_URL: 'https://alerts.example.com/api/tokens' },
  '8001',
  'https://alerts.example.com/api/tokens',
);

const defaultProjectResult = runConfig({}, [], null);
if (defaultProjectResult.status !== 0) {
  fail(`default project-name Compose config failed: ${defaultProjectResult.error?.message || defaultProjectResult.stderr || 'unknown error'}`);
}
let defaultProjectModel;
try { defaultProjectModel = JSON.parse(defaultProjectResult.stdout); }
catch (error) { fail(`default project-name Compose JSON could not be parsed: ${error.message}`); }
if (defaultProjectModel.name !== 'jupiter-usdc-auto-trader') {
  fail(`top-level default project name changed: ${defaultProjectModel.name}`);
}
for (const [volume, definition] of Object.entries(defaultProjectModel.volumes || {})) {
  if (definition.name !== `jupiter-usdc-auto-trader_${volume}`) {
    fail(`default project volume is not stably scoped: ${volume} -> ${definition.name}`);
  }
}

for (const secret of Object.keys(stableTestSecrets)) {
  const result = runConfig({}, [secret]);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error) fail(`could not run Docker Compose while testing ${secret}: ${result.error.message}`);
  if (result.status === 0) fail(`Compose accepted missing required secret ${secret}`);
  if (!output.includes(secret)) fail(`missing-secret error did not identify ${secret}`);
}

console.log('PASS: Compose configuration, storage, network, dependency, restart, shutdown, logging, secret, and port invariants verified');
