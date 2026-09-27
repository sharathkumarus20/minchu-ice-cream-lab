import { createApi } from '../../server/api-core.mjs';
import { createSupabaseStore } from '../../server/store-supabase.mjs';
import seed from '../../data/seed.json' with { type: 'json' };

// Netlify environment variables are exposed on process.env. Storage is Supabase (Postgres).
const store = createSupabaseStore({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY });
const handle = createApi({ store, seed, env: process.env });

export default (request) => handle(request);

export const config = { path: '/api/*' };
