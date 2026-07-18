import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../db.js';
import { onboardBusiness } from '../services/onboarding.js';

export const onboardingRouter = Router();

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  websiteUrl: z.string().url().optional(),
  theme: z.string().optional(),
  problemsSolved: z.string().optional(),
  competitors: z.array(z.string()).optional(),
});

/**
 * Captures the user email, upserts the user, and runs LLM discovery to bootstrap
 * the business with suggested subreddits and keywords.
 */
onboardingRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const input = parsed.data;

  if (!input.websiteUrl && !input.theme) {
    return res.status(400).json({ error: 'Provide a websiteUrl or a theme' });
  }

  try {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .upsert({ email: input.email }, { onConflict: 'email' })
      .select()
      .single<{ id: string }>();

    if (userErr || !user) {
      return res.status(500).json({ error: `User upsert failed: ${userErr?.message}` });
    }

    const result = await onboardBusiness({
      userId: user.id,
      name: input.name,
      websiteUrl: input.websiteUrl,
      theme: input.theme,
      problemsSolved: input.problemsSolved,
      competitors: input.competitors,
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('[onboarding] failed:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});
