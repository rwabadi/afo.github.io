const enc = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signToken(payload, secret) {
  const p = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(p)));
  return `${p}.${b64url(sig)}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const firstName = String(data.firstName || '').trim().slice(0, 100);
  const lastName = String(data.lastName || '').trim().slice(0, 100);
  const email = String(data.email || '').trim().slice(0, 200);

  if (!firstName || !lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response('Invalid fields', { status: 400 });
  }

  const name = `${firstName} ${lastName}`;
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const approveToken = await signToken({ e: email, n: name, a: 'approve', x: exp }, env.SIGNING_SECRET);
  const rejectToken = await signToken({ e: email, n: name, a: 'reject', x: exp }, env.SIGNING_SECRET);

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: '🔐 Solicitud de acceso — abadi.me', weight: 'Bolder', size: 'Medium' },
            {
              type: 'FactSet',
              facts: [
                { title: 'Nombre', value: name },
                { title: 'Email', value: email },
              ],
            },
            {
              type: 'TextBlock',
              text: 'Al aprobar se te pedirá iniciar sesión (solo la familia puede aprobar). El enlace vence en 7 días.',
              wrap: true,
              size: 'Small',
              isSubtle: true,
            },
          ],
          actions: [
            { type: 'Action.OpenUrl', title: '✅ Aprobar', url: `${new URL(request.url).origin}/api/approve?t=${approveToken}` },
            { type: 'Action.OpenUrl', title: '❌ Rechazar', url: `${new URL(request.url).origin}/api/approve?t=${rejectToken}` },
          ],
        },
      },
    ],
  };

  const res = await fetch(env.TEAMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  if (!res.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  return Response.json({ ok: true });
}
