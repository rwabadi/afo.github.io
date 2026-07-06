const enc = new TextEncoder();

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyToken(token, secret) {
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(p));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (!payload.x || payload.x < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function page(title, body, extra = '') {
  return new Response(
    `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — AFO</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
<style>
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #FAF8F7; color: #231F20; font-family: Georgia, serif; padding: 24px; text-align: center; }
  .box { max-width: 440px; }
  h1 { font-size: 24px; font-style: italic; font-weight: 400; }
  p { margin-top: 14px; font-size: 15px; line-height: 1.6; color: #7A6E66; }
  .divider { width: 32px; height: 1px; background: #A1554B; border: none; margin: 0 auto 24px; }
  a.btn { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #231F20; color: #FAF8F7;
    text-decoration: none; font-family: -apple-system, sans-serif; font-size: 12px; letter-spacing: 2px; }
</style>
</head>
<body><div class="box"><hr class="divider"><h1>${title}</h1><p>${body}</p>${extra}</div></body>
</html>`,
    { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

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
    // notification failure should not block the approval itself
  }
}

async function emailGuest(env, payload) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abadi Family Office <noreply@abadi.me>',
        to: [payload.e],
        subject: 'Access granted — Abadi Family Office',
        text: `Hello ${payload.n},\n\nYour access to the Abadi Family Office site has been approved.\n\nVisit https://abadi.me, choose Sign In, and enter this email address — you will receive a one-time code to enter.\n\nAbadi Family Office\nPanama City, Panama`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const payload = await verifyToken(url.searchParams.get('t') || '', env.SIGNING_SECRET);

  if (!payload) {
    return page('Enlace inválido', 'Este enlace es inválido o ya expiró. Pide al solicitante enviar la solicitud de nuevo.');
  }

  if (payload.a === 'reject') {
    await notifyTeams(env, `❌ Solicitud de acceso de ${payload.n} (${payload.e}) rechazada.`);
    return page('Solicitud descartada', `La solicitud de ${payload.n} fue rechazada. No se requiere ninguna acción adicional.`);
  }

  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/policies/${env.GUESTS_POLICY_ID}`;
  const headers = { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' };

  const cur = await (await fetch(api, { headers })).json();
  if (!cur.success) {
    return page('Error', 'No se pudo leer la política de invitados. Revisa la configuración.');
  }

  const pol = cur.result;
  const include = pol.include || [];
  const already = include.some((r) => r.email && String(r.email.email).toLowerCase() === payload.e.toLowerCase());

  let emailed = false;
  if (!already) {
    include.push({ email: { email: payload.e } });
    const upd = await (
      await fetch(api, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: pol.name,
          decision: pol.decision,
          include,
          exclude: pol.exclude || [],
          require: pol.require || [],
        }),
      })
    ).json();
    if (!upd.success) {
      return page('Error', 'No se pudo actualizar la política de invitados. Inténtalo desde el dashboard de Cloudflare.');
    }
    emailed = await emailGuest(env, payload);
    await notifyTeams(
      env,
      `✅ ${payload.n} (${payload.e}) aprobado. ${emailed ? 'Se le envió el correo de acceso automáticamente.' : 'Avísenle que ya puede ingresar.'}`
    );
  }

  const mailto = `mailto:${encodeURIComponent(payload.e)}?subject=${encodeURIComponent('Access granted — Abadi Family Office')}&body=${encodeURIComponent(
    `Hello ${payload.n},\n\nYour access has been approved. Visit https://abadi.me, choose Sign In, and enter this email address — you will receive a one-time code to enter.\n\nAbadi Family Office`
  )}`;

  return page(
    already ? 'Ya estaba aprobado' : 'Acceso aprobado',
    `${payload.n} (${payload.e}) ${already ? 'ya tenía acceso al sitio.' : emailed ? 'ya puede ingresar — se le notificó por correo automáticamente.' : 'ya puede ingresar con su código por email.'}`,
    emailed ? '' : `<a class="btn" href="${mailto}">AVISAR AL INVITADO →</a>`
  );
}
