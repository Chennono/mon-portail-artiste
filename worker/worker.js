// Mon Portail Artiste — service de publication (Cloudflare Worker + KV)
//
// POST /publish  { "html": "<!doctype html>..." }  -> { "url": "https://.../p/<id>", "id", "expiresInDays" }
// GET  /p/<id>                                      -> sert la page HTML stockée
//
// Stockage : KV namespace lié sous le nom PORTAILS (voir wrangler.toml).
// Les pages expirent automatiquement (TTL) pour respecter la minimisation des données.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const EXPIRATION_DAYS = 90;
const MAX_BYTES = 5_000_000; // 5 Mo (les images sont intégrées en base64)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Servir une page publiée
    if (request.method === "GET" && url.pathname.startsWith("/p/")) {
      const id = url.pathname.slice(3);
      const html = id ? await env.PORTAILS.get(id) : null;
      if (!html) {
        return new Response("Page introuvable ou expirée.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300"
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

      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      await env.PORTAILS.put(id, html, { expirationTtl: 60 * 60 * 24 * EXPIRATION_DAYS });
      return json({ url: `${url.origin}/p/${id}`, id, expiresInDays: EXPIRATION_DAYS });
    }

    return json({ service: "Mon Portail Artiste — publication", endpoints: ["POST /publish", "GET /p/:id"] });
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
