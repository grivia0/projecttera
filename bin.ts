#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Lexer } from "./Lexer.js";
import { Parser } from "./Parser.js";
import { TypeChecker } from "./TypeChecker.js";
import { Interpreter } from "./Interpreter.js";

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.log("Usage: tera <filename.tera>");
  process.exit(1);
}

const fullPath = path.resolve(filePath);

if (!fs.existsSync(fullPath)) {
  console.error(`Error: File not found '${filePath}'`);
  process.exit(1);
}

const code = fs.readFileSync(fullPath, "utf-8");

try {
  // 1. Tokenize source code string into Token[]
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();

  // 2. Pass Token[] to Parser
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // 3. TypeCheck and Interpret AST
  const typeChecker = new TypeChecker();
  typeChecker.check(ast);

  const interpreter = new Interpreter();
  interpreter.interpret(ast);
} catch (err: any) {
  console.error(err.message);
  process.exit(1);
}