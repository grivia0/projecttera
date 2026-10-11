import { Lexer } from "./Lexer.js";
import { Parser } from "./Parser.js";
import { TypeChecker } from "./TypeChecker.js";
import { Interpreter } from "./Interpreter.js";

// Runs a complete Tera program: tokenize, parse, type check, then interpret it.
//
// This is the single place the pipeline is wired together, shared by the CLI (bin.ts),
// the embeddable example (index.ts) and anything else that wants to execute Tera code.
// Failures are raised as TeraError values (see Errors.ts) and are never printed here,
// so callers decide how to present them.
export function runSource(source: string): void {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens);
  const ast = parser.parse();

  const typeChecker = new TypeChecker();
  typeChecker.check(ast);

  const interpreter = new Interpreter();
  interpreter.interpret(ast);
}
