import express from 'express';
import dotenv from 'dotenv';
import cvScoreRouter from './routes/scoreRoute.js';
import bulkScoreRouter from './routes/bulkScoreRoute.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Static assets (UI)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/score-cv', cvScoreRouter);
app.use('/api/bulk', bulkScoreRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
