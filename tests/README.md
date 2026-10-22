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

`string(x)`, `int(x)`, `float(x)` and `bool(x)` turn one value into the named type, which is what
lets a number join a message (`"n=" + string(n)`) or a line of text become a number
(`int(raw) + 1`) without an annotation. They are deliberate, not JavaScript-style coercions: the
operand types are fixed, so `int(true)` is a type error rather than a guessed `1`.

| Call        | Accepts                          | Produces                            |
| ----------- | -------------------------------- | ----------------------------------- |
| `string(x)` | `string`, `int`, `float`, `bool` | the value as text (a float keeps `.0` when whole) |
| `int(x)`    | `string`, `int`, `float`         | the whole number; a float truncates toward zero |
| `float(x)`  | `string`, `int`, `float`         | the number as a float               |
| `bool(x)`   | `string`, `bool`                 | `true` or `false`                   |

`int(" 42 ")` and `bool(" TRUE ")` ignore the spaces around the value, exactly like a line read
into those types; `int("4.5")`, `int("abc")`, `bool("maybe")` and a run of digits too long to be
held exactly all stop the program where the conversion is written. `float("4,5")` does the same,
while `float("2.5")` and `float("3")` are both floats. The keyword on its own is not a value:
`print(int)` is a parse error that says so.

A conversion right after `let name:` is the initial value, not an annotation — the parenthesis
decides: `let n: int("12")` converts, `let n: int` declares a type and no value (and can be
assigned later). `cases/conversions_declaration.tera` pins the first form,
`cases/err_conversions_declaration_type.tera` pins that the conversion's type is the binding's type.

## Numbers

`int` and `float` are separate types, and the runtime keeps them apart with the checker's
`expressionTypes`: both are a JavaScript number, so every numeric operation asks the checker what
the operands are before it decides how to behave.

| Rule | Behaviour | Pinned by |
| --- | --- | --- |
| Range | `int` is exact from `-9007199254740991` to `9007199254740991`; leaving it stops the program | `err_int_overflow`, `err_int_overflow_mul`, `err_int_overflow_update`, `err_int_overflow_literal`, `err_int_power_overflow` |
| `int / int` | truncates toward zero (`-7 / 2` is `-3`), never a fraction | `numeric_int` |
| `int % int` | keeps the sign of the dividend (`-7 % 2` is `-1`) | `numeric_int` |
| Division by zero | an error for `int` and for `float`, `/` and `%` | `err_int_division_zero`, `err_float_division_zero`, `err_int_modulo_zero` |
| `**` | an `int` base with a negative exponent is an error; `int` powers are range-checked | `err_int_power_negative`, `err_int_power_overflow` |
| Mixing | one `float` operand promotes `+ - * / % **` and comparisons to `float`; the annotation does not | `numeric_float`, `err_float_annotation`, `err_int_annotation` |
| Printing | the shortest text that reads back as the same value, `.0` kept when whole | `numeric_float_text` |
| Conversions | `int(float)` truncates toward zero and range-checks; `float(int)` and `float(text)` produce a float | `numeric_conversions`, `err_int_from_float_range`, `err_float_range` |
| Input | `input()` into a `float` reads it as a float | `numeric_input` |

`Numeric.ts` holds the rules themselves — `add`, `subtract`, `multiply`, `divide`, `modulo`,
`power` and `floatText` — so the interpreter only chooses which one to call. `cases/err_float_range.tera`
builds its 321 digits with string `+` rather than writing them out, so the source line stays
readable even though the message has to quote the whole number.

## Checks that keep a value from appearing out of nowhere

Two rules in `TypeChecker.ts` and `Interpreter.ts` exist because the alternative is a program that
reads something the language never produced.

### Return on all paths

A function annotated `=> T` must not be able to reach its closing brace. The analysis is
conservative — it knows only about constructs it can see, and assumes nothing about conditions:

| Shape                                   | Counts as returning                    |
| --------------------------------------- | -------------------------------------- |
| `return x`                              | always (later statements are unreachable) |
| `if (c) { … } else { … }`               | when both branches do                  |
| `switch`                                | when a `default` exists and every case does |
| `while (true)` / `for (;;)`             | when nothing breaks out of that loop   |

`while (x < n) { return … }` does **not** count, because the loop can be skipped. `cases/returns_paths.tera`
pins the accepted shapes; `cases/err_missing_return.tera` (no `else`),
`cases/err_missing_return_switch.tera` (no `default`) and `cases/err_missing_return_break.tera`
(a `break` leaves the loop) pin the rejected ones:

```text
[Type Error] Function 'sign' is declared to return 'int' but can finish without returning a value.
  --> tests/cases/err_missing_return.tera:2:4
  |
2 | fn sign(n: int) => int {
  |    ^
```

### Checked indexing

`a[i]` — a read, a write, and `rm a[i]` — fails at run time outside `0 … a.leng - 1`, so an
off-by-one is a diagnostic with a caret instead of a silent `undefined`:

```text
[Runtime Error] Index 3 is out of bounds for an array of length 3.
  --> tests/cases/err_index_out_of_bounds.tera:3:11
  |
3 | print(nums[3])
  |           ^
```

`at` keeps its JavaScript behaviour (`at(-1)` counts from the end, out of range is `undefined`)
and `get` is the checked method form, which reports the same message. `cases/index_bounds.tera`
pins the accepted side together with `at(-1)`, `get` and `rm`;
`cases/err_index_out_of_bounds.tera`, `cases/err_index_negative.tera` and
`cases/err_index_write_out_of_bounds.tera` pin the rejected one.

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
