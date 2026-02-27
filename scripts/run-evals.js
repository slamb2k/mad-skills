#!/usr/bin/env node

/**
 * Skill Eval Runner
 *
 * Runs test prompts through Claude with skill context and validates outputs
 * against assertion criteria. Uses the Anthropic API directly.
 *
 * Each skill can have a tests/evals.json with test cases:
 * [
 *   {
 *     "name": "basic-usage",
 *     "prompt": "Create a basic React component",
 *     "assertions": [
 *       { "type": "contains", "value": "export default" },
 *       { "type": "not_contains", "value": "class Component" },
 *       { "type": "semantic", "value": "uses functional component pattern with hooks" }
 *     ],
 *     "timeout_ms": 30000
 *   }
 * ]
 *
 * Assertion types:
 * - contains: output contains substring
 * - not_contains: output does NOT contain substring
 * - regex: output matches regex pattern
 * - semantic: uses Claude to judge if output matches description (slower, costs tokens)
 * - file_created: checks if output references creating a file matching pattern
 *
 * Usage:
 *   node scripts/run-evals.js                      # Run all evals
 *   node scripts/run-evals.js --skill my-skill     # Run evals for one skill
 *   node scripts/run-evals.js --update-snapshots   # Update snapshot files
 *   node scripts/run-evals.js --concurrency 3      # Parallel test runs
 */

import { readdir, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");
const RESULTS_DIR = resolve(__dirname, "..", "tests", "results");

const { values: args } = parseArgs({
  options: {
    skill: { type: "string", default: "" },
    "update-snapshots": { type: "boolean", default: false },
    concurrency: { type: "string", default: "2" },
    model: { type: "string", default: "claude-sonnet-4-20250514" },
    verbose: { type: "boolean", short: "v", default: false },
  },
  strict: true,
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY environment variable required for eval runs"
  );
  console.error(
    "Set it in your environment or .env file, or in GitHub Actions secrets"
  );
  process.exit(1);
}

async function callClaude(systemPrompt, userMessage, model = args.model) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

async function checkAssertion(assertion, output) {
  switch (assertion.type) {
    case "contains":
      return {
        pass: output.includes(assertion.value),
        detail: assertion.pass
          ? `Contains "${assertion.value}"`
          : `Missing "${assertion.value}"`,
      };

    case "not_contains":
      return {
        pass: !output.includes(assertion.value),
        detail: output.includes(assertion.value)
          ? `Unexpectedly contains "${assertion.value}"`
          : `Correctly excludes "${assertion.value}"`,
      };

    case "regex": {
      const re = new RegExp(assertion.value, assertion.flags ?? "");
      const match = re.test(output);
      return {
        pass: match,
        detail: match
          ? `Matches /${assertion.value}/`
          : `No match for /${assertion.value}/`,
      };
    }

    case "semantic": {
      // Use Claude as a judge
      const judgePrompt = `You are evaluating whether an AI assistant's output meets a quality criterion.

Criterion: ${assertion.value}

Output to evaluate:
<output>
${output.slice(0, 3000)}
</output>

Respond with ONLY a JSON object: {"pass": true/false, "reasoning": "brief explanation"}`;

      try {
        const judgement = await callClaude(
          "You are a precise evaluator. Respond only with valid JSON.",
          judgePrompt,
          "claude-sonnet-4-20250514" // Always use Sonnet for judging (cost efficiency)
        );
        const parsed = JSON.parse(
          judgement.replace(/```json\n?|\n?```/g, "").trim()
        );
        return {
          pass: parsed.pass,
          detail: parsed.reasoning,
        };
      } catch (err) {
        return {
          pass: false,
          detail: `Semantic eval failed: ${err.message}`,
        };
      }
    }

    case "file_created": {
      const re = new RegExp(assertion.value);
      return {
        pass: re.test(output),
        detail: re.test(output)
          ? `File reference found matching ${assertion.value}`
          : `No file reference matching ${assertion.value}`,
      };
    }

    default:
      return {
        pass: false,
        detail: `Unknown assertion type: ${assertion.type}`,
      };
  }
}

async function runEvalCase(skillName, skillContent, evalCase) {
  const systemPrompt = `You are Claude, using the following skill to help the user.

<skill>
${skillContent}
</skill>

Follow the skill's instructions to complete the user's request. Be thorough and follow all specified patterns.`;

  const startTime = Date.now();

  try {
    const output = await callClaude(systemPrompt, evalCase.prompt);
    const duration = Date.now() - startTime;

    const assertionResults = [];
    for (const assertion of evalCase.assertions ?? []) {
      assertionResults.push({
        ...assertion,
        ...(await checkAssertion(assertion, output)),
      });
    }

    const allPassed = assertionResults.every((r) => r.pass);

    return {
      name: evalCase.name,
      skill: skillName,
      status: allPassed ? "pass" : "fail",
      duration_ms: duration,
      assertions: assertionResults,
      output_preview: output.slice(0, 500),
      full_output: output,
    };
  } catch (err) {
    return {
      name: evalCase.name,
      skill: skillName,
      status: "error",
      duration_ms: Date.now() - startTime,
      error: err.message,
      assertions: [],
    };
  }
}

async function runSkillEvals(skillName) {
  const skillDir = join(SKILLS_DIR, skillName);
  const evalsPath = join(skillDir, "tests", "evals.json");

  try {
    await access(evalsPath);
  } catch {
    if (args.verbose) console.log(`  ⏭  ${skillName}: no tests/evals.json`);
    return null;
  }

  const evalCases = JSON.parse(await readFile(evalsPath, "utf-8"));
  const skillContent = await readFile(join(skillDir, "SKILL.md"), "utf-8");

  console.log(
    `\n📋 ${skillName}: running ${evalCases.length} eval(s)...\n`
  );

  const concurrency = parseInt(args.concurrency);
  const results = [];

  // Run with controlled concurrency
  for (let i = 0; i < evalCases.length; i += concurrency) {
    const batch = evalCases.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((ec) => runEvalCase(skillName, skillContent, ec))
    );
    results.push(...batchResults);

    // Print progress
    for (const result of batchResults) {
      const icon =
        result.status === "pass"
          ? "✅"
          : result.status === "fail"
            ? "❌"
            : "💥";
      console.log(
        `  ${icon} ${result.name} (${result.duration_ms}ms)`
      );

      if (result.status === "fail" || args.verbose) {
        for (const a of result.assertions) {
          const aIcon = a.pass ? "  ✓" : "  ✗";
          console.log(`    ${aIcon} [${a.type}] ${a.detail}`);
        }
      }

      if (result.status === "error") {
        console.log(`    Error: ${result.error}`);
      }
    }
  }

  return { skill: skillName, results };
}

