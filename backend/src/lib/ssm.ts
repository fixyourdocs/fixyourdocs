import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

// Module-level cache: a warm Lambda reuses the fetched value across
// invocations, so the GitHub OAuth client id/secret are read from SSM at most
// once per execution environment.
const cache = new Map<string, string>();

export async function getParam(name: string, decrypt = false): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: decrypt }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} is empty or missing`);
  cache.set(name, value);
  return value;
}
