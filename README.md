# ಮಿಂಚು's Ice Cream Lab website

Plain HTML, CSS and JavaScript. No frontend framework. The admin panel edits everything on the site.

## Structure

```
webapp/
├── index.html              public homepage
├── admin/                  admin panel (index.html, admin.css, admin.js)
├── css/                    base.css, sections.css
├── js/                     site.js, order.js, motion.js, utils.js, schema.js
├── assets/                 favicon, sample product and memory illustrations
├── data/seed.json          content used the first time the site opens
├── server/                 API (api-core.mjs), auth, storage adapters, local server
├── netlify/functions/api.mjs   the API as a Netlify Function
├── scripts/                build.mjs (Netlify build), hash-password.mjs
├── .env                    admin login and session secret (never commit)
├── Dockerfile, docker-compose.yml, netlify.toml, package.json
```

`js/schema.js` lists every editable field once. The admin forms and the server-side validation both read it.

## Run locally

Requires Node 20.10 or newer. There is nothing to install.

```
cd webapp
npm start
```

Open http://localhost:8080 and http://localhost:8080/admin/. Data is stored in `data/store/`.

## Run with Docker Compose

```
cd webapp
docker compose up --build
```

Same addresses as above. Saved data lives in the `smriti-data` volume, so it survives restarts.

## Deploy to Netlify

1. Push the project to GitHub, GitLab or Bitbucket.
2. In Netlify choose **Add new site > Import an existing project**, and set **Base directory** to `webapp`.
   The build command, publish directory and functions folder come from `netlify.toml`.
3. Under **Site configuration > Environment variables** add the three values from `.env`:
   `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`.
   Use a new random `SESSION_SECRET` for production: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Deploy. Products, memories, settings and uploaded images are stored in Netlify Blobs, which needs no setup.

Command line alternative: `cd webapp && npx netlify deploy --prod`.

## Admin

- URL: `/admin/`
- Email: `admin.smriti@gmail.com`
- Change the password: `npm run hash-password -- "new password"`, then put the printed `ADMIN_PASSWORD_HASH=...` line in `.env` (and in Netlify).

## What can be configured in the admin

- **Products:** name, description, price per 100g (each weight's price is calculated automatically), which weights are sold (250g / 500g / 1kg), category, image, availability, featured, display order.
- **Memories:** image, title, description, display order.
- **Offers:** title, discount badge, description, an optional code for customers to mention, an optional image, a start/end date, and an active on/off switch. Only offers that are active and inside their date range show on the website.
- **Website settings:** brand name, chef name, website title and description, currency symbol, hero title, subtitle, description and image, story, why-choose-us reasons, how-ordering-works steps, all section headings, footer tagline and note.
- **Contact & ordering:** phone number, WhatsApp number, default WhatsApp message, email, address, Google Maps location link, opening hours.
- **Social links:** Instagram, Facebook, YouTube and any other links.

In text settings you can write `{brandName}` and `{chefName}`; they are replaced with the current names.

## Analytics dashboard

The admin Dashboard shows page visits and order-button taps: visits today, visits and order taps over the last 7 days, a WhatsApp vs Phone split, and the flavours customers tap most. This is anonymous aggregate counting only — no cookies, no personal or device data, and no third-party analytics service. Counts are stored in the same place as your other content (Netlify Blobs in production, `data/store/analytics.json` locally).

Deployment values that stay in `.env` because they are secrets: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, plus `PORT`, `DATA_DIR` and `MAX_UPLOAD_MB` for the local server.

## Security notes

- Sign-in is checked on the server. The password is stored only as a salted scrypt hash. A signed, HttpOnly, SameSite=Strict cookie holds the session (8 hours).
- Every change (products, memories, settings, uploads) needs that session. Unauthenticated requests get 401, and cross-site requests are rejected.
- The `/admin/` page itself is a public static file, because static hosting cannot gate files. It contains no secrets and shows only the sign-in form until you sign in.
- Failed-login throttling is per server instance, so on serverless hosting it slows guessing but is not a hard limit. For stronger protection use a long unique password.
- The site is rendered in the browser from the API, so search engines that do not run JavaScript will see an empty page.
