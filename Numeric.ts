// The rules of Tera's numeric model: exact `int` arithmetic and the text form of a `float`.
//
// Both numeric types share one JavaScript representation — an `int` and a `float` are plain
// `number`s at runtime — but they are *not* the same type. Which of the two a value has is a
// static fact: the type checker decides it for every expression and the interpreter asks the
// checker (see `Interpreter.typeOf`). The runtime therefore never guesses from the value, which
// it could not do anyway: `3` and `3.0` are the same JavaScript number.
//
// Everything that needs that decision *and* the value lives here: the exact integer operations,
// their failures (`1 / 0`, overflow, a negative exponent), and float formatting. Keeping it in
// one file means the rules are written once instead of at every arithmetic site.
import type { SourceLocation } from "./TokenType.js";
import { RuntimeError } from "./Errors.js";

// A Tera `int` is a whole number JavaScript holds exactly. The bounds are the IEEE-754
// safe-integer bounds, and they are part of the language: an `int` that cannot be represented
// exactly is an error rather than a silently rounded value (decision D13).
export const INT_MIN = Number.MIN_SAFE_INTEGER; // -9007199254740991
export const INT_MAX = Number.MAX_SAFE_INTEGER; //  9007199254740991

const INT_RANGE = `${INT_MIN} to ${INT_MAX}`;

// Every int operation starts here. A value that is not an exact whole number can only reach an
// int operation from a program the checker could not prove sound (an uninitialised `let x: int`
// before definite assignment lands), and saying so beats `NaN` leaking into the output.
function requireInt(value: any, loc?: SourceLocation): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RuntimeError("An int operand is required here, but the value is not a Tera int.", loc);
  }
  return value;
}

// The overflow policy, in one place: a result that leaves the range stops the program and names
// the computation that left it.
function checkResult(value: number, expression: string, loc?: SourceLocation): number {
  if (!Number.isSafeInteger(value)) {
    throw new RuntimeError(
      `Integer overflow: ${expression} does not fit in a Tera int (whole numbers are exact from ${INT_RANGE}).`,
      loc
    );
  }
  return value;
}

export function addInts(a: any, b: any, loc?: SourceLocation): number {
  const left = requireInt(a, loc);
  const right = requireInt(b, loc);
  return checkResult(left + right, `${left} + ${right}`, loc);
}

export function subtractInts(a: any, b: any, loc?: SourceLocation): number {
  const left = requireInt(a, loc);
  const right = requireInt(b, loc);
  return checkResult(left - right, `${left} - ${right}`, loc);
}

export function multiplyInts(a: any, b: any, loc?: SourceLocation): number {
  const left = requireInt(a, loc);
  const right = requireInt(b, loc);
  return checkResult(left * right, `${left} * ${right}`, loc);
}

// `int / int` is C-like integer division: the quotient truncates toward zero, so `7 / 2` is `3`
// and `-7 / 2` is `-3` (decision D14). The division itself is done in BigInt because IEEE
// doubles cannot represent every quotient exactly: a true value of 3002399751580330.99… rounds
// *up* to …331 as a double, and the truncation would then be off by one.
export function divideInts(a: any, b: any, loc?: SourceLocation): number {
  const left = requireInt(a, loc);
  const right = requireInt(b, loc);
  if (right === 0) {
    throw new RuntimeError("Division by zero: an int cannot be divided by 0.", loc);
  }
  return Number(BigInt(left) / BigInt(right));
}

// `%` is the remainder that goes with that division: it keeps the sign of the dividend
// (`-7 % 2` is `-1`), which is what JavaScript's `%` already does on whole numbers.
export function moduloInts(a: any, b: any, loc?: SourceLocation): number {
  const left = requireInt(a, loc);
  const right = requireInt(b, loc);
  if (right === 0) {
    throw new RuntimeError("Modulo by zero: an int cannot be divided by 0.", loc);
  }
  return Number(BigInt(left) % BigInt(right));
}

// `int ** int` stays an int, so a negative exponent has no int answer — `2 ** -1` is a half.
// The message points at the fix (write the base as a float) instead of reporting an overflow.
export function powerInts(a: any, b: any, loc?: SourceLocation): number {
  const base = requireInt(a, loc);
  const exponent = requireInt(b, loc);
  const expression = `${base} ** ${exponent}`;

  if (exponent < 0) {
    throw new RuntimeError(
      `Cannot raise an int to the negative exponent ${exponent}: the result would not be an int. Use a float base such as ${base}.0 ** ${exponent}.`,
      loc
    );
  }

  if (base === 0) return exponent === 0 ? 1 : 0;
  if (base === 1) return 1;
  if (base === -1) return exponent % 2 === 0 ? 1 : -1;

  // |base| is at least 2 here, so anything past 2 ** 53 is out of range. Checking the exponent
  // first keeps `2 ** 9007199254740991` a fast failure instead of a long loop.
  if (exponent > 53) {
    throw new RuntimeError(
      `Integer overflow: ${expression} does not fit in a Tera int (whole numbers are exact from ${INT_RANGE}).`,
      loc
    );
  }

  let result = 1;
  for (let i = 0; i < exponent; i++) {
    result = checkResult(result * base, expression, loc);
  }
  return result;
}

// Float arithmetic is JavaScript's own: a `float` is an IEEE double and none of int's exactness
// promises apply. Division and modulo by zero are still failures rather than `Infinity`/`NaN`,
// because a program that divides by zero is a bug whether or not its numbers are whole.
export function divideFloats(a: any, b: any, loc?: SourceLocation): number {
  if (b === 0) {
    throw new RuntimeError("Division by zero: a float cannot be divided by 0.", loc);
  }
  return a / b;
}

export function moduloFloats(a: any, b: any, loc?: SourceLocation): number {
  if (b === 0) {
    throw new RuntimeError("Modulo by zero: a float cannot be divided by 0.", loc);
  }
  return a % b;
}

// The text form of a float (decision D15): the shortest text that reads back as the same
// float — JavaScript's own `String`, which is exactly that — with a forced `.0` when the float
// is whole, so `1.0 / 4.0 * 4.0` prints `1.0` and never looks like an int. Exponents
// (`1e+21`) and the non-finite spellings keep JavaScript's form.
export function floatText(value: any): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}
