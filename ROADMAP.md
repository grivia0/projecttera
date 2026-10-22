# Tera release roadmap

The completeness audit found roughly forty gaps. They are grouped into **six releases**
(`1.1.0` … `1.6.0`) because six is the smallest number that keeps the dependency order intact
without ever documenting the same wiki page twice.

## Why six

Documentation cost is per *page touched*, not per release, and the wiki is maintained by hand.
Three rules decide where the lines fall:

1. **One breaking window.** Numeric semantics, the member names, the uninitialised-variable rule,
   the missing-`return` rule and the out-of-bounds rule all change observable behaviour. They ship
   together in `1.1.0`, before the wiki grows, so no page is rewritten twice and no reader ever
   learns `leng`.
2. **Dependency walls.** Conversions, literal formats and `math` are meaningless until `int`/`float`
   is real. Maps of structs need structs. Catchable I/O failures need `try`/`catch`. A namespaced
   standard library needs `import`.
3. **Reference pages are cheap, semantics pages are not.** Standard-library tables are written once
   and then appended to, so the whole library can ship in one large release. Pages that define
   behaviour have to be right the first time, so those features get small releases.

Four releases would force two passes over `int`/`float`, conversions and the library. Ten would mean
a version bump and release notes for one or two members, with no wiki benefit.

## Versioning

* `package.json` says `1.0.0`, but the repository has **no git tags** — that number was never
  released. Treat `1.1.0` as the first published release; a semantics change there breaks nothing
  public. (If `1.0.0` ever went out, the numeric change alone would make `1.1.0` a `2.0.0`.)
* **Patch** (`1.1.x`): bug fixes, new stdlib members that do not change existing behaviour. Wiki work
  is appending rows to a table.
* **Minor** (`1.x.0`): new syntax, types or modules — additive by default.
* **Breaking** changes are allowed only in `1.1.0`. After `1.5.0` they wait for `2.0.0`.
* Every release gets a git tag `vX.Y.Z` on `main`, a notes file, and a wiki pass.

## Summary

| Release | Theme | Language surface | Wiki delta | Effort |
| --- | --- | --- | --- | --- |
| `1.1.0` | Foundation | numeric model, definite assignment, return-on-all-paths, checked indexing, `input()` line reader, escapes, conversions, empty collections, compound assignment, `const`, literal formats, member renames | 5 rewritten, 1 new section | ~3 weeks |
| `1.2.0` | Structs | `struct`, construction, fields, equality, printing; `type` aliases; function types in annotations; forward references and mutual recursion | 2 new, 2 edited | ~2 weeks |
| `1.3.0` | Collections & absence | `map[K,V]`, optionals (`T?`, `none`, `??`, narrowing), `enum` with exhaustive `switch` | 3 new, 3 edited | ~2.5 weeks |
| `1.4.0` | Failure | `throw` / `try` / `catch` / `finally`, `defer`, catchable runtime errors, clean uncaught reports | 1 new, 2 edited | ~1.5 weeks |
| `1.5.0` | Programs | `import` and multi-file projects, project manifest, standard library (strings, arrays, math, io, json, time) | 1 new, 5–6 new reference pages | ~3.5 weeks |
| `1.6.0` | Tooling & depth | REPL, `tera fmt`, `tera test`, LSP, explicit-stack VM (deep recursion), spec, CI | 2 new | ongoing |

Suite size targets: 71 → ~90 → ~105 → ~120 → ~130 → ~150 (the library release adds table-driven
member tests rather than one program per member).

## 1.1.0 — Foundation

The release that makes the type checker honest. Everything here is observable behaviour, which is
why it goes first and alone.

**Ships**

* Numeric model: `int` and `float` become real and distinct — literal typing, `/`, `%`, `**`,
  comparison, printing; `1 / 0` and `0 / 0` become errors instead of `Infinity`/`NaN`; the overflow
  policy for `int` is written down (documented as IEEE-754 safe-integer range unless `BigInt` is
  chosen).
