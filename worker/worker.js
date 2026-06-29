// Mon Portail Artiste — publication et assistant Mistral (Cloudflare Worker)
//
// POST /publish  { html, slug, id?, editToken? } -> { url, id, editToken? }
// GET  /p/<id>                                      -> sert la page HTML stockée
// POST /ai       { mode, messages, prompt }         -> réponse Mistral
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
const MAX_AI_BYTES = 80_000;
const MISTRAL_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method === "POST" && url.pathname === "/ai") {
      return handleAi(request, env);
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
      if (!(await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, request.headers.get("CF-Connecting-IP")))) {
        return json({ error: "Vérification anti-robot échouée. Réessayez." }, 403);
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

    // Dépublier (supprimer) une page — nécessite le jeton d'édition
    if (request.method === "POST" && url.pathname === "/unpublish") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Corps JSON invalide." }, 400);
      }
      const targetId = sanitizePortalId(body.id);
      const editToken = typeof body.editToken === "string" ? body.editToken : "";
      if (!targetId || !editToken) return json({ error: "Identifiant ou jeton manquant." }, 400);

      const existing = parseRecord(await env.PORTAILS.get(targetId));
      if (!existing) return json({ deleted: true, id: targetId });
      if (existing.version !== 2 || !(await tokenMatches(editToken, existing.tokenHash))) {
        return json({ error: "Autorisation de suppression refusée." }, 403);
      }
      await env.PORTAILS.delete(targetId);
      return json({ deleted: true, id: targetId });
    }

    return json({
      service: "Mon Portail Artiste — publication et IA",
      model: MISTRAL_MODEL,
      permanentUrls: true,
      endpoints: ["POST /ai", "POST /publish", "POST /unpublish", "GET /p/:id"]
    });
  }
};

async function handleAi(request, env) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_AI_BYTES) return json({ error: "Conversation trop volumineuse." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  if (JSON.stringify(body).length > MAX_AI_BYTES) return json({ error: "Conversation trop volumineuse." }, 413);

  const mode = body?.mode === "generate" ? "generate" : body?.mode === "chat" ? "chat" : "";
  if (!mode) return json({ error: "Mode IA invalide." }, 400);

  const messages = sanitizeMessages(body.messages);
  if (!messages.some((message) => message.role === "user")) {
    return json({ error: "Ajoutez d'abord un message sur votre pratique." }, 400);
  }
  if (!(await withinAiRateLimit(request, env.PORTAILS))) {
    return json({ error: "Trop de demandes ont été envoyées. Réessayez dans quelques minutes." }, 429);
  }

  const system = mode === "generate" ? generationSystemPrompt() : chatSystemPrompt();
  const aiMessages = [{ role: "system", content: system }, ...messages];

  const options = {
    messages: aiMessages,
    max_tokens: mode === "generate" ? 1_800 : 420,
    temperature: mode === "generate" ? 0.2 : 0.35,
    repetition_penalty: 1.08
  };

  try {
    const result = await env.AI.run(MISTRAL_MODEL, options);
    const response = result?.response;
    if (mode === "chat") {
      const reply = typeof response === "string" ? response.trim() : "";
      if (!reply) throw new Error("Réponse de conversation vide");
      return json({ reply, model: "Mistral Small 3.1" });
    }

    const portal = parseAiObject(response);
    if (!portal || typeof portal.name !== "string") throw new Error("Réponse structurée invalide");
    return json(portal);
  } catch (error) {
    console.error(JSON.stringify({ event: "mistral_error", mode, message: error instanceof Error ? error.message : String(error) }));
    return json({ error: "Mistral est momentanément indisponible. Le brouillon local reste accessible." }, 502);
  }
}

// Vérifie un jeton Turnstile. Si aucun secret n'est configuré, la protection est
// désactivée (comportement inchangé). Sinon, un jeton valide est exigé.
async function verifyTurnstile(token, secret, ip) {
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await result.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function withinAiRateLimit(request, portals) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const hour = new Date().toISOString().slice(0, 13);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const visitor = Array.from(new Uint8Array(digest).slice(0, 10), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `_ai_rate:${hour}:${visitor}`;
  try {
    const count = Number(await portals.get(key)) || 0;
    if (count >= 40) return false;
    await portals.put(key, String(count + 1), { expirationTtl: 7_200 });
  } catch (error) {
    console.error(JSON.stringify({ event: "ai_rate_limit_error", message: error instanceof Error ? error.message : String(error) }));
  }
  return true;
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  let remaining = 24_000;
  return input
    .slice(-18)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : "";
      const content = cleanText(message?.content, Math.min(6_000, remaining));
      remaining -= content.length;
      return { role, content };
    })
    .filter((message) => message.role && message.content && remaining >= 0);
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, Math.max(0, maxLength)) : "";
}

function parseAiObject(response) {
  if (response && typeof response === "object" && !Array.isArray(response)) return response;
  if (typeof response !== "string") return null;
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function chatSystemPrompt() {
  return `Tu es l'assistant Mistral de Mon Portail Artiste. Tu aides des artistes et professionnels du spectacle à transformer leurs mots en page professionnelle. Réponds dans la langue du dernier message, en français si elle est incertaine. Sois chaleureux, concret et facile à comprendre pour une personne peu à l'aise avec le numérique. Pose au maximum une seule question courte. N'invente jamais de parcours, prix, exposition, compétence ou contact. Ne classe pas et n'évalue pas la personne. Ne demande pas de donnée sensible inutile.`;
}

function generationSystemPrompt() {
  return `Tu es l'assistant éditorial Mistral de Mon Portail Artiste. À partir des seuls faits donnés par la personne, prépare le contenu de son portail professionnel. Écris dans la langue principalement utilisée dans la conversation, avec un ton accueillant, précis et naturel. Respecte aussi toute consigne de ton donnée par la personne (par ex. plus poétique, plus sobre). N'invente jamais de parcours, prix, exposition, compétence, œuvre, date, lieu, lien ou contact. Si une information manque, laisse une chaîne vide ou un tableau vide. Le statement explique la démarche; la bio reste factuelle; la tagline est courte; le SEO est une méta-description. Les œuvres doivent uniquement reprendre celles citées. Le complianceNote rappelle que le contenu est assisté par IA, modifiable et à relire.

Retourne UNIQUEMENT un objet JSON valide (aucun texte avant ou après, sans bloc de code), avec EXACTEMENT ces clés :
{"name":"","location":"","tagline":"","statement":"","bio":"","goals":"","contact":"","seo":"","keywords":[],"works":[{"title":"","year":"","medium":"","description":""}],"links":[],"complianceNote":""}`;
}

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
