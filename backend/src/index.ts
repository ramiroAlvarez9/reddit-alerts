import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { onboardingRouter } from './routes/onboarding.js';
import { businessesRouter } from './routes/businesses.js';
import { matchesRouter } from './routes/matches.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/onboarding', onboardingRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/matches', matchesRouter);

app.listen(config.port, () => {
  console.log(`reddit-alerts backend listening on :${config.port}`);
});
