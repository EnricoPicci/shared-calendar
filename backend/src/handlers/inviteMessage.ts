import { invitationMailText, readLanguage, type Language } from '@shared-calendar/shared';
import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { log } from '../lib/logger';

// Cognito's "custom message" trigger (docs/MULTILANGUAGE_ARCHITECTURE.md section 7): before it
// e-mails an invitation, or its resend, Cognito asks this function for the subject and the body.
// They are the invitation of shared/src/mail/texts.ts, in the person's own language, which an
// invited person does not have yet, so in practice the installation's (DEFAULT_LANGUAGE,
// docs/MULTILANGUAGE_ARCHITECTURE.md section 4.3). The username and the temporary password go in
// as the placeholders Cognito hands over, which it fills in afterwards: the password never passes
// through here. Any other kind of message is answered untouched, so Cognito sends its own; the pool
// sends no other today. Should this function fail, the creation fails, and the route answers an
// error and keeps nothing.
//
// It touches no AWS service. One log line per call: the kind of message and the language's code,
// never an attribute, an address or a text.

// The installation's language; English when it is unset, as on the local stack.
const defaultLanguage = (): Language => readLanguage(process.env.DEFAULT_LANGUAGE) ?? 'en';

export const handler = async (event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> => {
  if (event.triggerSource !== 'CustomMessage_AdminCreateUser') {
    log('info', { requestId: 'unknown', source: event.triggerSource, outcome: 'untouched' });
    return event;
  }
  const language = readLanguage(event.request.userAttributes.locale) ?? defaultLanguage();
  const { subject, html } = invitationMailText(language, {
    username: event.request.usernameParameter ?? '{username}',
    password: event.request.codeParameter,
    page: process.env.PAGE_ADDRESS ?? '',
  });
  event.response.emailSubject = subject;
  event.response.emailMessage = html;
  log('info', { requestId: 'unknown', source: event.triggerSource, language, outcome: 'worded' });
  return event;
};
