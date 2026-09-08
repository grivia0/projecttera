import { Lexer } from "./Lexer.js";
import { Parser } from "./Parser.js";
import { TypeChecker } from "./TypeChecker.js";
import { Interpreter } from "./Interpreter.js";

const code = `
let nums: [1, 2, 3] => arr[int]

nums.push(4)
print("Array length is:", nums.length)
print("Last item is:", nums[3])
`;

const lexer = new Lexer(code);
const tokens = lexer.tokenize();

const parser = new Parser(tokens);
const ast = parser.parse();

const typeChecker = new TypeChecker();
typeChecker.check(ast);

console.log("--- Executing Tera Code ---");
const interpreter = new Interpreter();
interpreter.interpret(ast);