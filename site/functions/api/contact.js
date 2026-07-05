export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const name = String(data.name || data.nombre || '').trim().slice(0, 200);
  const organization = String(data.organization || data.organizacion || '').trim().slice(0, 200);
  const email = String(data.email || data.correo || '').trim().slice(0, 200);
  const message = String(data.message || data.mensaje || '').trim().slice(0, 5000);

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
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
      to: [env.NOTIFY_EMAIL],
      reply_to: email,
      subject: `Website contact — ${name}`,
      text: [
        'New message from the contact form',
        '',
        `Name:         ${name}`,
        `Organization: ${organization || '—'}`,
        `Email:        ${email}`,
        '',
        message,
      ].join('\n'),
    }),
  });

  if (!res.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  return Response.json({ ok: true });
}
