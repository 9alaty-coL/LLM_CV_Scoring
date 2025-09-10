import express from 'express';
import dotenv from 'dotenv';
import cvScoreRouter from './routes/scoreRoute.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

// Basic health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Static assets (UI)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/score-cv', cvScoreRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
