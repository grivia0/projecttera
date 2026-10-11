// Programmatic entry point: runs a Tera program straight from a string and reports
// failures exactly like the CLI does. Try `npm run build && node dist/index.js`.
import { exitCodeFor, formatDiagnostic } from "./Errors.js";
import { runSource } from "./Runner.js";

const demo = `// A short tour of the language: arrays, loops, functions and conditionals.
let nums: [1, 2, 3] => arr[int]
nums.add(4)
print("Array length is:", nums.leng)
print("Last item is:", nums[nums.leng - 1])

fn double(n: int) => int {
  return n * 2
}

let total: 0 => int
for n: nums {
  total = total + double(n)
}
print("Doubled total:", total)

fn describe(value: int) => string {
  if (value > 10) {
    return "big"
  }
  return "small"
}
print("4 is", describe(4))
print("16 is", describe(16))
`;

const demoName = "<demo>";

try {
  runSource(demo);
} catch (err) {
  console.error(formatDiagnostic(err, demoName, demo));
  process.exit(exitCodeFor(err));
}
