import { Router } from 'express';
import { supabase } from '../db.js';

export const matchesRouter = Router();

/** Lists matches for a business, newest first. */
matchesRouter.get('/', async (req, res) => {
  const businessId = req.query.businessId;
  if (typeof businessId !== 'string') {
    return res.status(400).json({ error: 'businessId query param is required' });
  }

  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('business_id', businessId)
    .order('created_utc', { ascending: false })
    .limit(200);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ matches: data ?? [] });
});
