/**
 * The prompt behind "Use a sample prompt".
 *
 * It lives here rather than in the client component because the button submits a **flag**, not the
 * text. A second submit button carrying `name="prompt"` looked tidier and was wrong: the form
 * already has a `<textarea name="prompt">`, so `formData.get("prompt")` returns the textarea's
 * (empty) value and the sample never arrives. Found by clicking the button.
 *
 * Deliberately a prompt with something in it to find — a JSON rule with no check, a closed set of
 * categories, a vague length rule, politeness padding — because a sample that produces an empty
 * findings panel teaches the reader that the panel is decorative.
 */
export const SAMPLE_PROMPT = [
  "You are a support assistant for a small B2B company.",
  "",
  "Rules:",
  "1. Always classify the email into one of these categories: billing, technical, other.",
  "2. Always respond in JSON only.",
  "3. Keep the summary reasonably short.",
  "4. Never mention that you are an AI model.",
  "",
  "The JSON should have these fields: category, summary, needs_human.",
  "",
  "Please make sure the output is valid JSON. Thank you!",
  ""
].join("\n");
