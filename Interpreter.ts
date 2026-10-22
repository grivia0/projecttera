import type { SourceLocation } from "./TokenType.js";
import { RuntimeError } from "./Errors.js";
import { StdinLines } from "./Stdin.js";
import type {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  VarDeclNode,
  IfStatementNode,
  WhileStatementNode,
  ForStatementNode,
  ForClauseStatementNode,
  SwitchStatementNode,
  FunctionDeclNode,
  MemberExprNode,
  AssignmentExprNode,
  RemoveStatementNode,
  UnaryExprNode,
} from "./AST.js";

// Frames the environment chain: a binding can remember the type it was declared with
// (`let n: 0 => int`), which is what lets `n = input("n> ")` read the line as an int.
export class Environment {
  private variables = new Map();
  private declaredTypes = new Map<string, string>();
  private parent: Environment | null = null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  // `declaredType` is only passed for bindings whose type the program wrote down; the
  // globals and untyped declarations are stored without one.
  public define(name: string, value: any, declaredType?: string): void {
    this.variables.set(name, value);
    if (declaredType) {
      this.declaredTypes.set(name, declaredType);
    }
  }

  // The declared type of the binding this scope resolves `name` to, or undefined when the
  // program never wrote one down. Mirroring `assign`, a binding in an inner scope wins over
  // an annotated one further out.
  public declaredTypeOf(name: string): string | undefined {
    if (this.variables.has(name)) {
      return this.declaredTypes.get(name);
    }
    return this.parent ? this.parent.declaredTypeOf(name) : undefined;
  }

  // `loc` is threaded through so a runtime failure can point at the source position of
  // the expression that read or wrote the variable.
  public get(name: string, loc?: SourceLocation): any {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.get(name, loc);
    }
    throw new RuntimeError(`Undefined variable '${name}'`, loc);
  }

  public assign(name: string, value: any, loc?: SourceLocation): void {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value, loc);
      return;
    }
    throw new RuntimeError(`Cannot assign to undefined variable '${name}'`, loc);
  }
}

// `input(<prompt>)` hands back the next line of standard input as a string. When the
// surrounding code wrote down a type for that value — `let n: input("n> ") => int`,
// `n = input("n> ")` or `return input("n> ")` in a function declared `=> int` — the line is
// read into that type instead. The type checker has already rejected every annotation a
// line cannot be read into, so only `int`, `string` and `bool` reach the helpers below.

// True for a direct call to the `input` built-in, the only expression the runtime converts.
function isInputCall(expr: ExpressionNode): boolean {
  return expr.type === "CallExpr" && expr.callee.type === "Identifier" && expr.callee.name === "input";
}

// The annotation keyword is `bool`; the checker normalizes it to `boolean` before storing.
function normalizeAnnotationType(t: string): string {
  return t === "bool" ? "boolean" : t;
}

// Reads a line of text as `declaredType`, stopping the program when the text does not fit
// (`abc` as an int, `maybe` as a bool). The line itself arrives verbatim from `input`, so a
// plain string keeps its spaces; a number or a bool ignores the spaces around it, because
// ` 42 ` is what someone types when a prompt asks for a number.
function readLineAs(line: any, declaredType: string, loc: SourceLocation): any {
  const text = String(line);
  const trimmed = text.trim();

  switch (normalizeAnnotationType(declaredType)) {
    case "string":
      return text;
    case "int":
      if (!/^[+-]?\d+$/.test(trimmed)) {
        throw new RuntimeError(`Cannot read '${trimmed}' as an int.`, loc);
      }
      return parseInt(trimmed, 10);
    case "boolean": {
      const lowered = trimmed.toLowerCase();
      if (lowered !== "true" && lowered !== "false") {
        throw new RuntimeError(`Cannot read '${trimmed}' as a bool (expected 'true' or 'false').`, loc);
      }
      return lowered === "true";
    }
    default:
      // Unreachable: the type checker reports this annotation before the program runs.
      throw new RuntimeError(
        `input() cannot produce a value of type '${declaredType}'. It can only produce 'int', 'string' or 'bool'.`,
        loc
      );
  }
}

// Best-effort Tera type of a runtime value, used for bindings whose type the program never
// wrote down but the checker still infers — the loop variable of `for n: nums` gets the
// element type of `nums`, and this is the runtime half of that agreement. Non-scalar values
// (arrays, function values) report nothing, which is fine: the checker refuses to read a
// line into anything but `int`, `string` and `bool` in the first place.
function teraTypeOfValue(value: any): string | undefined {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "int";
  if (typeof value === "boolean") return "boolean";
  return undefined;
}