* Definite assignment: `let x: int` without an initialiser is a compile error.
* Return on all paths: a function annotated `=> int` that can fall through is a compile error.
* Checked indexing: `a[i]` out of bounds is a runtime error; `at`/`get` keep their documented
  escape hatches.
* `input()` reads exactly one line and reports end-of-input as an error (optionals arrive in `1.3.0`
  and turn it into `string?`).
* String escapes (`\n`, `\t`, `\"`, `\\`, `\u{...}`) and a raw-string form. The unused `BACKTICK`
  token is either wired to interpolation or deleted.
* Conversions: `string(x)`, `int(s)`, `float(s)`, `bool(s)`.
* Empty collections: `let a: [] => arr[int]` is accepted; `[]` adopts the annotation's element type.
* Compound assignment: `+=`, `-=`, `*=`, `/=`, `%=`.
* `const` declarations.
* Numeric literal formats: `1_000`, `0x10`, `0b1010`, `1e3`.
* Member renames, once and for all: `leng` → `length`, `rmv` → `remove`, `merge`/`copyIn` → one
  `concat`, `asString` → `toString`. `rm value[index]` keeps its syntax. The mutability contract is
  written down (which members mutate, which return new arrays).
* `break` inside `switch`: either supported or rejected at parse time — today it is consumed and
  silently ignored.

**Deliberately not in this release:** optionals (so absence stays an error until `1.3.0`), generics,
any new type form.

**Done when:** `7 / 2` matches the documented rule, `let x: int` is rejected, a fallen-through
`int` function is rejected, `a[99]` errors, two `input()` calls read two lines, `"\n"` is a newline,
`string(5)` works, `let a: [] => arr[int]; a.add(1)` works, `x += 1` works, `0x10`/`1_000`/`1e3`
work, and `length`/`remove`/`concat`/`toString` are the only spellings.

**Already landed on `main`, ahead of the release:** the `input()` line reader (`Stdin.ts`) — one
line per call, CRLF accepted, no length cap, spaces preserved, end-of-input a runtime error with
a caret at the call. Ten new cases (`input_lines`, `input_whitespace`, `input_typed_whitespace`,
`input_empty_line`, `input_no_newline`, `input_crlf`, `input_long_line`, `input_utf8`,
`input_utf8_boundary`, `err_input_eof`) pin it; the suite is `71 passed`.

**Wiki:** Variables, Types, Operators, Strings, Arrays (full rewrite of the examples), plus a new
Conversions section. One page for `input()` behaviour.

## 1.2.0 — Structs

The release that lets a program name its own data. Additive: nothing in `1.1.0` changes meaning.

**Ships**

* `struct` declarations, construction, field access and field assignment, field-wise equality,
  canonical printing (`print` must not dump JavaScript), nesting, and structs inside arrays.
* `type` aliases so signatures stop repeating `arr[map[string, arr[int]]]`-shaped types.
* Function types in annotations — `fn(int) -> bool` as a parameter, a struct field and an array
  element. This unblocks callbacks, strategy-shaped code and, later, host hooks.
* Forward references and mutual recursion: the checker stops being strictly single-pass, so
  `isEven`/`isOdd` and call-before-declaration work.
* Method-ish sugar is **not** included; struct behaviour is free functions taking the struct.

**Done when:** a `User` struct can be declared, built, stored in an array, printed readably, compared
with `==`, passed to a function by value/reference as documented, and a parameter can be declared as
`fn(User) -> bool`. Mutual recursion compiles.

**Wiki:** new Structs page, new Type aliases/function types section (or page), and edits to Types and
Functions.

## 1.3.0 — Collections and absence

**Ships**

* `map[K, V]` with a literal, index/lookup, assignment, iteration (`for k: m` or `for k, v: m`),
  `has`, `keys`, `values`, `remove`, `length`.
* Optionals: `T?` and `none`, `??` for defaults, narrowing under `if`, and `T?` in struct fields and
  parameters. `find`, `first`, `last`, `at` and map lookup return `T?` instead of lying with
  `undefined`; `input()` at end-of-input returns `string?`.
