// Central error types for every stage of the Tera pipeline, plus the diagnostic
// formatter shared by the CLI entry point (bin.ts) and the embeddable API (index.ts).
import type { SourceLocation } from "./TokenType.js";

export type ErrorStage = "Lexer" | "Parser" | "Type" | "Runtime";

// Bracket tags are part of the CLI output contract and are kept identical to the tags
// the compiler printed before v0.10, so existing tooling keeps matching on them.
const STAGE_TAGS: Record<ErrorStage, string> = {
  Lexer: "[Lexer Error]",
  Parser: "[Parser Error]",
  Type: "[Type Error]",
  Runtime: "[Runtime Error]",
};

// Exit codes used by the CLI.
export const EXIT_LANGUAGE_ERROR = 1; // the program or its source was invalid
export const EXIT_USAGE_ERROR = 2; // bad command line, or the file could not be read
export const EXIT_INTERNAL_ERROR = 70; // bug in the interpreter itself (EX_SOFTWARE)

// Every error the language itself reports (as opposed to a crash inside the
// interpreter) derives from this class, which carries the stage and, when known,
// the source position of the offending construct.
export class TeraError extends Error {
  public readonly stage: ErrorStage;
  public readonly detail: string;
  public readonly location: SourceLocation | undefined;

  constructor(stage: ErrorStage, detail: string, location?: SourceLocation) {
    super(`${STAGE_TAGS[stage]} ${detail}`);
    this.name = `${stage}Error`;
    this.stage = stage;
    this.detail = detail;
    this.location = location;
  }
}

// Raised by the lexer for characters it cannot make sense of.
export class LexerError extends TeraError {
  constructor(detail: string, location?: SourceLocation) {
    super("Lexer", detail, location);
  }
}

// Raised by the parser when the token stream does not match the grammar.
export class ParseError extends TeraError {
  constructor(detail: string, location?: SourceLocation) {
    super("Parser", detail, location);
  }
}

// Raised by the static type checker for programs that are well-formed but ill-typed.
export class TypeCheckError extends TeraError {
  constructor(detail: string, location?: SourceLocation) {
    super("Type", detail, location);
  }
}

// Raised by the interpreter for failures that only show up while running (for
// example an out-of-bounds `get`), never for anything the type checker can see.
export class RuntimeError extends TeraError {
  constructor(detail: string, location?: SourceLocation) {
    super("Runtime", detail, location);
  }
}

function renderSnippet(location: SourceLocation, fileName: string, source: string): string {
  const where = `  --> ${fileName}:${location.line}:${location.column}`;
  const text = source.split(/\r?\n/)[location.line - 1];
  if (text === undefined) return where;

  const gutter = String(location.line);
  const pad = " ".repeat(gutter.length);
  const caret = `${" ".repeat(Math.max(location.column - 1, 0))}^`;
  return `${where}\n${pad} |\n${gutter} | ${text}\n${pad} | ${caret}`;
}

// Renders a language error as `[Type Error] message` followed by the offending source
// line and a caret:
//
//   [Type Error] Undefined variable 'total'.
//     --> tests/cases/demo.tera:3:7
//      |
//    3 | print(total)
//      |       ^
//
// A crash that is not a TeraError is reported as an interpreter bug, where a stack
// trace is actually useful. When the source text is unavailable only the message is
// printed, so the function is safe to use from any entry point.
export function formatDiagnostic(error: unknown, fileName?: string, source?: string): string {
  if (!(error instanceof TeraError)) {
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    return [
      "[Internal Error] Unexpected failure inside the interpreter — please report this as a bug:",
      stack,
    ].join("\n");
  }

  if (!error.location || !source) return error.message;
  return `${error.message}\n${renderSnippet(error.location, fileName ?? "<source>", source)}`;
}

// The process exit code matching a caught error.
export function exitCodeFor(error: unknown): number {
  return error instanceof TeraError ? EXIT_LANGUAGE_ERROR : EXIT_INTERNAL_ERROR;
}