class ReturnValue {
  constructor(public value: any) {}
}

// Control-flow signals used to unwind out of loop bodies (mirrors ReturnValue).
class BreakSignal {}
class ContinueSignal {}

export class Interpreter {
  private globalEnv: Environment;
  // Declared return type of the function currently running, so `return input("n> ")` can be
  // read into it (mirrors `currentReturnType` in the type checker). null at top level and in
  // functions that never wrote a return type down.
  private currentReturnType: string | null = null;
  // Standard input, read one line per `input()` call (see Stdin.ts). Buffered per run: bytes
  // read ahead of a newline are kept for the next call, and anything still unread when the
  // program ends is dropped.
  private stdin = new StdinLines();

  constructor() {
    this.globalEnv = new Environment();
    this.setupGlobals();
  }

  private setupGlobals(): void {
    // Built-in print statement / global function.
    this.globalEnv.define("print", (...args: any[]) => {
      console.log(...args);
    });

    this.globalEnv.define("input", (promptMsg?: string) => {
      if (promptMsg !== undefined) {
        process.stdout.write(String(promptMsg));
      }

      // Each call consumes exactly one line. End of input is a failure rather than an empty
      // line: the two cannot be told apart otherwise, and a program that keeps asking for
      // input it never receives is a bug worth stopping on. Optionals (1.3.0) will introduce
      // the explicit way to ask for a line that may not be there.
      const line = this.stdin.readLine();
      if (line === null) {
        throw new RuntimeError("input() expected a line but the input has ended.");
      }
      return line;
    });
  }

  public interpret(program: ProgramNode): void {
    try {
      for (const statement of program.body) {
        this.execute(statement, this.globalEnv);
      }
    } catch (err: any) {
      if (err instanceof ReturnValue) {
        return;
      }
      throw err;
    }
  }

  private execute(stmt: StatementNode, env: Environment): void {
    switch (stmt.type) {
      case "VarDecl":
        this.executeVarDecl(stmt as VarDeclNode, env);
        break;
      case "FunctionDecl":
        this.executeFunctionDecl(stmt as FunctionDeclNode, env);
        break;
      case "IfStatement":
        this.executeIfStatement(stmt as IfStatementNode, env);
        break;
      case "WhileStatement":
        this.executeWhileStatement(stmt as WhileStatementNode, env);
        break;
      case "ForStatement":
        this.executeForStatement(stmt as ForStatementNode, env);
        break;
      case "ForClauseStatement":
        this.executeForClauseStatement(stmt as ForClauseStatementNode, env);
        break;
      case "SwitchStatement":
        this.executeSwitchStatement(stmt as SwitchStatementNode, env);
        break;
      case "ReturnStatement": {
        let retValue = stmt.value ? this.evaluate(stmt.value, env) : undefined;
        if (stmt.value) {
          // `return input("n> ")` reads the line as the function's declared return type.
          retValue = this.readInputInto(retValue, stmt.value, this.currentReturnType);
        }
        throw new ReturnValue(retValue);
      }
      case "ExpressionStatement":
        this.evaluate(stmt.expression, env);
        break;
      case "RemoveStatement": 
        this.executeRemoveStatement(stmt as any, env);
        break;
      case "BreakStatement":
        throw new BreakSignal();
      case "ContinueStatement":
        throw new ContinueSignal();
      default:
        throw new RuntimeError(`Unknown statement type: ${(stmt as any).type}`, (stmt as any).loc);
    }
  }

  private executeVarDecl(node: VarDeclNode, env: Environment): void {
    let value = node.value ? this.evaluate(node.value, env) : undefined;
    if (node.value && node.targetType) {
      value = this.readInputInto(value, node.value, node.targetType);
    }
    env.define(node.identifier, value, node.targetType);
  }

  // `input(...)` produced a raw line; when the surrounding code wrote a type down for it,
  // the line is read into that type. Every other expression passes through untouched.
  private readInputInto(value: any, source: ExpressionNode, declaredType: string | null | undefined): any {
    if (!declaredType || normalizeAnnotationType(declaredType) === "undefined") return value;
    return isInputCall(source) ? readLineAs(value, declaredType, source.loc) : value;
  }

