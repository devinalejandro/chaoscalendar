# Chaos Calendar Launch Checklist

Use this before pushing a production deploy.

## Required Gates

- Run `npm --prefix app run test`
- Run `npm --prefix app run build`
- Run `npm --prefix app run lint`
- Run `npx --yes netlify-cli build`
- Open `/admin` and confirm there are no blocked checks.
- Export a backup from `/settings`.
- Confirm `/legacy` opens and still has the legacy export button.
- Confirm `/migration` can import a known legacy backup.
- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set before enabling real Supabase sync.
- Confirm Netlify password/auth gate behavior is intentional for launch.

## Production Launch

- Push `main` to GitHub.
- Deploy through Netlify production build.
- Verify `https://chaoscalendar.app/today`.
- Verify `https://chaoscalendar.app/legacy`.
- Verify manifest install prompt on a phone browser.
- Add a test bill, reload, and confirm it persists.
- Export a fresh post-launch backup.