async function main() {
  console.log("🧪 Running skill evals...");

  await mkdir(RESULTS_DIR, { recursive: true });

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  let skillDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);

  if (args.skill) {
    skillDirs = skillDirs.filter((s) => s === args.skill);
    if (skillDirs.length === 0) {
      console.error(`Skill not found: ${args.skill}`);
      process.exit(1);
    }
  }

  const allResults = [];
  let totalPass = 0;
  let totalFail = 0;
  let totalError = 0;

  for (const skillName of skillDirs) {
    const result = await runSkillEvals(skillName);
    if (!result) continue;

    allResults.push(result);
    for (const r of result.results) {
      if (r.status === "pass") totalPass++;
      else if (r.status === "fail") totalFail++;
      else totalError++;
    }
  }

  // Write results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsFile = join(RESULTS_DIR, `eval-${timestamp}.json`);
  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: args.model,
        summary: { pass: totalPass, fail: totalFail, error: totalError },
        skills: allResults.map((s) => ({
          ...s,
          results: s.results.map(({ full_output, ...rest }) => rest), // Strip full output from summary
        })),
      },
      null,
      2
    )
  );

  // Write latest results pointer
  await writeFile(
    join(RESULTS_DIR, "latest.json"),
    JSON.stringify({ file: resultsFile }, null, 2)
  );

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${totalPass} pass, ${totalFail} fail, ${totalError} error`);
  console.log(`Written to: ${resultsFile}`);

  if (totalFail > 0 || totalError > 0) {
    console.error("\n💥 Evals failed\n");
    process.exit(1);
  }

  console.log("\n✅ All evals passed\n");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
