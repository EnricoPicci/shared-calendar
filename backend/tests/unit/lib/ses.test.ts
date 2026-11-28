import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { mockClient } from 'aws-sdk-client-mock';
import { sendMail, XLSX_CONTENT_TYPE } from '../../../src/lib/ses';

// The one door to SES (docs/EMAIL_ARCHITECTURE.md sections 3.1 and 8.2).
const ses = mockClient(SESv2Client);
const TEXT = { subject: 'Calendar, Tue 1 Dec 2026 to Mon 7 Dec 2026', text: 'The words.\n', html: '<p>The words.</p>' };
const FILE = { fileName: 'calendar-2026-12-01-to-2026-12-07.xlsx', contentType: XLSX_CONTENT_TYPE, content: new Uint8Array([80, 75, 3, 4]) };

beforeEach(() => {
  ses.reset();
  vi.stubEnv('MAIL_FROM', 'Shared calendar <noreply@example.com>');
  vi.stubEnv('MAIL_REPLY_TO', 'replies@example.com');
  vi.stubEnv('MAIL_CONFIGURATION_SET', 'shared-calendar-api-mail');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendMail', () => {
  it('sends one simple mail to the one address, From, Reply-To and the configuration set from the environment, the files attached', async () => {
    ses.on(SendEmailCommand).resolves({ MessageId: 'msg-1' });

    await expect(sendMail('anna@example.com', TEXT, [FILE])).resolves.toBe('msg-1');

    expect(ses.commandCalls(SendEmailCommand)[0]!.args[0].input).toEqual({
      FromEmailAddress: 'Shared calendar <noreply@example.com>',
      Destination: { ToAddresses: ['anna@example.com'] },
      ReplyToAddresses: ['replies@example.com'],
      ConfigurationSetName: 'shared-calendar-api-mail',
      Content: {
        Simple: {
          Subject: { Data: TEXT.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: TEXT.text, Charset: 'UTF-8' }, Html: { Data: TEXT.html, Charset: 'UTF-8' } },
          Attachments: [{ FileName: FILE.fileName, ContentType: XLSX_CONTENT_TYPE, ContentDisposition: 'ATTACHMENT', ContentTransferEncoding: 'BASE64', RawContent: FILE.content }],
        },
      },
    });
  });

  it('sends without a configuration set when none is named', async () => {
    vi.stubEnv('MAIL_CONFIGURATION_SET', '');
    ses.on(SendEmailCommand).resolves({ MessageId: 'msg-2' });
    await sendMail('anna@example.com', TEXT, []);
    expect(ses.commandCalls(SendEmailCommand)[0]!.args[0].input.ConfigurationSetName).toBeUndefined();
  });

  it('throws, sending nothing, without a sender or a Reply-To', async () => {
    vi.stubEnv('MAIL_FROM', '');
    await expect(sendMail('anna@example.com', TEXT, [])).rejects.toThrow('MAIL_FROM is not set');
    vi.stubEnv('MAIL_FROM', 'Shared calendar <noreply@example.com>');
    vi.stubEnv('MAIL_REPLY_TO', '');
    await expect(sendMail('anna@example.com', TEXT, [])).rejects.toThrow('MAIL_REPLY_TO is not set');
    expect(ses.calls()).toHaveLength(0);
  });

  it('throws when SES answers without a message id, and passes on a refusal as it came', async () => {
    ses.on(SendEmailCommand).resolves({});
    await expect(sendMail('anna@example.com', TEXT, [])).rejects.toThrow('SES answered without a message id');
    const refused = Object.assign(new Error('Email address is not verified.'), { name: 'MessageRejected' });
    ses.on(SendEmailCommand).rejects(refused);
    await expect(sendMail('anna@example.com', TEXT, [])).rejects.toBe(refused);
  });

  it('takes its endpoint from SES_ENDPOINT, and the default without it', async () => {
    vi.stubEnv('SES_ENDPOINT', 'http://fake-mail:8025');
    vi.resetModules();
    const local = await import('../../../src/lib/ses');
    expect(await local.sesClient.config.endpoint?.()).toMatchObject({ hostname: 'fake-mail', port: 8025 });
    vi.stubEnv('SES_ENDPOINT', '');
    vi.resetModules();
    const cloud = await import('../../../src/lib/ses');
    expect(cloud.sesClient.config.endpoint).toBeUndefined();
  });
});
