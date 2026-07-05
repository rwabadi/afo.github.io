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
                { title: 'Nombre', value: `${firstName} ${lastName}` },
                { title: 'Email', value: email },
              ],
            },
            {
              type: 'TextBlock',
              text: 'Aprobar: Cloudflare Zero Trust → Access → Policies → Guests → agregar este email.',
              wrap: true,
              size: 'Small',
              isSubtle: true,
            },
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
