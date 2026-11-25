import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { MailerEvent } from './mailerEvent';

// The one door to Lambda's own API (docs/EMAIL_ARCHITECTURE.md section 6.1): a route starts the
// mailer in the background and answers at once.

// Built once per container. LAMBDA_ENDPOINT points at `npm run local:lambda` on the local stack
// (docs/EMAIL_PLAN.md finding F3); in the cloud the template sets it to '' and the SDK default
// applies.
export const lambdaClient = new LambdaClient({ endpoint: process.env.LAMBDA_ENDPOINT || undefined });

/**
 * Starts the mailer, named by MAILER_FUNCTION, with one event, as an asynchronous invoke
 * (`InvocationType: Event`): Lambda keeps the event, answers 202 at once, runs the mailer later
 * and tries a failed run twice more. Anything but 202 is thrown.
 */
export async function startMailer(event: MailerEvent): Promise<void> {
  const functionName = process.env.MAILER_FUNCTION;
  if (!functionName) throw new Error('MAILER_FUNCTION is not set');
  const result = await lambdaClient.send(
    new InvokeCommand({ FunctionName: functionName, InvocationType: 'Event', Payload: new TextEncoder().encode(JSON.stringify(event)) }),
  );
  if (result.StatusCode !== 202) throw new Error(`Lambda answered ${String(result.StatusCode)} to the mailer's start`);
}
