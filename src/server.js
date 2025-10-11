import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the backend directory, prefer file values over existing env
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

if (process.env.NODE_ENV !== 'production') {
  const mask = (val) => (val ? `${String(val).slice(0, 6)}…` : 'missing');
  console.log('[env] OPENAI_MODEL =', process.env.OPENAI_MODEL || 'gpt-4o-mini');
  console.log('[env] OPENAI_API_KEY =', mask(process.env.OPENAI_API_KEY));
}

import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
