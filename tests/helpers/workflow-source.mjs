import { composeSource } from './compose-source.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const encodedWorkflow = composeSource.match(/^\s+JAT_WORKFLOW_B64:\s+(\S+)\s*$/m)?.[1];

if (!encodedWorkflow) {
  throw new Error('Could not find the embedded n8n workflow in docker-compose.yml');
}

export const workflow = JSON.parse(Buffer.from(encodedWorkflow, 'base64').toString('utf8'));

export function workflowCode(name) {
  const node = workflow.nodes.find(candidate => candidate?.name === name);
  if (!node || typeof node.parameters?.jsCode !== 'string') {
    throw new Error(`Could not find n8n Code node ${JSON.stringify(name)}`);
  }
  return node.parameters.jsCode;
}

export async function runWorkflowCode(name, options = {}) {
  const { json = {}, nodes = {} } = options;
  const getNode = nodeName => ({
    first() {
      if (!Object.hasOwn(nodes, nodeName)) {
        throw new Error(`Test did not provide n8n node input ${JSON.stringify(nodeName)}`);
      }
      return { json: nodes[nodeName] };
    },
  });
  const result = await new AsyncFunction('$json', '$', workflowCode(name))(json, getNode);
  return result?.[0]?.json;
}
