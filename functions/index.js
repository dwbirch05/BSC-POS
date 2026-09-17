// ---------------------------------------------------------------------------
// Cloud Function backend for Card Intake (AI card reading).
//
// This is the ONLY place the Anthropic API key ever lives -- it's held as a
// Firebase secret (see ../CARD_AI_SETUP.md) and never shipped to the
// browser. The app calls this as a callable function
// (js/firebase-store.js's cardAI.identifyCard), which automatically handles
// CORS and automatically verifies + passes the caller's Firebase Auth
// identity -- giving us a server-side identity check here as
// defense-in-depth on top of the client-side email allowlist
// (js/config.js's CARD_AI_ALLOWED_EMAILS).
//
// Input:  { frontDataUrl, backDataUrl, condition } -- base64 JPEG data URLs
//         plus the card's condition as picked by staff on the
//         pairing-confirm screen (one of "Near Mint or Better", "Excellent",
//         "Very Good", "Poor" -- defaults to "Excellent" in the UI). The AI does NOT grade the card itself --
//         condition is a human call (it drives price and reputation), the
//         AI just writes copy that matches the condition it's given.
// Output: { confident, reason, sport, player, setName, year, cardNumber,
//           parallel, title, description, category }
//
// IMPORTANT: this exact contract is what js/local-store.js's demo mock and
// js/views/card-intake.js both assume. If you change the output shape here,
// update those too.
//
// NOTE ON THE MODEL NAME: this sandbox has no network access to
// api.anthropic.com, so this prompt/model could not be tested against a
// real key while writing it. Before relying on this in production, check
// the current model id at https://docs.claude.com/en/docs/about-claude/models
// and confirm the response JSON still comes back in the shape expected
// below -- the prompt asks for it, but real-world tuning (card glare,
// unusual sets, etc.) may still be needed.
// ---------------------------------------------------------------------------
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-5"; // check the docs link above before deploying

// Keep this in sync with CARD_AI_ALLOWED_EMAILS in js/config.js -- the
// client already hides the feature from anyone not on that list, this is
// just the server-side backstop so the function itself can't be called
// directly (e.g. from devtools) by an account that shouldn't have access.
const ALLOWED_EMAILS = [
  "demo@bigscreencollectables.local",
  "dwbirch05@gmail.com",
];

// Condition is supplied by the caller (a human already looked at the card),
// not assessed by the model -- so the prompt has to be built per-request to
// tell the model what condition to write to. The model can still describe
// specific visual details it sees, as long as they're consistent with the
// given grade rather than contradicting it.
function buildCardPrompt(condition) {
  return `You are helping a trading card shop identify raw (ungraded) sports and TCG cards from photos of the front and back, and write the listing copy for them the way an experienced, detail-oriented card seller would -- specific and persuasive, never generic or robotic-sounding.

A staff member has already examined this physical card and assessed its raw (ungraded) condition as: "${condition}". Do NOT assess or second-guess the condition yourself -- use exactly this condition value in the title and description. You may still point out specific visual details you can see in the photos (centering, corner sharpness, edge wear, surface/print quality) as long as they support and are consistent with the given "${condition}" grade -- do not describe details that would contradict it.

Look at both images and respond with ONLY a single JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "confident": boolean,       // true only if you're confident in sport/game, player/character, set, and year
  "reason": string,           // if confident is false, a short (under 140 char) note on what's unclear -- otherwise ""
  "sport": string,            // e.g. "Basketball", "Pokemon TCG", "Magic: The Gathering" -- best guess, never blank
  "player": string,           // player or character name
  "setName": string,          // the set/product name
  "year": string,             // 4-digit year if visible/inferable, else ""
  "cardNumber": string,       // card number as printed, e.g. "112" or "034/198"
  "parallel": string,         // parallel/variant name if any (e.g. "Refractor", "Holo Rare"), else "Base"
  "title": string,            // an eBay-style listing title, 80 characters or fewer, covering set/player/number/parallel, and using the given condition ("${condition}") verbatim
  "description": string,      // a longer, detailed, persuasive listing description -- see the requirements below
  "category": string          // "Trading Cards - Sports" or "Trading Cards - TCG"
}

Requirements for "description" (this is the part buyers actually read, so put real effort into it -- don't just restate the title):
- 4-6 sentences, not 1-2. Thin, generic descriptions are the main thing to avoid here.
- Open by placing the card: player/character, set, year, and parallel/variant, written naturally rather than as a bare spec dump.
- State the given condition ("${condition}") and back it up with specific, credible detail grounded in what's actually visible in the two photos -- call out centering, corner sharpness, edge wear, surface/print quality, and any specific flaws or standout strengths you can see that are consistent with that grade, rather than a single generic adjective. Different cards should read like they got a genuinely different look, not a reused template.
- Clearly state it's raw/ungraded.
- Close with a sentence that makes the card appealing to a collector or buyer -- why this particular card/parallel/player is worth having -- without resorting to fake urgency, unverifiable claims ("rare", "investment grade", pop-report numbers) you can't actually see evidence for in the photos, or generic filler like "a must-have for any collection."
- Write in confident, natural prose a real seller would post, not a checklist or bullet list.

If you cannot identify the card at all, set "confident": false, explain why in "reason", and still give your best-effort guesses for the rest of the fields rather than leaving them blank (still use the given condition, "${condition}", in the title/description).`;
}

exports.identifyCard = onCall({ secrets: [ANTHROPIC_API_KEY], cors: true }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    throw new HttpsError("permission-denied", "This account isn't enabled for Card Intake.");
  }

  const { frontDataUrl, backDataUrl, condition } = request.data || {};
  if (!frontDataUrl || !backDataUrl || !condition) {
    throw new HttpsError("invalid-argument", "frontDataUrl, backDataUrl, and condition are all required.");
  }

  const frontImage = parseDataUrl(frontDataUrl);
  const backImage = parseDataUrl(backDataUrl);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1536, // descriptions are now longer (4-6 sentences) -- headroom so the JSON never gets cut off mid-response
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildCardPrompt(condition) },
              { type: "image", source: { type: "base64", media_type: frontImage.mediaType, data: frontImage.base64 } },
              { type: "image", source: { type: "base64", media_type: backImage.mediaType, data: backImage.base64 } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    logger.error("Anthropic API call failed", err);
    throw new HttpsError("unavailable", "Couldn't reach the AI service -- try again.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error("Anthropic API returned an error", response.status, text);
    throw new HttpsError("internal", "The AI service returned an error -- try again.");
  }

  const data = await response.json();
  const text = (data?.content || []).find((b) => b.type === "text")?.text || "";

  let parsed;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (err) {
    logger.error("Couldn't parse AI response as JSON", text);
    return blankResult("The AI's response couldn't be read automatically -- please enter this card's details manually.");
  }

  return {
    confident: !!parsed.confident,
    reason: parsed.reason || "",
    sport: parsed.sport || "",
    player: parsed.player || "",
    setName: parsed.setName || "",
    year: parsed.year || "",
    cardNumber: parsed.cardNumber || "",
    parallel: parsed.parallel || "",
    title: parsed.title || "",
    description: parsed.description || "",
    category: parsed.category || "Trading Cards",
  };
});

function blankResult(reason) {
  return {
    confident: false, reason,
    sport: "", player: "", setName: "", year: "", cardNumber: "", parallel: "",
    title: "", description: "", category: "",
  };
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new HttpsError("invalid-argument", "Expected a base64 image data URL.");
  return { mediaType: match[1], base64: match[2] };
}

// The model is asked to return ONLY JSON, but this strips ```json fences
// defensively in case it wraps the response in one anyway.
function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}
