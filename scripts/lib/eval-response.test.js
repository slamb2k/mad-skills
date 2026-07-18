import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAnthropicResponse, parseOpenRouterResponse } from "./eval-response.js";

test("parseAnthropicResponse joins text blocks and flags stop_reason=max_tokens as truncated", () => {
  const result = parseAnthropicResponse({
    content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }],
    stop_reason: "max_tokens",
  });
  assert.equal(result.text, "hello\nworld");
  assert.equal(result.truncated, true);
});

test("parseAnthropicResponse treats end_turn as not truncated", () => {
  const result = parseAnthropicResponse({
    content: [{ type: "text", text: "done" }],
    stop_reason: "end_turn",
  });
  assert.equal(result.truncated, false);
});

test("parseOpenRouterResponse extracts message content and flags finish_reason=length as truncated", () => {
  const result = parseOpenRouterResponse({
    choices: [{ message: { content: "hi" }, finish_reason: "length" }],
  });
  assert.equal(result.text, "hi");
  assert.equal(result.truncated, true);
});

test("parseOpenRouterResponse treats finish_reason=stop as not truncated", () => {
  const result = parseOpenRouterResponse({
    choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
  });
  assert.equal(result.truncated, false);
});

test("parseOpenRouterResponse tolerates a missing choices array", () => {
  const result = parseOpenRouterResponse({});
  assert.equal(result.text, "");
  assert.equal(result.truncated, false);
});
