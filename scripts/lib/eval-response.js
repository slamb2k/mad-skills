/**
 * Pure request/response-shape helpers for the two eval backends, split out
 * from the fetch calls so they are unit-testable without mocking network I/O.
 */

/** Messages endpoint for an Anthropic-compatible base URL (base or full URL). */
export function anthropicMessagesUrl(baseUrl) {
  const base = (baseUrl || "https://api.anthropic.com").replace(/\/+$/, "").replace(/\/v1\/messages$/, "");
  return `${base}/v1/messages`;
}

export function parseAnthropicResponse(data) {
  return {
    text: (data.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("\n"),
    truncated: data.stop_reason === "max_tokens",
  };
}

export function parseOpenRouterResponse(data) {
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    truncated: data.choices?.[0]?.finish_reason === "length",
  };
}

/**
 * An eval output with no text can't be graded; report why instead of letting
 * every assertion fail against an empty string. Returns a message or null.
 */
export function emptyOutputError(text, truncated) {
  if (text.trim()) return null;
  return truncated
    ? "No text output: max_tokens was exhausted before any answer (likely by extended thinking)"
    : "Model returned an empty text output";
}

/**
 * Extract the semantic judge's {pass, reasoning} verdict from free text,
 * whatever it is wrapped in (code fences, a stray language tag, prose).
 * Returns null when no boolean verdict can be found.
 */
export function parseJudgement(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (typeof parsed.pass === "boolean") return { pass: parsed.pass, reasoning: parsed.reasoning ?? "" };
    } catch {
      // fall through to the field-level match (e.g. reasoning cut off mid-string)
    }
  }
  const pass = text.match(/"pass"\s*:\s*(true|false)/);
  if (!pass) return null;
  const reasoning = text.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)/);
  return { pass: pass[1] === "true", reasoning: reasoning ? reasoning[1] : "" };
}
