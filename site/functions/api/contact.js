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

  // Teams card (immediacy)
  let teamsOk = false;
  try {
    const res = await fetch(env.TEAMS_WEBHOOK_URL, {
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
              body: [
                { type: 'TextBlock', text: '✉️ Mensaje del formulario de contacto', weight: 'Bolder', size: 'Medium' },
                {
                  type: 'FactSet',
                  facts: [
                    { title: 'Nombre', value: name },
                    { title: 'Organización', value: organization || '—' },
                    { title: 'Email', value: email },
                  ],
                },
                { type: 'TextBlock', text: message, wrap: true },
              ],
            },
          },
        ],
      }),
    });
    teamsOk = res.ok;
  } catch {
    // fall through to email
  }

  // Email via Resend (formal record, reply-to the sender)
  let emailOk = false;
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Abadi Family Office <noreply@abadi.me>',
          to: env.NOTIFY_EMAIL.split(',').map((e) => e.trim()),
          reply_to: email,
          subject: `Website contact — ${name}`,
          text: [
            'New message from the contact form at office.abadi.me',
            '',
            `Name:         ${name}`,
            `Organization: ${organization || '—'}`,
            `Email:        ${email}`,
            '',
            message,
          ].join('\n'),
        }),
      });
      emailOk = res.ok;
    } catch {
      // teams may have succeeded
    }
  }

  if (!teamsOk && !emailOk) {
    return new Response('Upstream error', { status: 502 });
  }

  return Response.json({ ok: true });
}
