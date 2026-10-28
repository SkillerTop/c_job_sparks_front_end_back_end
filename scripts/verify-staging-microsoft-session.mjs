const baseUrl = process.env.STAGING_BASE_URL?.replace(/\/$/, '');
const cookie = process.env.STAGING_MICROSOFT_SESSION_COOKIE?.trim();
if (!baseUrl || !cookie) {
  throw new Error('STAGING_BASE_URL and STAGING_MICROSOFT_SESSION_COOKIE are required. Complete Microsoft login in staging and store the resulting Cookie header as an environment secret.');
}

const response = await fetch(`${baseUrl}/api/v1/me`, {
  headers: { cookie },
  redirect: 'manual',
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`The Microsoft staging session was rejected with ${response.status}.`);
const body = await response.json();
if (!body?.user?.email || !body?.user?.employeeId) throw new Error('The staging session did not return a linked employee identity.');
process.stdout.write(`Microsoft staging session is active for ${body.user.email}.\n`);
