async function notifyTeams(env, text) {
  try {
    await fetch(env.TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [{ type: 'TextBlock', text, wrap: true }],
            },
          },
        ],
      }),
    });
  } catch {
    // best effort
  }
}

async function expireGuests(env) {
  const now = Date.now();
  const list = await env.GUEST_EXPIRY.list({ prefix: 'guest:' });
  const expired = [];

  for (const key of list.keys) {
    const expiresAt = Number(await env.GUEST_EXPIRY.get(key.name));
    if (expiresAt && expiresAt < now) {
      expired.push({ key: key.name, email: key.name.slice('guest:'.length) });
    }
  }

  if (expired.length === 0) return { removed: [] };

  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/policies/${env.GUESTS_POLICY_ID}`;
  const headers = { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' };

  const cur = await (await fetch(api, { headers })).json();
  if (!cur.success) return { error: 'cannot read policy' };

  const pol = cur.result;
  const expiredEmails = new Set(expired.map((e) => e.email));
  const keep = (pol.include || []).filter(
    (r) => !(r.email && expiredEmails.has(String(r.email.email).toLowerCase()))
  );

  if (keep.length !== (pol.include || []).length) {
    const upd = await (
      await fetch(api, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: pol.name,
          decision: pol.decision,
          include: keep,
          exclude: pol.exclude || [],
          require: pol.require || [],
        }),
      })
    ).json();
    if (!upd.success) return { error: 'cannot update policy' };
  }

  const removed = [];
  for (const e of expired) {
    // revoke any active session, best effort
    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/organizations/revoke_user`,
        { method: 'POST', headers, body: JSON.stringify({ email: e.email }) }
      );
    } catch {
      // ignore
    }
    await env.GUEST_EXPIRY.delete(e.key);
    removed.push(e.email);
  }

  if (removed.length) {
    await notifyTeams(env, `⏰ Acceso de invitado expirado (24h) y removido: ${removed.join(', ')}. Puede volver a solicitarlo en abadi.me.`);
  }

  return { removed };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(expireGuests(env));
  },

  // manual trigger for testing: GET /?key=<RUN_KEY>
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get('key') !== env.RUN_KEY) {
      return new Response('forbidden', { status: 403 });
    }
    const result = await expireGuests(env);
    return Response.json(result);
  },
};
