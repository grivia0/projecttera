# Tera test suite

`npm test` builds the interpreter and then runs every program in `cases/` through the
built CLI, comparing stdout, stderr and the exit code against the expectation files
stored next to the program.

## Case layout

| File                | Meaning                                             |
| ------------------- | --------------------------------------------------- |
| `cases/<name>.tera` | the program under test (required)                   |
| `cases/<name>.out`  | expected stdout (optional, defaults to empty)       |
| `cases/<name>.err`  | expected stderr (optional, defaults to empty)       |
| `cases/<name>.exit` | expected exit code (optional, defaults to `0`)      |

Comparison is exact apart from trailing newlines, so a diagnostic that changes on purpose
has to be updated deliberately. `run.mjs` additionally performs a few checks that are
about the CLI itself rather than about one program: `--help`, no arguments, a missing
file, and the `index.ts` example.

## Running

```bash
npm test                   # build, then the whole suite
node tests/run.mjs         # suite only (dist/ must be built already)
node tests/run.mjs arrays  # only cases whose name contains "arrays"
```

## Adding a case

1. Write `cases/my_case.tera`.
2. Run `node dist/bin.js tests/cases/my_case.tera` and check that the output really is
   what the language should do.
3. Save it as `cases/my_case.out` (stdout), `cases/my_case.err` (stderr) and
   `cases/my_case.exit` (only when the exit code is not `0`).

Programs are run from the repository root and are addressed by their repository-relative
path, which is why the paths inside expectation files stay portable between machines.

## Quirks covered by the suite

`cases/quirks.tera` pins down behaviour that is surprising but currently intended:

- the iterable of a Tera-style `for` loop is evaluated exactly once;
- each iteration binds the loop variable freshly, so writing to it is discarded;
- a descending range (`5..1`) is empty rather than reversed;
- `0..n - 1` already binds as `0..(n - 1)`; `0..(n - 1)` is the explicit spelling;
- a `continue` inside a C-style `for` loop whose update clause is missing iterates
  forever, exactly like C — the suite so far contains no such case.