  private executeRemoveStatement(node: { target: ExpressionNode }, env: Environment): void {
    if (node.target.type !== "IndexAccess") {
      throw new RuntimeError(`Target of 'rm' statement must be an index access.`, node.target.loc);
    }
    const targetObj = this.evaluate(node.target.object, env);
    const indexVal = this.evaluate(node.target.index, env);
    if (!Array.isArray(targetObj)) {
      throw new RuntimeError(`Cannot remove element from non-array target.`, node.target.loc);
    }
    targetObj.splice(indexVal, 1);
  }

  private executeFunctionDecl(node: FunctionDeclNode, env: Environment): void {
    if (!node.name) {
      throw new RuntimeError("Anonymous function declaration missing name", node.loc);
    }

    const fnClosure = (...args: any[]) => {
      const fnEnv = new Environment(env);
      for (let i = 0; i < node.params.length; i++) {
        fnEnv.define(node.params[i]!.name, args[i], node.params[i]!.paramType);
      }
      const outerReturnType = this.currentReturnType;
      this.currentReturnType = node.returnType ?? null;
      try {
        if (Array.isArray(node.body)) {
          for (const stmt of node.body) {
            this.execute(stmt, fnEnv);
          }
        } else {
          // If body is a single expression (lambda/inline style)
          return this.evaluate(node.body, fnEnv);
        }
      } catch (err: any) {
        if (err instanceof ReturnValue) {
          return err.value;
        }
        throw err;
      } finally {
        this.currentReturnType = outerReturnType;
      }
      return undefined;
    };

    env.define(node.name, fnClosure);
  }

  private executeIfStatement(node: IfStatementNode, env: Environment): void {
    const condValue = this.evaluate(node.condition, env);
    if (condValue) {
      if (Array.isArray(node.thenBranch)) {
        const blockEnv = new Environment(env);
        for (const stmt of node.thenBranch) this.execute(stmt, blockEnv);
      } else {
        this.execute(node.thenBranch, env);
      }
    } else if (node.elseBranch) {
      if (Array.isArray(node.elseBranch)) {
        const blockEnv = new Environment(env);
        for (const stmt of node.elseBranch) this.execute(stmt, blockEnv);
      } else {
        this.execute(node.elseBranch, env);
      }
    }
  }

  private executeWhileStatement(node: WhileStatementNode, env: Environment): void {
    while (this.evaluate(node.condition, env)) {
      try {
        if (Array.isArray(node.body)) {
          const loopEnv = new Environment(env);
          for (const stmt of node.body) this.execute(stmt, loopEnv);
        } else {
          this.execute(node.body, env);
        }
      } catch (err) {
        if (err instanceof BreakSignal) break;
        if (err instanceof ContinueSignal) continue;
        throw err;
      }
    }
  }

  private executeForStatement(node: ForStatementNode, env: Environment): void {
    const iterable = this.evaluate(node.iterable, env);
    if (!Array.isArray(iterable)) {
      throw new RuntimeError(`Cannot iterate over non-array value.`, node.iterable.loc);
    }

    for (const item of iterable) {
      const loopEnv = new Environment(env);
      // The checker gives the loop variable the element type of the iterable, so the runtime
      // records the same thing here — that is what lets `n = input()` inside the loop read
      // the line as an int when iterating an `arr[int]`.
      loopEnv.define(node.variable, item, teraTypeOfValue(item));
      try {
        if (Array.isArray(node.body)) {
          for (const stmt of node.body) this.execute(stmt, loopEnv);
        } else {
          this.execute(node.body, loopEnv);
        }
      } catch (err) {
        if (err instanceof BreakSignal) break;
        if (err instanceof ContinueSignal) continue;
        throw err;
      }
    }
  }

  private executeForClauseStatement(node: ForClauseStatementNode, env: Environment): void {
    const loopEnv = new Environment(env);

    if (node.init) {
      if (node.init.type === "VarDecl") {
        this.executeVarDecl(node.init, loopEnv);
      } else {
        this.evaluate(node.init, loopEnv);
      }
    }

    while (true) {
      if (node.condition && !this.evaluate(node.condition, loopEnv)) {
        break;
      }

      try {
        if (Array.isArray(node.body)) {
          const bodyEnv = new Environment(loopEnv);
          for (const stmt of node.body) this.execute(stmt, bodyEnv);
        } else {
          this.execute(node.body, loopEnv);
        }
      } catch (err) {
        if (err instanceof BreakSignal) break;
        if (!(err instanceof ContinueSignal)) throw err;
        // ContinueSignal: fall through so the update clause still runs.
      }

      if (node.update) {
        this.evaluate(node.update, loopEnv);
      }
    }
  }

