import { createClient } from '@supabase/supabase-js';

const SAFE_KEY = /^[\w-]+$/;
const assertSafe = (key) => {
  if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
  return key;
};

/** Supabase (Postgres) storage: same interface as the filesystem and Netlify Blobs stores. */
export function createSupabaseStore({ url, secretKey }) {
  const client = createClient(url, secretKey, { auth: { persistSession: false } });

  return {
    async getJSON(key) {
      assertSafe(key);
      const { data, error } = await client.from('kv_store').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    },

    async setJSON(key, value) {
      assertSafe(key);
      const { error } = await client.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
    },

    async getMedia(id) {
      assertSafe(id);
      const { data, error } = await client.from('media').select('content_type, data').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { data: Buffer.from(data.data.replace(/^\\x/, ''), 'hex'), contentType: data.content_type };
    },

    async setMedia(id, buffer, contentType) {
      assertSafe(id);
      const { error } = await client.from('media').upsert({ id, content_type: contentType, data: `\\x${buffer.toString('hex')}` });
      if (error) throw error;
    },

    async deleteMedia(id) {
      assertSafe(id);
      const { error } = await client.from('media').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
