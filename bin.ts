#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { EXIT_USAGE_ERROR, exitCodeFor, formatDiagnostic } from "./Errors.js";
import { runSource } from "./Runner.js";

const USAGE = [
  "Usage: tera <filename.tera>",
  "",
  "Runs a Tera source file: it is lexed, parsed, type checked and then interpreted.",
  "",
  "Options:",
  "  -h, --help    Show this message",
  "",
  "Exit codes: 0 success, 1 the program was invalid, 2 bad usage, 70 interpreter bug.",
].join("\n");

const args = process.argv.slice(2);
const filePath = args[0];

if (filePath === "-h" || filePath === "--help") {
  console.log(USAGE);
  process.exit(0);
}

if (!filePath) {
  // Usage problems go to stderr with their own exit code, so scripts can tell "I called
  // this wrong" apart from "the program I asked for had an error".
  console.error(USAGE);
  process.exit(EXIT_USAGE_ERROR);
}

const code = readProgram(filePath);

try {
  runSource(code);
} catch (err) {
  // Diagnostics are rendered against the path exactly as the user typed it, so the
  // output stays stable no matter how the interpreter was invoked.
  console.error(formatDiagnostic(err, filePath, code));
  process.exit(exitCodeFor(err));
}

function readProgram(file: string): string {
  const fullPath = path.resolve(file);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: File not found '${file}'`);
    process.exit(EXIT_USAGE_ERROR);
  }

  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Error: Cannot read '${file}' (${reason})`);
    process.exit(EXIT_USAGE_ERROR);
  }
}