  private executeSwitchStatement(node: SwitchStatementNode, env: Environment): void {
    const value = this.evaluate(node.discriminant, env);
    let matched = false;

    for (const caseNode of node.cases) {
      if (caseNode.test === null || matched || this.evaluate(caseNode.test, env) === value) {
        matched = true;
        const caseEnv = new Environment(env);
        try {
          for (const stmt of caseNode.consequent) {
            this.execute(stmt, caseEnv);
          }
        } catch (err) {
          if (err instanceof BreakSignal) break; // `break` exits the switch
          throw err;
        }
        if (matched) break; // Break execution after matching case
      }
    }
  }

  private evaluate(expr: ExpressionNode, env: Environment): any {
    switch (expr.type) {
      case "Literal":
        return expr.value;
      case "Identifier":
        return env.get(expr.name, expr.loc);
      case "ArrayLiteral":
        return expr.elements.map((el) => this.evaluate(el, env));
      case "IndexAccess": {
        const target = this.evaluate(expr.object, env);
        const index = this.evaluate(expr.index, env);
        return target[index];
      }
      case "Range": {
        const start = this.evaluate(expr.start, env);
        const end = this.evaluate(expr.end, env);
        const values: number[] = [];
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
        return values;
      }
      case "MemberExpr": {
        const obj = this.evaluate(expr.object, env);
        const prop = expr.property;

        if (Array.isArray(obj)) {
          if (prop === "leng") return obj.length;
          if (prop === "isEmpty") return obj.length === 0;
          if (prop === "first") return obj[0];
          if (prop === "last") return obj.length > 0 ? obj[obj.length - 1] : undefined;
          if (prop === "asString") return () => obj.toString();
          if (prop === "at") return (idx: number) => obj.at(idx);
          if (prop === "get") return (idx: number) => {
            if (idx < 0 || idx >= obj.length) {
              throw new RuntimeError(`Index out of bounds for array of length ${obj.length}`, expr.loc);
            }
            return obj[idx];
          };
          if (prop === "find") return (pred: Function) => obj.find((el: any) => pred(el));
          if (prop === "findIndex") return (pred: Function) => obj.findIndex((el: any) => pred(el));
          if (prop === "join") return (sep: string = ",") => obj.join(sep);
          if (prop === "rmv") return (idx: number) => obj.splice(idx, 1)[0];
          if (prop === "add") return (...args: any[]) => obj.push(...args);
          if (prop === "shift") return () => obj.shift();
          // `rmShift` is an alias of `shift`: both remove and return the first element.
          if (prop === "rmShift") return () => obj.shift();
          if (prop === "merge") return (other: any[]) => obj.concat(other);
          if (prop === "copyIn") return (other: any[]) => [...obj, ...other];
          if (prop === "flat") return () => obj.flat();
          if (prop === "slice") return (start: number, end?: number) => obj.slice(start, end);
          if (prop === "splice") return (start: number, deleteCount?: number, ...items: any[]) => 
            deleteCount === undefined ? obj.splice(start) : obj.splice(start, deleteCount, ...items);
        }

        if (typeof obj === "string") {
          if (prop === "leng") return obj.length;
          if (prop === "isEmpty") return obj.length === 0;
          if (prop === "first") return obj[0];
          if (prop === "last") return obj.length > 0 ? obj[obj.length - 1] : undefined;
          if (prop === "asString") return () => String(obj);
        }

        return obj ? obj[prop] : undefined;
      }
      case "AssignmentExpr": {
        let value = this.evaluate(expr.value, env);
        if (expr.target.type === "Identifier") {
          // `n = input("n> ")` reads the line as the type the variable was declared with.
          value = this.readInputInto(value, expr.value, env.declaredTypeOf(expr.target.name));
          env.assign(expr.target.name, value, expr.target.loc);
        } else if (expr.target.type === "IndexAccess") {
          const targetObj = this.evaluate(expr.target.object, env);
          const indexVal = this.evaluate(expr.target.index, env);
          targetObj[indexVal] = value;
        } else if (expr.target.type === "MemberExpr") {
          const targetObj = this.evaluate(expr.target.object, env);
          targetObj[expr.target.property] = value;
        } else {
          throw new RuntimeError(`Invalid assignment target.`, (expr.target as any).loc);
        }
        return value;
      }
      case "BinaryExpr":
        return this.evaluateBinary(expr.left, expr.operator, expr.right, env);
      case "UnaryExpr":
        return this.evaluateUnary(expr.operator, expr.right, env, expr.isPostfix);
      case "CallExpr": {
        const callee = this.evaluate(expr.callee, env);
        const args = expr.arguments.map((arg) => this.evaluate(arg, env));
        if (typeof callee === "function") {
          try {
            return callee(...args);
          } catch (error) {
            // A built-in raises its failure without knowing where it was called from, so the
            // call site is attached here (`input()` running out of lines is the main one).
            // Errors from deeper in a Tera function already point at their own line.
            if (error instanceof RuntimeError && !error.location) {
              throw new RuntimeError(error.detail, expr.loc);
            }
            throw error;
          }
        }
        throw new RuntimeError(`Target is not callable`, expr.loc);
      }
      case "FunctionExpr": {
        const fnExpr = expr as any;
        return (...args: any[]) => {
          const fnEnv = new Environment(env);
          for (let i = 0; i < fnExpr.params.length; i++) {
            fnEnv.define(fnExpr.params[i]!.name, args[i], fnExpr.params[i]!.paramType);
          }
          const outerReturnType = this.currentReturnType;
          this.currentReturnType = fnExpr.returnType ?? null;
          try {
            if (Array.isArray(fnExpr.body)) {
              for (const stmt of fnExpr.body) {
                this.execute(stmt, fnEnv);
              }
            } else {
              return this.evaluate(fnExpr.body, fnEnv);
            }
          } catch (err: any) {
            if (err instanceof ReturnValue) {
              return err.value;
            }
            throw err;
          } finally {
            this.currentReturnType = outerReturnType;
          }
          return undefined;
        };
      }
      default:
        throw new RuntimeError(`Unknown expression type: ${(expr as any).type}`, (expr as any).loc);
    }
  }

