// Mon Portail Artiste — service de publication (Cloudflare Worker + KV)
//
// POST /publish  { html, slug, id?, editToken? } -> { url, id, editToken? }
// GET  /p/<id>                                      -> sert la page HTML stockée
//
// Stockage : KV namespace lié sous le nom PORTAILS (voir wrangler.toml).
// Une première publication crée une adresse personnalisée et un jeton d'édition.
// Les publications suivantes écrasent la page à la même adresse.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const MAX_BYTES = 5_000_000; // 5 Mo (les images sont intégrées en base64)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Servir une page publiée
    if (request.method === "GET" && url.pathname.startsWith("/p/")) {
      const id = readPortalId(url.pathname.slice(3));
      const stored = id ? await env.PORTAILS.get(id) : null;
      const record = parseRecord(stored);
      if (!record) {
        return new Response("Page introuvable.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
      return new Response(record.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, no-cache, max-age=0"
        }
      });
    }

    // Publier une page
    if (request.method === "POST" && url.pathname === "/publish") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Corps JSON invalide." }, 400);
      }
      const html = typeof body.html === "string" ? body.html : "";
      if (html.length < 50) return json({ error: "HTML manquant." }, 400);
      if (html.length > MAX_BYTES) return json({ error: "Page trop lourde (max 5 Mo)." }, 413);

      const requestedId = sanitizePortalId(body.id);
      const editToken = typeof body.editToken === "string" ? body.editToken : "";

      if (requestedId && editToken) {
        const existing = parseRecord(await env.PORTAILS.get(requestedId));
        if (!existing || existing.version !== 2) return json({ error: "Page publiée introuvable." }, 404);
        if (!(await tokenMatches(editToken, existing.tokenHash))) return json({ error: "Autorisation de mise à jour refusée." }, 403);

        const updatedRecord = {
          ...existing,
          html,
          updatedAt: new Date().toISOString()
        };
        await env.PORTAILS.put(requestedId, JSON.stringify(updatedRecord));
        return json({ url: portalUrl(url.origin, requestedId), id: requestedId, permanent: true, updated: true });
      }

      const baseSlug = sanitizePortalId(body.slug) || "artiste";
      const id = await availablePortalId(env.PORTAILS, baseSlug);
      const newEditToken = randomToken();
      const now = new Date().toISOString();
      const record = {
        version: 2,
        html,
        tokenHash: await hashToken(newEditToken),
        createdAt: now,
        updatedAt: now
      };
      await env.PORTAILS.put(id, JSON.stringify(record));
      return json({ url: portalUrl(url.origin, id), id, editToken: newEditToken, permanent: true, updated: false }, 201);
    }

    return json({ service: "Mon Portail Artiste — publication", permanentUrls: true, endpoints: ["POST /publish", "GET /p/:id"] });
  }
};

function parseRecord(stored) {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed?.version === 2 && typeof parsed.html === "string") return parsed;
  } catch {
    // Les anciennes pages étaient stockées directement sous forme de HTML.
  }
  return { version: 1, html: stored };
}

function sanitizePortalId(value) {
  return String(value || "")
    .toLocaleLowerCase("fr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function readPortalId(value) {
  try {
    return sanitizePortalId(decodeURIComponent(value));
  } catch {
    return "";
  }
}

async function availablePortalId(portals, baseSlug) {
  if (!(await portals.get(baseSlug))) return baseSlug;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${baseSlug}-${randomToken(5).slice(0, 7).toLowerCase()}`;
    if (!(await portals.get(candidate))) return candidate;
  }
  return `${baseSlug}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tokenMatches(token, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash || "")) return false;
  const actual = hexToBytes(await hashToken(token));
  const expected = hexToBytes(expectedHash);
  return crypto.subtle.timingSafeEqual(actual, expected);
}

function hexToBytes(value) {
  return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

function portalUrl(origin, id) {
  return `${origin}/p/${encodeURIComponent(id)}`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
