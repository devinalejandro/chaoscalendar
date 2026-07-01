const COOKIE_NAME = "aurora_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

const loginPage = (message = "") => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Aurora Calendar Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#4A3436;background:radial-gradient(circle at 18% 16%,rgba(241,185,199,.65),transparent 25rem),radial-gradient(circle at 85% 18%,rgba(228,211,240,.8),transparent 24rem),linear-gradient(150deg,#FFF8F6 0%,#F8ECE9 44%,#EFE2F0 100%);display:grid;place-items:center;padding:22px;overflow:hidden}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:radial-gradient(circle at 18% 22%,rgba(201,124,147,.16) 0 4px,transparent 5px),radial-gradient(circle at 82% 72%,rgba(157,128,172,.14) 0 3px,transparent 4px);background-size:140px 140px,180px 180px}
    .wrap{position:relative;width:min(100%,920px);display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,402px);gap:28px;align-items:center}
    .intro,.card{background:rgba(255,255,255,.72);border:1px solid rgba(201,124,147,.18);box-shadow:0 24px 70px rgba(201,124,144,.18);backdrop-filter:blur(18px)}
    .intro{border-radius:34px;padding:42px}
    .card{border-radius:32px;padding:28px}
    .eyebrow{margin:0 0 14px;color:#C97C93;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    h1{margin:0 0 16px;font-size:clamp(38px,5vw,70px);line-height:.96;letter-spacing:-.06em}
    p{margin:0;color:#7C6460;line-height:1.6}
    .phone-card{height:190px;border-radius:28px;background:linear-gradient(135deg,#F1B9C7,#D98CA0);display:grid;place-items:center;text-align:center;color:#fff;box-shadow:0 16px 36px rgba(201,124,144,.28);margin-bottom:24px;position:relative;overflow:hidden}
    .phone-card:before{content:"✦";font-size:48px;color:#4A3436}
    .phone-card strong{position:absolute;bottom:46px;font-size:20px}
    label{display:grid;gap:8px;margin:18px 0 12px;color:#6E5450;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    input{width:100%;height:54px;border:1px solid #F0D7DC;border-radius:16px;background:#fff;color:#4A3436;font-size:17px;padding:0 16px;outline:none}
    input:focus{border-color:#C97C93;box-shadow:0 0 0 4px rgba(201,124,147,.16)}
    button{width:100%;height:54px;border:0;border-radius:16px;background:linear-gradient(135deg,#E7A9B8,#C97C93);color:#fff;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 12px 28px rgba(201,124,144,.28)}
    .error{margin:12px 0 0;color:#A3485E;font-weight:700;font-size:14px}
    .note{margin-top:14px;font-size:13px;color:#9C7F76;text-align:center}
    @media (max-width:759px){.wrap{display:block}.intro{display:none}.card{width:100%;max-width:402px;margin:auto;min-height:calc(100vh - 44px);display:flex;flex-direction:column;justify-content:center}.phone-card{height:220px}}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="intro" aria-label="Aurora Calendar overview">
      <p class="eyebrow">Aurora Calendar</p>
      <h1>Private family planning, safely tucked away.</h1>
      <p>Log in once on this device, then Aurora opens to Karla's dashboard after onboarding. Family data syncs securely through the protected site storage.</p>
    </section>
    <section class="card" aria-label="Login">
      <div class="phone-card"><strong>Yo Momma K's Calendar</strong></div>
      <p class="eyebrow">Welcome Back</p>
      <h2 style="margin:0 0 8px;font-size:28px;line-height:1.08;">Enter the family password</h2>
      <p>Only Karla's household should have this.</p>
      <form method="post" action="/login">
        <label>Password<input name="password" type="password" autocomplete="current-password" autofocus required /></label>
        <button type="submit">Open dashboard</button>
      </form>
      ${message ? `<p class="error">${message}</p>` : ""}
      <p class="note">Your session is stored as a secure browser cookie.</p>
    </section>
  </main>
</body>
</html>`;

const base64Url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sign = async (value, secret) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
};

const getCookie = (req, name) => {
  const cookie = req.headers.get("Cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const createSession = async (secret) => {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `v1.${expires}`;
  return `${value}.${await sign(value, secret)}`;
};

const isValidSession = async (token, secret) => {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const value = `${parts[0]}.${parts[1]}`;
  return parts[2] === await sign(value, secret);
};

const html = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

export default async (req, context) => {
  const password = Netlify.env.get("SITE_PASSWORD");
  const secret = Netlify.env.get("SITE_SESSION_SECRET");
  const url = new URL(req.url);

  if (!password || !secret) {
    return new Response("Site authentication is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (url.pathname === "/logout") {
    return Response.redirect(new URL("/", url), 302, {
      "Set-Cookie": `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
    });
  }

  if (url.pathname === "/login" && req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form?.get("password") === password) {
      const session = await createSession(secret);
      return Response.redirect(new URL("/", url), 302, {
        "Set-Cookie": `${COOKIE_NAME}=${session}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      });
    }
    return html(loginPage("That password did not work. Try again."), 401);
  }

  if (await isValidSession(getCookie(req, COOKIE_NAME), secret)) {
    return context.next();
  }

  return html(loginPage(), 200);
};

export const config = {
  path: "/*",
};
