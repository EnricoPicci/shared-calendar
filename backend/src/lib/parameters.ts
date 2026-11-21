import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';

// AWS Systems Manager Parameter Store: the read of one named parameter. The module knows nothing
// of what the parameter is for, keeps nothing in memory and logs nothing: the value it reads is a
// secret.

// Built once per container and reused across invocations.
export const ssmClient = new SSMClient({});

/**
 * The value of the parameter `name`, decrypted when it is a `SecureString`, or `null` when no
 * such parameter exists. Any other failure (the read refused, the service unreachable) is thrown
 * as the AWS SDK gave it.
 */
export async function readParameter(name: string): Promise<string | null> {
  try {
    const result = await ssmClient.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    return result.Parameter?.Value ?? null;
  } catch (err) {
    if (err instanceof ParameterNotFound) return null;
    throw err;
  }
}
