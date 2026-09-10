import type {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  VarDeclNode,
  IfStatementNode,
  WhileStatementNode,
  SwitchStatementNode,
  FunctionDeclNode,
  MemberExprNode,
  AssignmentExprNode,
  RemoveStatementNode,
  UnaryExprNode,
} from "./AST.js";

export class Environment {
  private variables: Map<string, any> = new Map();
  private parent: Environment | null = null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  public define(name: string, value: any): void {
    this.variables.set(name, value);
  }

  public get(name: string): any {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`[Runtime Error] Undefined variable '${name}'`);
  }

  public assign(name: string, value: any): void {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new Error(`[Runtime Error] Cannot assign to undefined variable '${name}'`);
  }
}

class ReturnValue {
  constructor(public value: any) {}
}

export class Interpreter {
  private globalEnv: Environment;

  constructor() {
    this.globalEnv = new Environment();
    this.setupGlobals();
  }

  private setupGlobals(): void {
    // Built-in print statement / global function
    this.globalEnv.define("print", (...args: any[]) => {
      console.log(...args);
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
      case "SwitchStatement":
        this.executeSwitchStatement(stmt as SwitchStatementNode, env);
        break;
      case "ReturnStatement":
        const retValue = stmt.value ? this.evaluate(stmt.value, env) : undefined;
        throw new ReturnValue(retValue);
      case "ExpressionStatement":
        this.evaluate(stmt.expression, env);
        break;
      case "RemoveStatement": // <--- Add this, nya!
        this.executeRemoveStatement(stmt as any, env);
        break;
      default:
        throw new Error(`[Runtime Error] Unknown statement type: ${(stmt as any).type}`);
    }
  }

  private executeVarDecl(node: VarDeclNode, env: Environment): void {
    const value = node.value ? this.evaluate(node.value, env) : undefined;
    env.define(node.identifier, value);
  }

  private executeRemoveStatement(node: { target: ExpressionNode }, env: Environment): void {
    if (node.target.type !== "IndexAccess") {
      throw new Error(`[Runtime Error] Target of 'rm' statement must be an index access.`);
    }
    const targetObj = this.evaluate(node.target.object, env);
    const indexVal = this.evaluate(node.target.index, env);
    if (!Array.isArray(targetObj)) {
      throw new Error(`[Runtime Error] Cannot remove element from non-array target.`);
    }
    targetObj.splice(indexVal, 1);
  }

  private executeFunctionDecl(node: FunctionDeclNode, env: Environment): void {
    if (!node.name) {
      throw new Error("[Runtime Error] Anonymous function declaration missing name");
    }

    const fnClosure = (...args: any[]) => {
      const fnEnv = new Environment(env);
      for (let i = 0; i < node.params.length; i++) {
        fnEnv.define(node.params[i]!.name, args[i]);
      }
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
      if (Array.isArray(node.body)) {
        const loopEnv = new Environment(env);
        for (const stmt of node.body) this.execute(stmt, loopEnv);
      } else {
        this.execute(node.body, env);
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
        for (const stmt of caseNode.consequent) {
          this.execute(stmt, caseEnv);
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
        return env.get(expr.name);
      case "ArrayLiteral":
        return expr.elements.map((el) => this.evaluate(el, env));
      case "IndexAccess": {
        const target = this.evaluate(expr.object, env);
        const index = this.evaluate(expr.index, env);
        return target[index];
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
          if (prop === "join") return (sep: string = ",") => obj.join(sep);
          if (prop === "rmv") return (idx: number) => obj.splice(idx, 1)[0];
          if (prop === "push") return (...args: any[]) => obj.push(...args);
          if (prop === "shift") return () => obj.shift();
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
        }

        return obj ? obj[prop] : undefined;
      }
      case "AssignmentExpr": {
        const value = this.evaluate(expr.value, env);
        if (expr.target.type === "Identifier") {
          env.assign(expr.target.name, value);
        } else if (expr.target.type === "IndexAccess") {
          const targetObj = this.evaluate(expr.target.object, env);
          const indexVal = this.evaluate(expr.target.index, env);
          targetObj[indexVal] = value;
        } else if (expr.target.type === "MemberExpr") {
          const targetObj = this.evaluate(expr.target.object, env);
          targetObj[expr.target.property] = value;
        } else {
          throw new Error(`[Runtime Error] Invalid assignment target.`);
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
          return callee(...args);
        }
        throw new Error(`[Runtime Error] Target is not callable`);
      }
      default:
        throw new Error(`[Runtime Error] Unknown expression type: ${(expr as any).type}`);
    }
  }

  private evaluateBinary(leftExpr: ExpressionNode, op: string, rightExpr: ExpressionNode, env: Environment): any {
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
        throw new Error(`[Runtime Error] Unsupported operator: ${op}`);
    }
  }

  private evaluateUnary(op: string, rightExpr: ExpressionNode, env: Environment, isPostfix?: boolean): any {
    if (op === "++" || op === "--") {
      if (rightExpr.type !== "Identifier" && rightExpr.type !== "IndexAccess" && rightExpr.type !== "MemberExpr") {
        throw new Error(`[Runtime Error] Invalid target for increment/decrement`);
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
        throw new Error(`[Runtime Error] Unsupported unary operator: ${op}`);
    }
  }
}