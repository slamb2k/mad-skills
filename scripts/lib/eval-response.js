/**
 * Pure response-shape parsers for the two eval backends, split out from the
 * fetch calls so truncation detection (stop_reason/finish_reason) is
 * unit-testable without mocking network I/O.
 */

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
