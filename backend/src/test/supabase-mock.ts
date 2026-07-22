import { vi } from 'vitest';

type Resolved = { data: unknown; error: unknown };

interface ChainOptions {
  single?: Resolved;
  await?: Resolved;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'in',
  'order',
  'limit',
  'match',
  'filter',
  'not',
  'or',
  'contains',
] as const;

function makeThenable(value: Resolved) {
  return {
    then: (resolve: (v: Resolved) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(value).catch(reject),
    finally: (cb: () => void) => Promise.resolve(value).finally(cb),
  };
}

export interface SupabaseChain extends ReturnType<typeof makeThenable> {
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
}

export function makeChain(options: ChainOptions = {}): SupabaseChain {
  const defaultResolved: Resolved = options.await ?? options.single ?? { data: null, error: null };

  const chain = makeThenable(defaultResolved) as SupabaseChain;

  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }

  chain.single = vi.fn(() => makeThenable(options.single ?? defaultResolved));
  chain.maybeSingle = vi.fn(() => makeThenable(options.single ?? defaultResolved));

  return chain;
}

export function makeSupabaseMock(perTable: Record<string, ChainOptions | SupabaseChain> = {}) {
  const from = vi.fn((table: string) => {
    const config = perTable[table];
    if (config && 'single' in config && typeof config.single === 'function') {
      return config;
    }
    return makeChain(config as ChainOptions | undefined);
  });

  return {
    supabase: { from } as unknown as { from: typeof from },
    from,
  };
}
