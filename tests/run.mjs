#!/usr/bin/env node
// Tera test runner.
//
// Every `tests/cases/<name>.tera` program is run through the built CLI from the
// repository root, and its stdout, stderr and exit code are compared against the
// expectation files stored next to it:
//
//   tests/cases/<name>.tera   the program under test
//   tests/cases/<name>.in     stdin fed to it (optional, defaults to end-of-file)
//   tests/cases/<name>.out    expected stdout (optional, defaults to empty)
//   tests/cases/<name>.err    expected stderr (optional, defaults to empty)
//   tests/cases/<name>.exit   expected exit code (optional, defaults to 0)
//
// Expectations are matched exactly (trailing newlines ignored), so diagnostics that
// gain a source snippet on purpose have to be updated deliberately.
//
// Usage: node tests/run.mjs [name-filter]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const casesDir = path.join(here, "cases");
const cli = path.join(root, "dist", "bin.js");
const TIMEOUT_MS = 10_000;

if (!fs.existsSync(cli)) {
  console.error(`Build output missing: ${path.relative(root, cli)} (run \`npm run build\` first)`);
  process.exit(1);
}

// Checks that are about the CLI itself rather than about a single program.
const cliChecks = [
  { name: "cli/no-arguments", args: [], exit: 2, stderrIncludes: "Usage: tera <filename.tera>" },
  { name: "cli/help-flag", args: ["--help"], exit: 0, stdoutIncludes: "Usage: tera <filename.tera>" },
  { name: "cli/missing-file", args: ["no-such-file.tera"], exit: 2, stderrIncludes: "Error: File not found" },
  { name: "cli/index-js-example", script: "dist/index.js", exit: 0, stdoutIncludes: "Doubled total: 20" },
];

const filter = process.argv[2];
const names = fs
  .readdirSync(casesDir)
  .filter((file) => file.endsWith(".tera"))
  .map((file) => file.slice(0, -".tera".length))
  .filter((name) => !filter || name.includes(filter))
  .sort();

const passed = [];
const failed = [];

function normalise(text) {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

function readExpectation(name, extension) {
  const file = path.join(casesDir, `${name}${extension}`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

// Reports the first line that differs, which is usually enough to see what broke.
function firstDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  for (let i = 0; i < Math.max(expectedLines.length, actualLines.length); i++) {
    if (expectedLines[i] !== actualLines[i]) {
      return [
        `    first difference on line ${i + 1}:`,
        `      expected: ${JSON.stringify(expectedLines[i] ?? "<nothing>")}`,
        `      actual:   ${JSON.stringify(actualLines[i] ?? "<nothing>")}`,
      ].join("\n");
    }
  }
  return "    (contents are equal, check the exit code)";
}

function spawnTera(args, script = "dist/bin.js", stdin = "") {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    // stdin is a pipe rather than /dev/null so a case can drive `input()` from its `<name>.in`
    // file; when there is no such file the pipe is empty and reads as end-of-file, which is
    // exactly what an ignored stdin used to look like.
    input: stdin,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runCase(name) {
  // The program is passed as a repository-relative path so diagnostics in the
  // expectation files stay identical on every machine.
  const relativePath = path.join("tests", "cases", `${name}.tera`);
  const result = spawnTera([relativePath], "dist/bin.js", readExpectation(name, ".in") ?? "");

  if (result.signal) {
    return [`    killed after ${TIMEOUT_MS}ms (${result.signal}) — does the program terminate?`];
  }

  const expected = {
    out: normalise(readExpectation(name, ".out") ?? ""),
    err: normalise(readExpectation(name, ".err") ?? ""),
    exit: Number(readExpectation(name, ".exit") ?? "0"),
  };
  const actual = {
    out: normalise(result.stdout ?? ""),
    err: normalise(result.stderr ?? ""),
    exit: result.status ?? -1,
  };

  const problems = [];
  if (actual.exit !== expected.exit) {
    problems.push(`    exit code: expected ${expected.exit}, got ${actual.exit}`);
  }
  if (actual.out !== expected.out) {
    problems.push(`    stdout ${firstDifference(expected.out, actual.out)}`);
  }
  if (actual.err !== expected.err) {
    problems.push(`    stderr ${firstDifference(expected.err, actual.err)}`);
  }
  return problems;
}

function runCliCheck(check) {
  const result = spawnTera(check.args ?? [], check.script ?? "dist/bin.js");

  if (result.signal) return [`    killed after ${TIMEOUT_MS}ms (${result.signal})`];

  const problems = [];
  const actualExit = result.status ?? -1;
  if (actualExit !== check.exit) {
    problems.push(`    exit code: expected ${check.exit}, got ${actualExit}`);
  }
  if (check.stdoutIncludes && !(result.stdout ?? "").includes(check.stdoutIncludes)) {
    problems.push(`    stdout does not contain ${JSON.stringify(check.stdoutIncludes)}`);
  }
  if (check.stderrIncludes && !(result.stderr ?? "").includes(check.stderrIncludes)) {
    problems.push(`    stderr does not contain ${JSON.stringify(check.stderrIncludes)}`);
  }
  return problems;
}

console.log(`Tera test suite — ${names.length} programs, ${cliChecks.length} CLI checks\n`);

for (const name of names) {
  const problems = runCase(name);
  if (problems.length === 0) {
    passed.push(name);
    console.log(`  ok   ${name}`);
  } else {
    failed.push(name);
    console.log(`  FAIL ${name}`);
    for (const problem of problems) console.log(problem);
  }
}

for (const check of cliChecks) {
  const problems = runCliCheck(check);
  if (problems.length === 0) {
    passed.push(check.name);
    console.log(`  ok   ${check.name}`);
  } else {
    failed.push(check.name);
    console.log(`  FAIL ${check.name}`);
    for (const problem of problems) console.log(problem);
  }
}

console.log(`\n${passed.length} passed, ${failed.length} failed, ${passed.length + failed.length} total`);
process.exit(failed.length === 0 ? 0 : 1);