* `enum` with variants, and `switch` over enums checked for exhaustiveness (a missing variant is a
  type error).

**Deliberately not in this release:** pattern matching beyond enums, destructuring, generics.

**Done when:** a word-count style program reads `map[string, int]`, iterates it and prints results;
`arr[int].find(pred)` is a `int?` and the checker forces a `??` or a narrowing before use; a `switch`
over an `enum` with a missing case is rejected.

**Wiki:** new Maps, Optionals and Enums pages; edits to Arrays (the four members that changed type),
Types and Control Flow.

## 1.4.0 — Failure

**Ships**

* `throw <value>` and `try { } catch (e) { } finally { }`, with the caught value typed (a struct from
  `1.2.0`, or a built-in `Error` struct).
* `defer` for cleanup that must run on both paths.
* Every runtime error raised by the interpreter becomes catchable; an uncaught one still prints the
  caret diagnostic and exits `1`.
* A clean separation between *language* errors (catchable) and *internal* errors (exit `70`), which
  also removes the `RangeError` stack traces from ordinary user programs.

**Deliberately not in this release:** `Result[T, E]` (needs generics; revisit in `2.x`).

**Done when:** `try { throw ... } catch (e) { print(e) }` runs, `finally` runs on both paths, a failed
file read in `1.5.0` is catchable, and an uncaught throw exits `1` with the standard diagnostic.

**Wiki:** new Error handling page; edits to the Errors/diagnostics page and Control Flow.

## 1.5.0 — Programs

The release that turns Tera into a tool-building language. Two halves, one theme: *programs span
files and reuse a library*.

**Ships**

* `import` with relative paths, one module per file, explicit export rules (default: every top-level
  declaration is exported), cycle detection, and a project manifest (`tera.toml` or `tera.json`) that
  names the entry point.
* Standard library, namespaced by module: `strings` (`split`, `trim`, `replace`, `substring`,
  `contains`, `startsWith`, `endsWith`, `indexOf`, `toUpperCase`, `toLowerCase`, `format`), `arrays`
  (`map`, `filter`, `reduce`, `sort`, `sortBy`, `reverse`, `contains`, `indexOf`, `sum`, `min`,
  `max`), `math` (`abs`, `floor`, `ceil`, `round`, `sqrt`, `pow`, `min`, `max`, `random`), `io`
  (`readFile`, `writeFile`, `appendFile`, `stderr`, `args`, `env`, `exit`, `sleep`), `json`
  (`parse`, `stringify`), `time` (`now`, formatting).
* `main(args)` as an optional entry shape, so a script can take real command-line arguments.

**Split point.** If the reference tables for six modules feel too large for one wiki sitting, split
this into `1.5.0` (imports + `strings` + `arrays` + `math` + `io`) and `1.6.0` (the rest), pushing
tooling to `1.7.0`. Decide when you get there, not now.

**Done when:** a two-file program imports a helper and passes a value; `strings.split`/`arrays.sort`
work on real data; `io.readFile` failure is catchable; `json.parse` yields maps and arrays; a program
reads `io.args` and sets its own exit code.

**Wiki:** new Modules page and a reference page per module (or one Standard library page with
sections, if your sidebar prefers that), plus edits to Running Tera/CLI.

## 1.6.0 — Tooling and depth

No new language semantics; this release is about using the language. It is the release that should
not slip earlier: its audience is different and its wiki pages are separate.

**Ships**

* `tera` REPL (evaluate expressions against a live environment, `:vars`, `:reset`).
* Explicit call stack instead of the JS stack — recursion depth from ~1–2k frames to hundreds of
  thousands, and the `[Internal Error] RangeError` class disappears.
* `tera fmt` (canonical formatting) and `tera test` + an `assert`/`expect` built-in, so programs can
  be tested in Tera instead of golden files.
* LSP: diagnostics, hover types, completion, go-to-definition.
* A grammar (EBNF) and a semantics spec in the repo; CI running build + suite on push.

