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
