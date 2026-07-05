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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AFO Website <noreply@abadi.me>',
      to: env.NOTIFY_EMAIL.split(',').map(e => e.trim()),
      reply_to: email,
      subject: `Access request — ${firstName} ${lastName}`,
      text: [
        'New access request from abadi.me',
        '',
        `Name:  ${firstName} ${lastName}`,
        `Email: ${email}`,
        '',
        'To grant access: Cloudflare Zero Trust → Access → Applications → AFO Site → add this email to the allow policy.',
      ].join('\n'),
    }),
  });

  if (!res.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  return Response.json({ ok: true });
}
