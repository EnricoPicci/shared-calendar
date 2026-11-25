import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { MailText } from '@shared-calendar/shared';

// The one door to Amazon SES (docs/EMAIL_ARCHITECTURE.md sections 3.1 and 8.2): one call, SESv2's
// SendEmail with the attachments in the simple form (`Content.Simple.Attachments`). It logs
// nothing: a mail's address, text and files never reach a log (docs/EMAIL_ARCHITECTURE.md
// section 12.4).

// Built once per container. SES_ENDPOINT points at the fake mail of the local stack; in the cloud
// the template sets it to '' and the SDK default applies.
export const sesClient = new SESv2Client({ endpoint: process.env.SES_ENDPOINT || undefined });

/** A file attached to a mail, made in memory. */
export type MailAttachment = { fileName: string; contentType: string; content: Uint8Array };

/** The content type of an Excel file (.xlsx). */
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The sender, the address replies go to, and the configuration set that reports bounces, from the
// stack's parameters (docs/EMAIL_ARCHITECTURE.md section 13.1). A missing sender or Reply-To is a
// broken deployment: an ordinary error. Without a configuration set the mail is sent without one.
function senderSettings(): { from: string; replyTo: string; configurationSet: string | undefined } {
  const from = process.env.MAIL_FROM;
  const replyTo = process.env.MAIL_REPLY_TO;
  if (!from) throw new Error('MAIL_FROM is not set');
  if (!replyTo) throw new Error('MAIL_REPLY_TO is not set');
  return { from, replyTo, configurationSet: process.env.MAIL_CONFIGURATION_SET || undefined };
}

/**
 * Sends one mail to one address, with its plain-text and HTML bodies and its files, and answers
 * the message id SES gives it. Any refusal of SES is thrown as it came, so that the mailer's run
 * fails and Lambda tries it again.
 */
export async function sendMail(to: string, text: MailText, attachments: readonly MailAttachment[]): Promise<string> {
  const { from, replyTo, configurationSet } = senderSettings();
  const result = await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [replyTo],
      ConfigurationSetName: configurationSet,
      Content: {
        Simple: {
          Subject: { Data: text.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: text.text, Charset: 'UTF-8' }, Html: { Data: text.html, Charset: 'UTF-8' } },
          Attachments: attachments.map((a) => ({ FileName: a.fileName, ContentType: a.contentType, ContentDisposition: 'ATTACHMENT', RawContent: a.content })),
        },
      },
    }),
  );
  if (!result.MessageId) throw new Error('SES answered without a message id');
  return result.MessageId;
}
