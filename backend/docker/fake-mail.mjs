// The fake mail of the local stack (docs/EMAIL_ARCHITECTURE.md section 14.2): a stand-in for Amazon
// SES, so that the mailer runs and is tested without an AWS account and no mail ever leaves the
// laptop. Plain Node, no dependency. It answers the one call the mailer makes, SESv2's SendEmail
// (a POST to its path of outbound e-mails, the simple form with attachments), checks no signature and never
// sends anything: it keeps each mail in memory, its files included, until the container stops.
//
// What it shows:
//   GET  /                                 the mails, newest first, as a page for a person
//   GET  /mails/<id>/html                  a mail's HTML body, in a sandbox: no script, no request
//   GET  /mails/<id>/files/<n>             a mail's nth file (from 0), to download and open
//   GET  /mails[?to=<address>]             the mails as JSON for the journeys, the files in base64
//   DELETE /mails[?to=<address>]           forgets the mails, or those sent to one address
// The journeys read and forget only the mails of the addresses they made, so that they never touch
// a mail another person is looking at.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = 8025;
// The mails kept, at most: the oldest goes when a new one comes, so the memory stays small.
const KEPT = 200;
const mails = [];

// Text put into the page: the five characters HTML gives a meaning, as entities, so that a subject
// or a file name is shown as written and never read as markup.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A SendEmail request as a kept mail, or null when it is not the simple form with one recipient
// list. The files arrive in base64, as the SDK writes RawContent.
function mailOf(request) {
  const simple = request?.Content?.Simple;
  const to = request?.Destination?.ToAddresses;
  if (!simple || !Array.isArray(to) || to.length === 0) return null;
  return {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    from: request.FromEmailAddress ?? null,
    to,
    replyTo: request.ReplyToAddresses ?? [],
    configurationSet: request.ConfigurationSetName ?? null,
    subject: simple.Subject?.Data ?? '',
    text: simple.Body?.Text?.Data ?? '',
    html: simple.Body?.Html?.Data ?? '',
    attachments: (simple.Attachments ?? []).map((a) => ({
      fileName: a.FileName ?? 'file',
      contentType: a.ContentType ?? 'application/octet-stream',
      size: Buffer.from(a.RawContent ?? '', 'base64').length,
      content: a.RawContent ?? '',
    })),
  };
}

// The mails sent to one address (lower case, as the API stores it), or all of them.
const sentTo = (address) => (address ? mails.filter((m) => m.to.some((t) => t.toLowerCase() === address.toLowerCase())) : mails);

function page() {
  const rows = [...mails].reverse().map((m) => {
    const files = m.attachments
      .map((a, n) => `<li><a href="/mails/${m.id}/files/${n}">${escapeHtml(a.fileName)}</a> (${a.size} bytes)</li>`)
      .join('');
    return `<article>
<h2>${escapeHtml(m.subject)}</h2>
<p class="meta">${escapeHtml(m.receivedAt)} · to ${escapeHtml(m.to.join(', '))} · from ${escapeHtml(m.from ?? '')} · reply to ${escapeHtml(m.replyTo.join(', '))}</p>
<pre>${escapeHtml(m.text)}</pre>
<p><a href="/mails/${m.id}/html">The HTML body</a></p>
${files ? `<ul>${files}</ul>` : ''}
</article>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fake mail</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:1rem auto;padding:0 1rem;background:#fff;color:#111}
article{border-top:1px solid #ccc;padding:.5rem 0}.meta{color:#555;font-size:.9rem}pre{white-space:pre-wrap;background:#f6f6f6;padding:.5rem}</style>
</head><body><h1>Fake mail</h1><p>${mails.length} mail(s) kept in memory, newest first. Nothing here was sent.</p>
${rows.join('\n') || '<p>No mail yet.</p>'}</body></html>`;
}

function answer(res, status, type, body, headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, body) => answer(res, status, 'application/json', JSON.stringify(body));

function handle(req, res, body) {
  const url = new URL(req.url, 'http://fake-mail');
  const path = url.pathname;
  const to = url.searchParams.get('to');

  if (req.method === 'POST' && path === '/v2/email/outbound-emails') {
    let request;
    try {
      request = JSON.parse(body);
    } catch {
      return json(res, 400, { message: 'The body is not JSON' });
    }
    const mail = mailOf(request);
    if (!mail) return json(res, 400, { message: 'Only the simple form with recipients is faked' });
    mails.push(mail);
    if (mails.length > KEPT) mails.shift();
    return json(res, 200, { MessageId: mail.id });
  }
  if (req.method === 'GET' && path === '/') return answer(res, 200, 'text/html; charset=utf-8', page());
  if (req.method === 'GET' && path === '/mails') return json(res, 200, { mails: sentTo(to) });
  if (req.method === 'DELETE' && path === '/mails') {
    const forget = new Set(sentTo(to));
    const kept = mails.filter((m) => !forget.has(m));
    mails.length = 0;
    mails.push(...kept);
    return json(res, 200, { forgotten: forget.size });
  }
  const html = /^\/mails\/([^/]+)\/html$/.exec(path);
  if (req.method === 'GET' && html) {
    const mail = mails.find((m) => m.id === html[1]);
    if (!mail) return json(res, 404, { message: 'No such mail' });
    // A sandbox with nothing allowed: the mail's HTML shows, but runs no script and loads nothing.
    return answer(res, 200, 'text/html; charset=utf-8', mail.html, { 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" });
  }
  const file = /^\/mails\/([^/]+)\/files\/(\d+)$/.exec(path);
  if (req.method === 'GET' && file) {
    const attachment = mails.find((m) => m.id === file[1])?.attachments[Number(file[2])];
    if (!attachment) return json(res, 404, { message: 'No such file' });
    const name = attachment.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return answer(res, 200, attachment.contentType, Buffer.from(attachment.content, 'base64'), { 'content-disposition': `attachment; filename="${name}"` });
  }
  return json(res, 404, { message: 'Not faked' });
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    handle(req, res, Buffer.concat(chunks).toString('utf8'));
    // One line per request, never an address, a subject or a file: the method, the path, the status.
    console.log(`${new Date().toISOString()} ${req.method} ${new URL(req.url, 'http://fake-mail').pathname} ${res.statusCode}`);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`fake mail listening on ${PORT}`));
// As the container's first process Node ignores the stop signal unless told otherwise.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
