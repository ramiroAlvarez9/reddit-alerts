import { Router } from 'express';
import { supabase } from '../db.js';
import { scanAllBusinesses } from '../services/scan.js';

export const businessesRouter = Router();

/** Lists businesses for a given user email. */
businessesRouter.get('/', async (req, res) => {
  const email = req.query.email;
  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'email query param is required' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single<{ id: string }>();

  if (!user) return res.json({ businesses: [] });

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ businesses: data ?? [] });
});

/** Manually triggers a scan across all businesses (also runnable via cron). */
businessesRouter.post('/scan', async (_req, res) => {
  try {
    const count = await scanAllBusinesses();
    return res.json({ newMatches: count });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});
