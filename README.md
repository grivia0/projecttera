# ProjectTera

ProjectTera is a small, statically typed, interpreted programming language implemented from
scratch in **TypeScript**. Source text goes through a hand-written pipeline — lexer → parser →
static type checker → tree-walking interpreter — and the whole toolchain, from the CLI to the
error renderer, lives in this repository: no parser generator, no runtime dependencies.

**Language documentation lives in the [wiki](https://github.com/grivia0/projecttera/wiki)**
(variables, syntax rules, arithmetic, arrays, control flow, functions, properties). This README
covers the toolchain: how to build it, run it, embed it and test it. Planned releases — and the
wiki work each one needs — are tracked in [`ROADMAP.md`](ROADMAP.md).

**Contents**

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Running a program](#running-a-program)
- [Embedding the pipeline](#embedding-the-pipeline)
- [Project structure](#project-structure)
- [Diagnostics and exit codes](#diagnostics-and-exit-codes)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)

## Quick start

```bash
git clone https://github.com/grivia0/projecttera.git
cd projecttera
npm install
npm run build
node dist/bin.js tests/cases/hello.tera
```

```text
hello, tera
7
ab
flag is true
```

`npm test` builds the project and then runs the whole suite: 89 programs plus 4 CLI checks.

## Requirements

* [Node.js](https://nodejs.org/) 18 or newer — built and tested on v26.11.1. The only runtime
  imports are `node:fs`, `node:path`, `node:child_process` and `node:url`.
* npm, for the build script and the two dev dependencies (`typescript`, `@types/node`).

## Running a program

```bash
npm run build                        # tsc → dist/
node dist/bin.js tests/cases/hello.tera
node dist/bin.js --help              # usage and exit codes
```

`npm start` is a shorthand for `node dist/bin.js`, and because the package declares a `tera`
binary, `npm link` makes the interpreter a normal command:

```bash
npm start -- tests/cases/hello.tera
npm link
tera tests/cases/hello.tera
```

`index.ts` is a self-contained example of driving the same pipeline from another program:

```bash
node dist/index.js
```

```text
Array length is: 4
Last item is: 4
Doubled total: 20
4 is small
16 is big
```

## Embedding the pipeline

| Module | Use it for |
| --- | --- |
| `Runner.ts` | `runSource(source: string): void` — lex, parse, type check and interpret a whole program |
| `Errors.ts` | `formatDiagnostic(error, filename?, source?)`, `exitCodeFor(error)`, the `TeraError` hierarchy, the `EXIT_*` constants |
| `Lexer.ts` / `Parser.ts` / `TypeChecker.ts` / `Interpreter.ts` | the individual stages, when you want tokens or an AST instead of an execution |

`runSource` never prints anything: failures are thrown as `TeraError`s, and the caller decides
how to present them. `index.ts` is the reference pattern:

```ts
import { exitCodeFor, formatDiagnostic } from "./Errors.js";
import { runSource } from "./Runner.js";

const filename = "<demo>";
const source = `let nums: [1, 2] => arr[int]
print(total)`;

try {
  runSource(source);
} catch (err) {
  console.error(formatDiagnostic(err, filename, source));
  process.exit(exitCodeFor(err));
}
```

Passing the source text and a name keeps the snippet working for embedded programs — the same
rendering the CLI produces, pointing into the string instead of into a file:

```text
[Type Error] Undefined variable 'total'.
  --> <demo>:2:7
  |
2 | print(total)
  |       ^
```

Two things to know before importing: the codebase is ESM (`"type": "module"`,
`module: nodenext`), so relative imports carry the compiled `.js` extension even from TypeScript;
and `main` points at `index.ts`'s output, which *runs* the demo when it is imported — import
`dist/Runner.js` and `dist/Errors.js` directly, as above.

## Project structure

| File | Role |
| --- | --- |
| `TokenType.ts` | token kinds and `SourceLocation` (`line`, `column`) |
| `Lexer.ts` | source text → tokens, tracking line and column and rejecting illegal characters and unterminated strings |
| `AST.ts` | AST node types, the expression and statement unions |
| `Parser.ts` | tokens → AST; every node records the position it came from |
| `TypeChecker.ts` | static analysis: scopes, signatures, and the built-in member tables for `arr[T]` and `string` |
| `Interpreter.ts` | tree-walking evaluator with lexical environments |
| `Errors.ts` | the error hierarchy, the diagnostic formatter and the exit-code constants |
| `Runner.ts` | the whole pipeline (lex → parse → check → interpret) behind one call |
| `bin.ts` | the `tera` command line entry point |
| `index.ts` | example of driving the pipeline from another program |
| `tests/` | the suite and its own README |

## Diagnostics and exit codes

All four stages fail the same way: a tagged message, then `--> file:line:column`, then the
offending source line with a caret under the reported column.

```text
[Type Error] Type 'arr[int]' has no member 'length'. Available members: leng, isEmpty, first, last, asString, at, get, rmv, shift, rmShift, add, join, find, findIndex, merge, copyIn, flat, slice, splice.
  --> tests/cases/err_unknown_member.tera:2:12
  |
2 | print(nums.length)
  |            ^
```

The tags are `[Lexer Error]`, `[Parser Error]`, `[Type Error]` and `[Runtime Error]`. A failure
that is *not* a language error is reported as `[Internal Error]` together with a stack trace,
because that means the interpreter itself is broken.

| Exit code | Meaning |
| --- | --- |
| `0` | the program ran to completion |
| `1` | the source was invalid (lexing, parsing, type checking) or the program failed at run time |
| `2` | bad usage: wrong arguments, or a missing/unreadable file |
| `70` | internal error — a bug in the interpreter |

## Testing

```bash
npm test                        # build, then the whole suite
node tests/run.mjs              # suite only (dist/ must already be built)
node tests/run.mjs arrays       # only the cases whose name contains "arrays"
```

The suite runs every program in `tests/cases/` through the built CLI and compares stdout, stderr
and the exit code byte for byte against the expectation files stored next to it (`.out`, `.err`,
`.exit`). Four further checks cover the CLI itself — `--help`, no arguments, a missing file, and
the `index.ts` example — so `npm test` ends with `93 passed, 0 failed, 93 total`. 56 of the 89
programs are deliberate failures, which is what keeps the diagnostics pinned down as tightly as
the behaviour. `tests/README.md` explains the layout and how to add a case.

## Known limitations

* `input()` stops the program when the input runs out. There is no way yet to ask for a line that
  may be absent — that arrives with optionals in `1.3.0`.
* Numeric literals always type as `int`; the `float` annotation cannot be satisfied yet, and
  `float(x)` is rejected for the same reason: there are no float values to convert.
* `a[i]` is bounds-checked: an out-of-range read, write or `rm` stops the program with a caret at
  the index. `at`, `first` and `last` follow JavaScript instead — `at(-1)` counts from the end and
  an out-of-bounds `at` yields `undefined`.
* There is no unit/void return type — `=> T` is mandatory — so a helper that only prints has to
  return a value too. The return check below is what makes that explicit rather than a silent
  `undefined`.
* Return-on-all-paths is conservative. A function annotated `=> T` must end in a `return`, or in an
  `if`/`else` or `switch` with a `default` where every branch returns, or in a `while (true)` /
  `for (;;)` that never breaks. A `return` inside a loop whose condition can be false does not
  count, so a `return` after the loop is still required.
* A C-style `for` loop without an update clause never terminates if its body uses `continue` —
  the same as C.
* Members of the built-in types are read-only: `nums.leng = 4` is a type error.
* Grouping parentheses work; compound assignment operators (`+=`, `-=`, …) do not exist yet.
* `rmShift()` is an alias of `shift()`: both remove and return the first element.
* The language is still moving. The wiki is the reference, and it can lag behind `dist/`.

## Documentation

* [The wiki](https://github.com/grivia0/projecttera/wiki) — the language reference: variables,
  syntax rules, arithmetic operators, arrays, control flow, functions and properties.
* `tests/README.md` — the test harness, case layout, and how to add a case. The `.tera` files
  there double as small runnable examples of each feature.
* `ROADMAP.md` — the release plan (`1.1` → `1.6`), what each release ships, and which wiki pages
  each release rewrites or adds.
* `index.ts` — the smallest complete example of embedding the interpreter.