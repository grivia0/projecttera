# ProjectTera 

ProjectTera is a small statically typed interpreted programming language and compiler/interpreter toolchain built from scratch using **TypeScript**. It features a full pipeline including lexical analysis, custom Abstract Syntax Tree (AST) definitions, a static type checker, and a tree-walk interpreter!

---

##  Features

* **Lexer & Parser:** Tokenizes source code into a robust AST supporting expressions, statements, control flow, and functions.
* **Static Type Checker:** Enforces strict type safety (`int`, `string`, `boolean`, custom array types, etc.) with lexical scope management.
* **Tree-Walk Interpreter:** Dynamically evaluates and executes statements, variable assignments, index mutations, and built-in functions at runtime.
* **Modern TypeScript:** Clean, modular codebase designed with extensibility in mind.

---

##  Project Structure

* `AST.ts` — Defines the Abstract Syntax Tree node structures and expression unions.
* `Lexer.ts` — Tokenizes the raw source code text.
* `Parser.ts` — Parses tokens into syntax trees.
* `TypeChecker.ts` — Performs static analysis and type safety validation.
* `Interpreter.ts` — Executes the AST nodes at runtime with environment scoping.
* `bin.ts` / `index.ts` — Entry points for running the language compiler/interpreter.

---

##  Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation & Setup
1. Clone the repository:
   ```bash
   git clone [https://github.com/grivia0/projecttera.git](https://github.com/grivia0/projecttera.git)
   cd ProjectTerra
2. Install dependencies:
    ```bash
    npm install
3. Build and run a test file (test.tera):
    ```bash
    npm run build
    node dist/bin.js test.tera  