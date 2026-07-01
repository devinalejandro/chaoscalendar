import { getStore } from "@netlify/blobs";

const store = getStore({ name: "aurora-calendar", consistency: "strong" });
const STATE_KEY = "household-state";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Allow": "GET, PUT, POST, OPTIONS",
        "Cache-Control": "no-store",
      },
    });
  }

  if (req.method === "GET") {
    const stored = await store.get(STATE_KEY, { type: "json" });
    return json(stored || { version: 1, updatedAt: null, data: null });
  }

  if (req.method !== "PUT" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await req.json().catch(() => null);
  const data = body && typeof body === "object" ? body.data || body : null;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json({ error: "Expected a JSON object payload" }, 400);
  }

  const record = {
    version: 1,
    updatedAt: new Date().toISOString(),
    data,
  };

  await store.setJSON(STATE_KEY, record);
  return json(record);
};

export const config = {
  path: "/api/state",
  method: ["GET", "PUT", "POST", "OPTIONS"],
};
