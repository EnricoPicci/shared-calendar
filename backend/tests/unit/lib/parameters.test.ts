import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { readParameter } from '../../../src/lib/parameters';

const ssm = mockClient(SSMClient);
const NAME = '/shared-calendar-api/anthropic-api-key';

beforeEach(() => {
  ssm.reset();
});

describe('readParameter', () => {
  it('asks for the one parameter, decrypted, and gives its value', async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Name: NAME, Type: 'SecureString', Value: 'the-value' } });

    await expect(readParameter(NAME)).resolves.toBe('the-value');

    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
    expect(ssm.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual({ Name: NAME, WithDecryption: true });
  });

  it('gives null when the parameter does not exist', async () => {
    ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ message: 'Parameter not found', $metadata: {} }));

    await expect(readParameter(NAME)).resolves.toBeNull();
  });

  it('gives null when the answer carries no value', async () => {
    ssm.on(GetParameterCommand).resolves({});

    await expect(readParameter(NAME)).resolves.toBeNull();
  });

  it('throws any other failure as the AWS SDK gave it', async () => {
    const denied = Object.assign(new Error('not authorized to perform ssm:GetParameter'), { name: 'AccessDeniedException' });
    ssm.on(GetParameterCommand).rejects(denied);

    await expect(readParameter(NAME)).rejects.toBe(denied);
  });
});
