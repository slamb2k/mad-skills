import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "./frontmatter.js";

const fm = (body) => parseFrontmatter(`---\n${body}\n---\n# Title\n`);

test("returns null without a frontmatter block", () => {
  assert.equal(parseFrontmatter("# no frontmatter"), null);
});

test("parses plain scalars", () => {
  assert.deepEqual(fm("name: brace\nallowed-tools: Bash, Read"), {
    name: "brace",
    "allowed-tools": "Bash, Read",
  });
});

test("strips single quotes and unescapes doubled quotes", () => {
  assert.equal(fm("description: 'It''s a scaffold: specs/'").description, "It's a scaffold: specs/");
});

test("strips double quotes and unescapes backslash escapes", () => {
  assert.equal(fm('argument-hint: "[--force] \\"x\\""')["argument-hint"], '[--force] "x"');
});

test("folds a >- block scalar into one line without the indicator", () => {
  const out = fm("name: dock\ndescription: >-\n  Generate container pipelines\n  that build once.\nargument-hint: \"--dry-run\"");
  assert.equal(out.description, "Generate container pipelines that build once.");
  assert.equal(out["argument-hint"], "--dry-run");
});

test("folded block keeps blank lines as newlines", () => {
  assert.equal(fm("description: >-\n  one\n  two\n\n  three").description, "one two\nthree");
});

test("literal block scalar keeps newlines and clips to one trailing newline", () => {
  assert.equal(fm("notes: |\n  line one\n  line two\n\nname: x").notes, "line one\nline two\n");
});

test("plain scalar folded across indented continuation lines", () => {
  assert.equal(fm("description: first half\n  second half").description, "first half second half");
});

test("quoted scalar folded across continuation lines is unquoted", () => {
  assert.equal(fm("description: \"first half\n  second half\"").description, "first half second half");
});

test("normalises CRLF line endings", () => {
  assert.equal(parseFrontmatter("---\r\nname: x\r\ndescription: >-\r\n  a\r\n  b\r\n---\r\n").description, "a b");
});
