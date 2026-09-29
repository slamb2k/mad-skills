import { test } from "node:test";
import assert from "node:assert/strict";

import { anthropicMessagesUrl, emptyOutputError, parseAnthropicResponse, parseOpenRouterResponse, parseJudgement } from "./eval-response.js";

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

test("parseJudgement reads a bare JSON verdict", () => {
  assert.deepEqual(parseJudgement('{"pass": true, "reasoning": "ok"}'), { pass: true, reasoning: "ok" });
});

test("parseJudgement tolerates code fences and a stray language tag", () => {
  assert.deepEqual(parseJudgement('```json\n{"pass": false, "reasoning": "no"}\n```'), { pass: false, reasoning: "no" });
  assert.deepEqual(parseJudgement('json\n{"pass": true, "reasoning": "ok"}'), { pass: true, reasoning: "ok" });
});

test("parseJudgement recovers the verdict when the reasoning is cut off", () => {
  assert.deepEqual(parseJudgement('{"pass": true, "reasoning": "The output states that no worktree'), {
    pass: true,
    reasoning: "The output states that no worktree",
  });
});

test("parseJudgement returns null when there is no boolean verdict", () => {
  assert.equal(parseJudgement("I think it passes."), null);
  assert.equal(parseJudgement('{"pass": "yes"}'), null);
});

test("anthropicMessagesUrl defaults to the Anthropic API", () => {
  assert.equal(anthropicMessagesUrl(undefined), "https://api.anthropic.com/v1/messages");
});

test("anthropicMessagesUrl accepts a base URL or a full messages URL", () => {
  assert.equal(anthropicMessagesUrl("https://r.services.ai.azure.com/anthropic/"), "https://r.services.ai.azure.com/anthropic/v1/messages");
  assert.equal(anthropicMessagesUrl("https://r.services.ai.azure.com/anthropic/v1/messages"), "https://r.services.ai.azure.com/anthropic/v1/messages");
});

test("emptyOutputError is null when there is text", () => {
  assert.equal(emptyOutputError("answer", true), null);
});

test("emptyOutputError explains a thinking-exhausted budget vs a plain empty reply", () => {
  assert.match(emptyOutputError("  \n", true), /max_tokens was exhausted/);
  assert.match(emptyOutputError("", false), /empty text output/);
});

test("parseAnthropicResponse ignores thinking blocks", () => {
  const r = parseAnthropicResponse({ content: [{ type: "thinking", thinking: "…" }], stop_reason: "max_tokens" });
  assert.equal(r.text, "");
  assert.equal(emptyOutputError(r.text, r.truncated) !== null, true);
});
