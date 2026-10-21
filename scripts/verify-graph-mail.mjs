const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the staging Graph mail check.`);
  return value;
};

const tenantId = required('MICROSOFT_TENANT_ID');
const clientId = required('MICROSOFT_CLIENT_ID');
const clientSecret = required('MICROSOFT_CLIENT_SECRET');
const sender = required('MAIL_SENDER_USER_ID');
const recipient = required('STAGING_MAIL_TEST_RECIPIENT');

const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }),
  signal: AbortSignal.timeout(15_000),
});
if (!tokenResponse.ok) throw new Error(`Graph token request failed with ${tokenResponse.status}.`);
const { access_token: accessToken } = await tokenResponse.json();

const mailResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
  method: 'POST',
  headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    message: {
      subject: `C-Job Sparks staging check ${new Date().toISOString()}`,
      body: { contentType: 'Text', content: 'Automated staging verification of Microsoft Graph Mail.Send.' },
      toRecipients: [{ emailAddress: { address: recipient } }],
    },
    saveToSentItems: true,
  }),
  signal: AbortSignal.timeout(15_000),
});
if (mailResponse.status !== 202) throw new Error(`Graph sendMail failed with ${mailResponse.status}: ${await mailResponse.text()}`);
process.stdout.write(`Graph accepted the staging message for ${recipient}. Verify delivery in the recipient mailbox.\n`);
