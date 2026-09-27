import { promises as fs } from 'node:fs';
import path from 'node:path';

const SAFE_KEY = /^[\w-]+$/;
const assertSafe = (key) => {
  if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
  return key;
};

/** File-system storage used for local runs and Docker. Same interface as the Netlify Blobs store. */
export function createFsStore(dir) {
  const mediaDir = path.join(dir, 'uploads');
  const ensure = () => fs.mkdir(mediaDir, { recursive: true });

  return {
    async getJSON(key) {
      await ensure();
      try {
        return JSON.parse(await fs.readFile(path.join(dir, `${assertSafe(key)}.json`), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async setJSON(key, value) {
      await ensure();
      const file = path.join(dir, `${assertSafe(key)}.json`);
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, JSON.stringify(value, null, 2));
      await fs.rename(temp, file);
    },

    async getMedia(id) {
      await ensure();
      try {
        const file = path.join(mediaDir, assertSafe(id));
        const [data, contentType] = await Promise.all([fs.readFile(file), fs.readFile(`${file}.type`, 'utf8')]);
        return { data, contentType };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async setMedia(id, data, contentType) {
      await ensure();
      const file = path.join(mediaDir, assertSafe(id));
      await fs.writeFile(file, data);
      await fs.writeFile(`${file}.type`, contentType);
    },

    async deleteMedia(id) {
      await ensure();
      const file = path.join(mediaDir, assertSafe(id));
      await Promise.all([fs.rm(file, { force: true }), fs.rm(`${file}.type`, { force: true })]);
    },
  };
}