  private evaluateBinary(leftExpr: ExpressionNode, op: string, rightExpr: ExpressionNode, env: Environment): any {
    // Logical operators short-circuit: the right side is only evaluated when needed.
    if (op === "&&") {
      const left = this.evaluate(leftExpr, env);
      return left ? this.evaluate(rightExpr, env) : false;
    }
    if (op === "||") {
      const left = this.evaluate(leftExpr, env);
      return left ? true : this.evaluate(rightExpr, env);
    }

    const left = this.evaluate(leftExpr, env);
    const right = this.evaluate(rightExpr, env);

    switch (op) {
      case "+": return left + right;
      case "-": return left - right;
      case "*": return left * right;
      case "/": return left / right;
      case "%": return left % right;
      case "**": return left ** right;
      case ">": return left > right;
      case "<": return left < right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      case "==": return left == right;
      case "!=": return left != right;
      case "===": return left === right;
      default:
        throw new RuntimeError(`Unsupported operator: ${op}`, leftExpr.loc);
    }
  }

  private evaluateUnary(op: string, rightExpr: ExpressionNode, env: Environment, isPostfix?: boolean): any {
    if (op === "++" || op === "--") {
      if (rightExpr.type !== "Identifier" && rightExpr.type !== "IndexAccess" && rightExpr.type !== "MemberExpr") {
        throw new RuntimeError(`Invalid target for increment/decrement`, rightExpr.loc);
      }

      const currentValue = this.evaluate(rightExpr, env);
      const newValue = op === "++" ? currentValue + 1 : currentValue - 1;

      // Mutate the variable or container target in-place
      if (rightExpr.type === "Identifier") {
        env.assign(rightExpr.name, newValue);
      } else if (rightExpr.type === "IndexAccess") {
        const targetObj = this.evaluate(rightExpr.object, env);
        const indexVal = this.evaluate(rightExpr.index, env);
        targetObj[indexVal] = newValue;
      } else if (rightExpr.type === "MemberExpr") {
        const targetObj = this.evaluate(rightExpr.object, env);
        targetObj[rightExpr.property] = newValue;
      }

      // Postfix (x++) returns old value; Prefix (++x) returns new value
      return isPostfix ? currentValue : newValue;
    }

    const right = this.evaluate(rightExpr, env);
    switch (op) {
      case "-": return -right;
      case "+": return +right;
      case "!": return !right;
      default:
        throw new RuntimeError(`Unsupported unary operator: ${op}`, rightExpr.loc);
    }
  }
}