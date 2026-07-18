import { scanAllBusinesses } from '../services/scan.js';

/** One-shot scan entrypoint for a scheduler (cron, GitHub Actions, Supabase cron). */
async function main(): Promise<void> {
  const count = await scanAllBusinesses();
  console.log(`Scan complete. ${count} new match(es).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