**Done when:** `tera` opens a REPL, `tera fmt` is idempotent on the whole test suite, `r(100000)`
runs, and a `.tera` file in an editor shows type errors without running it.

**Wiki:** new REPL/Tooling page and a Testing-your-programs page.

## Rules for every release

* **One theme per release.** A release that mixes language semantics with tooling doubles the wiki
  work and the review.
* **No page rewritten twice.** If a feature is planned in two halves, either merge the releases or
  move the second half into a later release that changes a *different* page.
* **Everything additive after `1.1.0`**, except in `1.1.0` itself.
* **The suite never shrinks.** New behaviour gets cases in `tests/cases/`; changed diagnostics get
  updated expectation files in the same commit.
* **Every release notes file contains a migration table** (`before` → `after`) even when it is empty,
  so `1.1.0` is not the only release with a paper trail.

## Wiki workflow

The wiki stays the single source of truth for the language; the repository holds the drafts.

1. At the start of a release, write `release-notes/vX.Y.Z/wiki/<Page>.md` — the **complete** new
   content of each affected wiki page, not a diff description.
2. `release-notes/vX.Y.Z/notes.md` lists, page by page, what changed and why, plus the migration
   table for readers.
3. You paste the drafts into the wiki and tick them off. Manual editing becomes copy-paste plus
   proofreading — minutes per page instead of an afternoon of writing.
4. `release-notes/WIKI-MAP.md` records every wiki page and the release that last changed it. If a
   page's row is older than the feature it documents, the wiki has drifted — that is the whole check.

The first job for this workflow is `1.1.0`: five pages are rewritten there (Variables, Types,
Operators, Strings, Arrays) plus a new Conversions section, and its migration table is the longest
the project will ever have.

## Release checklist

- [ ] `package.json` version bumped; `npm run build && npm test` green; record `N passed` in the notes
- [ ] README test counts and *Known limitations* reviewed: the counts must match the last line of
      `npm test`, and anything the release changed must move out of the limitations list
- [ ] `release-notes/vX.Y.Z/notes.md` written, with migration table
- [ ] `release-notes/vX.Y.Z/wiki/*.md` drafted for every affected page
- [ ] `release-notes/WIKI-MAP.md` updated
- [ ] new `tests/cases/` entries with `.out` / `.err` / `.exit`
- [ ] commit, tag `vX.Y.Z`, push
- [ ] paste wiki drafts, update the sidebar if a page was added

## Out of scope until 2.x

Generics and user-written containers, `Result[T, E]`, pattern matching beyond enums, traits /
interfaces / classes, async and concurrency, host injection (the Playwright blocker), a package
registry, and a bytecode VM beyond the explicit stack in `1.6.0`. Writing them down here is the point:
each one is a design project, not a gap to be closed in passing.

## Parked for a patch release (`1.x.y`)

Small, additive items that ride along with whichever release owns their area, at the cost of a
paragraph in an existing wiki page rather than a page of their own:

* `for` over strings, ranges with a step, descending ranges, exclusive ranges (`1.3.0` area).
* `do/while`, labeled `break`/`continue`, `if`/`switch` as expressions, ternary (`1.4.0` area).
* Unicode identifiers and code-point-correct `length` (today `"🙂".length` is `2`), `1.1.0` follow-up.
* `npm publish` packaging: a `files` list and a `prepublishOnly` build, so `npm i -g projecttera`
  installs something real (`1.1.0` housekeeping).
* Diagnostic polish: stable error codes, "did you mean" for unknown members, better `--help` text
  as flags are added (`continuous`).

## Where the plan can flex

* **`1.5.0` may split** into modules and library (`1.5.0` / `1.6.0`, tooling to `1.7.0`). The wiki is
  the only reason to care, and by then it will be obvious.
* **REPL early.** If it helps you develop the rest, ship it as `1.2.1` — it adds no language surface
  and needs one wiki page.
* **Enum before maps** inside `1.3.0`, or as its own pair, if optionals turn out heavier than
  expected. Optionals are the risky item in this plan: they touch the checker's type comparison,
  every built-in member table, and narrowing.


