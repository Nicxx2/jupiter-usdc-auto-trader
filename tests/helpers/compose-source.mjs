import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const composeSource = readFileSync(resolve(repositoryRoot, 'docker-compose.yml'), 'utf8')
  .replaceAll('\r\n', '\n');

export function extractComposeSource(startNeedle, endNeedle, options = {}) {
  const { after = 0, label = startNeedle } = options;
  const start = composeSource.indexOf(startNeedle, after);
  const end = composeSource.indexOf(endNeedle, start + startNeedle.length);

  if (start < 0 || end <= start) {
    throw new Error(`Could not extract ${label} from docker-compose.yml`);
  }

  // Compose escapes a literal JavaScript dollar sign as $$.
  return composeSource.slice(start, end).replaceAll('$$', '$');
}

export function evaluateComposeSource(source, returnExpression, prelude = '') {
  return new Function(`${prelude}\n${source}\nreturn (${returnExpression});`)();
}
