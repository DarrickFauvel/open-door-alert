/**
 * Push notifications via ntfy (https://ntfy.sh). Uses the JSON publish API so
 * titles/messages can contain any UTF-8. Without a topic it runs as a dry run.
 */
export function createNtfy({ server, topic, token }) {
  return {
    configured: Boolean(topic),

    async send({ title, message, priority = 3, tags = [] }) {
      if (!topic) return { status: 'dry-run' };
      try {
        const res = await fetch(server, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ topic, title, message, priority, tags }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: 'failed', error: `HTTP ${res.status} ${await res.text()}`.trim() };
        return { status: 'sent' };
      } catch (err) {
        return { status: 'failed', error: err.message };
      }
    },
  };
}
