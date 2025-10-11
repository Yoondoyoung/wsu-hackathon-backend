import express from 'express';
import cors from 'cors';
import path from 'path';
import storyRoutes from './routes/storyRoutes.js';
import { notFoundHandler, errorHandler } from './utils/errorHandlers.js';

const app = express();
const publicDir = path.resolve('public');

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://wsu-hackathon.vercel.app',
    'https://wsu-hackathon-frontend.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use('/audio', express.static(path.join(publicDir, 'audio')));
app.use('/images', express.static(path.join(publicDir, 'images')));

// API routes
app.use('/api/story', storyRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'StoryCraft API Server', version: '1.0.0' });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
