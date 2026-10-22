# Tera test suite

`npm test` builds the interpreter and then runs every program in `cases/` through the
built CLI, comparing stdout, stderr and the exit code against the expectation files
stored next to the program.

## Case layout

| File                | Meaning                                             |
| ------------------- | --------------------------------------------------- |
| `cases/<name>.tera` | the program under test (required)                   |
| `cases/<name>.in`   | stdin fed to the program (optional, defaults to EOF) |
| `cases/<name>.out`  | expected stdout (optional, defaults to empty)       |
| `cases/<name>.err`  | expected stderr (optional, defaults to empty)       |
| `cases/<name>.exit` | expected exit code (optional, defaults to `0`)      |

Comparison is exact apart from trailing newlines, so a diagnostic that changes on purpose
has to be updated deliberately. A case without a `.in` file reads end-of-file, so a program
that calls `input()` there fails with `input() expected a line but the input has ended.` —
which is why every case that reads input carries one.

`run.mjs` additionally performs a few checks that are about the CLI itself rather than about
one program: `--help`, no arguments, a missing file, and the `index.ts` example.

## Standard input

`input()` reads **one line per call** (see `Stdin.ts`), so a program can ask several questions
in a row. Only the line terminator is removed: the text keeps its leading and trailing spaces,
`\r\n` and `\n` endings read the same, a final line without a newline still counts, and there is
no limit on the line length. Reading as `int` or `bool` ignores spaces around the value, so
` 42 ` is an int, while reading as `string` hands the line back exactly as it was written. An
empty line and the end of the input are different answers: the first reads as an empty string,
the second stops the program.

## Conversions

`string(x)`, `int(x)` and `bool(x)` turn one value into the named type, which is what lets a
number join a message (`"n=" + string(n)`) or a line of text become a number (`int(raw) + 1`)
without an annotation. They are deliberate, not JavaScript-style coercions: the operand types
are fixed, so `int(true)` is a type error rather than a guessed `1`.

| Call        | Accepts                  | Produces                            |
| ----------- | ------------------------ | ----------------------------------- |
| `string(x)` | `string`, `int`, `bool`  | the value as text                   |
| `int(x)`    | `string`, `int`          | the whole number the text spells    |
| `bool(x)`   | `string`, `bool`         | `true` or `false`                   |

`int(" 42 ")` and `bool(" TRUE ")` ignore the spaces around the value, exactly like a line read
into those types; `int("4.5")`, `int("abc")`, `bool("maybe")` and a run of digits too long to be
held exactly all stop the program where the conversion is written. `float(x)` is rejected until
floats exist. The keyword on its own is not a value: `print(int)` is a parse error that says so.

## Running

```bash
npm test                   # build, then the whole suite
node tests/run.mjs         # suite only (dist/ must be built already)
node tests/run.mjs arrays  # only cases whose name contains "arrays"
```

## Adding a case

1. Write `cases/my_case.tera`.
2. Run `node dist/bin.js tests/cases/my_case.tera` and check that the output really is
   what the language should do. If the program calls `input()`, save the data it should
   read as `cases/my_case.in` and feed it with `< cases/my_case.in`.
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
