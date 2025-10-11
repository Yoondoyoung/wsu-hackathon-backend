import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure .env is loaded even if this module is imported before server bootstrap
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Prefer backend/.env
  dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
  // Fallback to repo-root/.env
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: false });
} catch (_) {
  // noop
}

export const ENABLE_AUDIO = /^true$/i.test((process.env.ENABLE_AUDIO || '').trim() || 'false');
export const ENABLE_IMAGES = /^true$/i.test((process.env.ENABLE_IMAGES || '').trim() || 'false');
export const ENABLE_BUNDLE = /^true$/i.test((process.env.ENABLE_BUNDLE || '').trim() || 'false');
export const ENABLE_ELEVEN_ENDPOINTS = /^true$/i.test((process.env.ENABLE_ELEVEN_ENDPOINTS || '').trim() || 'false');

if (process.env.NODE_ENV !== 'production') {
  console.log('[features] ENABLE_AUDIO =', process.env.ENABLE_AUDIO, '=>', ENABLE_AUDIO);
  console.log('[features] ENABLE_ELEVEN_ENDPOINTS =', process.env.ENABLE_ELEVEN_ENDPOINTS, '=>', ENABLE_ELEVEN_ENDPOINTS);
  console.log('[features] ENABLE_IMAGES =', process.env.ENABLE_IMAGES, '=>', ENABLE_IMAGES);
}

export const disabledHandler = (featureName) => (req, res) => {
  res.status(503).json({
    message: `${featureName} is currently disabled`,
  });
};
