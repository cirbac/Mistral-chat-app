import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Mistral } from '@mistralai/mistralai';

const envPath = path.join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.MISTRAL_API_KEY) {
  console.error('Erreur : MISTRAL_API_KEY est manquante. Copiez .env.example en .env puis renseignez votre clé.');
  process.exit(1);
}

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const model = 'mistral-small-latest';
const port = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  );
}

app.post('/api/chat', async (req, res) => {
  const raw = (req.body as { messages?: unknown } | undefined)?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isChatMessage)) {
    res.status(400).json({
      error: 'Corps attendu : { "messages": [{ "role": "system|user|assistant", "content": "..." }] } (tableau non vide).',
    });
    return;
  }
  const messages = (raw as ChatMessage[]).slice(-50);

  try {
    const response = await client.chat.complete({ model, messages });
    const content = response.choices?.[0]?.message?.content;
    const reply =
      typeof content === 'string'
        ? content
        : (content ?? [])
            .map((chunk) => ('text' in chunk ? chunk.text : ''))
            .join('');
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Échec de l'appel à l'API Mistral." });
  }
});

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
