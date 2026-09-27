/**
 * Creates the value for ADMIN_PASSWORD_HASH.
 *   npm run hash-password -- "your new password"
 * Paste the printed line into .env (or into the Netlify environment variables).
 */
import { hashPassword } from '../server/auth.mjs';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: npm run hash-password -- "a password of 8 or more characters"');
  process.exit(1);
}
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
