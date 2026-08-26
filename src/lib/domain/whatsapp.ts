/**
 * wa.me needs a full international number (country code, no leading trunk
 * "0", no spaces/dashes/plus) — but registration CSVs store whatever a
 * person typed, almost always in local format ("0788123456"), never
 * normalized. Passing that straight through is exactly why the link
 * failed: WhatsApp can't resolve a real contact from a bare local number,
 * so it dead-ends on a blank screen instead of a clear "invalid" message.
 *
 * The one extra piece of information we do have is the student's own
 * (normalized) country, so for the known set of countries this ministry's
 * registrants come from (see KNOWN_COUNTRIES in registrations.ts), a
 * bare local number gets its trunk "0" stripped and the country's dial
 * code prepended. Anything already international (+ or 00 prefix) or from
 * an unrecognized country is left as digits-only, best effort.
 */
const COUNTRY_DIAL_CODES: Record<string, string> = {
  Belgium: "32",
  Ghana: "233",
  Morocco: "212",
  Burundi: "257",
  Rwanda: "250",
  Kenya: "254",
  Spain: "34",
  Canada: "1",
  Germany: "49",
  Mozambique: "258",
  USA: "1",
  Zambia: "260",
  Luxembourg: "352",
  France: "33",
  Finland: "358",
};

/** Digits-only E.164-ish number, or null if there's nothing usable. */
export function normalizeWhatsapp(raw: string, country: string | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (!hadPlus) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else {
      const dialCode = country ? COUNTRY_DIAL_CODES[country] : undefined;
      if (dialCode && !digits.startsWith(dialCode)) {
        digits = dialCode + (digits.startsWith("0") ? digits.slice(1) : digits);
      }
    }
  }

  return digits.length >= 8 ? digits : null;
}

/** null when there's no usable number — callers should hide the link
 * entirely rather than pointing it at a dead-end. `message`, when given,
 * pre-fills the chat via wa.me's `text` param — still editable by whoever
 * sends it before it actually goes. */
export function whatsappHref(raw: string, country: string | null, message?: string): string | null {
  const digits = normalizeWhatsapp(raw, country);
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/**
 * The standard first-contact outreach for a student who's fallen below
 * the attendance band and hasn't been reached yet — names what they've
 * missed rather than a vague "we noticed", and puts the real decision
 * (catch up, or be released) directly to them instead of assuming it.
 */
export function catchupOutreachMessage(
  fullName: string,
  missedLessons: { lessonRef: string; lessonTitle: string }[]
): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  const MAX_LISTED = 12;
  const listed = missedLessons.slice(0, MAX_LISTED);
  const lines = listed.map((l) => `• ${l.lessonRef} — ${l.lessonTitle}`).join("\n");
  const overflow = missedLessons.length - listed.length;
  const list = overflow > 0 ? `${lines}\n…and ${overflow} more` : lines;

  return `Shalom Beloved ${firstName},

We've missed you in class and wanted to check in — is everything okay?

So far you've missed:
${list}

We'd love to have you continue with us. Would you like to catch up on what you've missed, or would you prefer we release you from the cohort for now?

Please let us know either way — God bless you!`;
}
