const REALM = "Aurora Calendar";

const unauthorized = () =>
  new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });

const getPassword = (authorization) => {
  if (!authorization || !authorization.startsWith("Basic ")) return "";
  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    return separator >= 0 ? decoded.slice(separator + 1) : "";
  } catch {
    return "";
  }
};

export default async (req, context) => {
  const expected = Netlify.env.get("SITE_PASSWORD");

  if (!expected) {
    return new Response("SITE_PASSWORD is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (getPassword(req.headers.get("Authorization")) !== expected) {
    return unauthorized();
  }

  return context.next();
};

export const config = {
  path: "/*",
};
