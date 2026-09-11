import type {
  ASTNode,
  ProgramNode,
  StatementNode,
  VarDeclNode,
  FunctionDeclNode,
  IfStatementNode,
  WhileStatementNode,
  SwitchStatementNode,
  ReturnStatementNode,
  ExpressionStatementNode,
  ExpressionNode,
  LiteralNode,
  IdentifierNode,
  BinaryExprNode,
  UnaryExprNode,
  CallExprNode,
  ArrayLiteralNode,
  IndexAccessNode,
  MemberExprNode,
  AssignmentExprNode,
  RemoveStatementNode,
} from "./AST.js";

// Type definitions used within the static environment
export type TeraType = "int" | "string" | "boolean" | "undefined" | string;

export class TypeError extends Error {
  constructor(message: string) {
    super(`[Type Error] ${message}`);
    this.name = "TypeError";
  }
}

class TypeEnvironment {
  private bindings: Map<string, TeraType> = new Map();

  constructor(private parent: TypeEnvironment | null = null) {}

  public define(name: string, type: TeraType): void {
    if (this.bindings.has(name)) {
      throw new TypeError(`Identifier '${name}' has already been declared in this scope.`);
    }
    this.bindings.set(name, type);
  }

  public assign(name: string, type: TeraType): void {
    if (this.bindings.has(name)) {
      const expectedType = this.bindings.get(name)!;
      if (!this.isCompatible(expectedType, type)) {
        throw new TypeError(`Cannot assign value of type '${type}' to variable '${name}' of type '${expectedType}'.`);
      }
      return;
    }
    if (this.parent) {
      this.parent.assign(name, type);
      return;
    }
    throw new TypeError(`Undefined variable '${name}'.`);
  }

  public lookup(name: string): TeraType {
    if (this.bindings.has(name)) {
      return this.bindings.get(name)!;
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    throw new TypeError(`Undefined variable '${name}'.`);
  }

  private isCompatible(target: string, inferred: string): boolean {
    if (target === inferred) return true;
    return false;
  }
}

export class TypeChecker {
  private globalEnv: TypeEnvironment;

  constructor() {
    this.globalEnv = new TypeEnvironment();
    // Built-in functions
    this.globalEnv.define("print", "function");
  }

  public check(node: ProgramNode): void {
    const env = new TypeEnvironment(this.globalEnv);
    for (const stmt of node.body) {
      this.checkStatement(stmt, env);
    }
  }

  private checkStatement(stmt: StatementNode, env: TypeEnvironment): void {
    switch (stmt.type) {
      case "VarDecl":
        this.checkVarDecl(stmt, env);
        break;
      case "FunctionDecl":
        this.checkFunctionDecl(stmt, env);
        break;
      case "IfStatement":
        this.checkIfStatement(stmt, env);
        break;
      case "WhileStatement":
        this.checkWhileStatement(stmt, env);
        break;
      case "SwitchStatement":
        this.checkSwitchStatement(stmt, env);
        break;
      case "ReturnStatement":
        this.checkReturnStatement(stmt, env);
        break;
      case "ExpressionStatement":
        this.inferExpressionType(stmt.expression, env);
        break;
      case "RemoveStatement":
        this.checkRemoveStatement(stmt as any, env);
        break;
      default:
        throw new TypeError(`Unknown statement type: ${(stmt as ASTNode).type}`);
    }
  }

  private checkVarDecl(node: VarDeclNode, env: TypeEnvironment): void {
    let inferredType: TeraType = "undefined";

    if (node.value) {
      inferredType = this.inferExpressionType(node.value, env);
    }

    if (node.targetType) {
      if (node.value && !this.isTypeCompatible(node.targetType, inferredType)) {
        throw new TypeError(
          `Cannot assign value of type '${inferredType}' to target type '${node.targetType}' for variable '${node.identifier}'.`
        );
      }
      env.define(node.identifier, node.targetType);
    } else {
      env.define(node.identifier, inferredType);
    }
  }

  private checkFunctionDecl(node: FunctionDeclNode, env: TypeEnvironment): void {
    if (node.name) {
      env.define(node.name, "function");
    }

    const fnEnv = new TypeEnvironment(env);
    for (const param of node.params) {
      fnEnv.define(param.name, param.paramType);
    }

    if (Array.isArray(node.body)) {
      for (const stmt of node.body) {
        this.checkStatement(stmt, fnEnv);
      }
    } else {
      this.inferExpressionType(node.body, fnEnv);
    }
  }

  private checkIfStatement(node: IfStatementNode, env: TypeEnvironment): void {
    const condType = this.inferExpressionType(node.condition, env);
    if (condType !== "boolean") {
      throw new TypeError(`If statement condition must be a boolean, got '${condType}'.`);
    }

    if (Array.isArray(node.thenBranch)) {
      const thenEnv = new TypeEnvironment(env);
      for (const stmt of node.thenBranch) this.checkStatement(stmt, thenEnv);
    } else {
      this.checkStatement(node.thenBranch, env);
    }

    if (node.elseBranch) {
      if (Array.isArray(node.elseBranch)) {
        const elseEnv = new TypeEnvironment(env);
        for (const stmt of node.elseBranch) this.checkStatement(stmt, elseEnv);
      } else {
        this.checkStatement(node.elseBranch, env);
      }
    }
  }

  private checkWhileStatement(node: WhileStatementNode, env: TypeEnvironment): void {
    const condType = this.inferExpressionType(node.condition, env);
    if (condType !== "boolean") {
      throw new TypeError(`While loop condition must be a boolean, got '${condType}'.`);
    }

    if (Array.isArray(node.body)) {
      const loopEnv = new TypeEnvironment(env);
      for (const stmt of node.body) this.checkStatement(stmt, loopEnv);
    } else {
      this.checkStatement(node.body, env);
    }
  }

  private checkRemoveStatement(node: RemoveStatementNode, env: TypeEnvironment): void {
    this.inferIndexAccessType(node.target, env);
  }

  private checkSwitchStatement(node: SwitchStatementNode, env: TypeEnvironment): void {
    const discType = this.inferExpressionType(node.discriminant, env);
    for (const c of node.cases) {
      if (c.test) {
        const testType = this.inferExpressionType(c.test, env);
        if (discType !== testType) {
          throw new TypeError(
            `Switch case test type '${testType}' does not match discriminant type '${discType}'.`
          );
        }
      }
      const caseEnv = new TypeEnvironment(env);
      for (const stmt of c.consequent) {
        this.checkStatement(stmt, caseEnv);
      }
    }
  }

  private checkReturnStatement(node: ReturnStatementNode, env: TypeEnvironment): void {
    if (node.value) {
      this.inferExpressionType(node.value, env);
    }
  }

  private inferExpressionType(expr: ExpressionNode, env: TypeEnvironment): TeraType {
    switch (expr.type) {
      case "Literal":
        return this.inferLiteralType(expr);
      case "Identifier":
        return env.lookup(expr.name);
      case "BinaryExpr":
        return this.inferBinaryExprType(expr, env);
      case "UnaryExpr":
        return this.inferUnaryExprType(expr, env);
      case "CallExpr":
        return this.inferCallExprType(expr, env);
      case "ArrayLiteral":
        return this.inferArrayLiteralType(expr, env);
      case "IndexAccess":
        return this.inferIndexAccessType(expr, env);
      case "MemberExpr":
        return this.inferMemberExprType(expr, env);
      case "AssignmentExpr":
        return this.inferAssignmentExprType(expr, env);
      case "FunctionExpr": {
        const fnEnv = new TypeEnvironment(env);
        for (const param of (expr as any).params) {
          fnEnv.define(param.name, param.paramType);
        }
        if (Array.isArray((expr as any).body)) {
          for (const stmt of (expr as any).body) {
            this.checkStatement(stmt, fnEnv);
          }
        } else {
          this.inferExpressionType((expr as any).body, fnEnv);
        }
        return "function";
      }
      default:
        throw new TypeError(`Unknown expression type: ${(expr as ASTNode).type}`);
    }
  }

  private inferAssignmentExprType(node: AssignmentExprNode, env: TypeEnvironment): TeraType {
    const valueType = this.inferExpressionType(node.value, env);

    if (node.target.type === "Identifier") {
      env.assign(node.target.name, valueType);
      return valueType;
    } else if (node.target.type === "IndexAccess") {
      const targetType = this.inferIndexAccessType(node.target, env);
      if (targetType !== valueType) {
        throw new TypeError(`Cannot assign value of type '${valueType}' to array index expecting type '${targetType}'.`);
      }
      return valueType;
    } else {
      throw new TypeError(`Invalid assignment target.`);
    }
  }

  private inferMemberExprType(node: MemberExprNode, env: TypeEnvironment): TeraType {
    const objectType = this.inferExpressionType(node.object, env);

    if (objectType.startsWith("arr[")) {
      const elemType = objectType.slice(4, -1);
      if (node.property === "leng") return "int";
      if (node.property === "isEmpty") return "boolean";
      if (node.property === "first" || node.property === "last") return elemType;
      if ([
        "asString",
        "at",
        "join",
        "rmv",
        "push",
        "shift",
        "rmShift",
        "merge",
        "copyIn",
        "flat",
        "slice",
        "splice",
        "get",
        "find",
        "findIndex"
      ].includes(node.property)) {
        return "function";
      }
    }

    if (objectType === "string") {
      if (node.property === "leng") return "int";
      if (node.property === "isEmpty") return "boolean";
      if (node.property === "first" || node.property === "last") return "string";
      if (node.property === "asString") return "function";
    }

    return "undefined";
  }

  private inferLiteralType(node: LiteralNode): TeraType {
    switch (node.rawType) {
      case "number":
        return "int";
      case "string":
        return "string";
      case "boolean":
        return "boolean";
      default:
        return "undefined";
    }
  }

  private inferBinaryExprType(node: BinaryExprNode, env: TypeEnvironment): TeraType {
    const leftType = this.inferExpressionType(node.left, env);
    const rightType = this.inferExpressionType(node.right, env);

    if (["+", "-", "*", "/", "%", "**"].includes(node.operator)) {
      if (leftType === "int" && rightType === "int") return "int";
      if (node.operator === "+" && leftType === "string" && rightType === "string") return "string";
      throw new TypeError(
        `Operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'.`
      );
    }

    if (["==", "===", "!=", "<", ">", "<=", ">="].includes(node.operator)) {
      if (leftType !== rightType) {
        throw new TypeError(
          `Comparison '\({node.operator}' expects matching types, got '\){leftType}' and '${rightType}'.`
        );
      }
      return "boolean";
    }

    throw new TypeError(`Unsupported binary operator '${node.operator}'.`);
  }

  private inferUnaryExprType(node: UnaryExprNode, env: TypeEnvironment): TeraType {
    const rightType = this.inferExpressionType(node.right, env);
    if (["-", "+", "++", "--"].includes(node.operator)) {
      if (rightType === "int" || rightType === "float") {
        return rightType;
      }
    }
    throw new TypeError(`Unary operator '${node.operator}' cannot be applied to type '${rightType}'.`);
  }

  private inferCallExprType(node: CallExprNode, env: TypeEnvironment): TeraType {
    const calleeType = this.inferExpressionType(node.callee, env);
    if (calleeType !== "function") {
      throw new TypeError(`Cannot call non-function target of type '${calleeType}'.`);
    }

    for (const arg of node.arguments) {
      this.inferExpressionType(arg, env);
    }

    // Infer return types for built-in array methods
    if (node.callee.type === "MemberExpr") {
      const memberExpr = node.callee;
      const objectType = this.inferExpressionType(memberExpr.object, env);
      const prop = memberExpr.property;

      if (objectType.startsWith("arr[")) {
        const elemType = objectType.slice(4, -1);

        if (["copyIn", "merge", "flat", "slice", "splice"].includes(prop)) {
          return objectType;
        }
        if (["at", "get", "find", "rmv", "shift", "rmShift"].includes(prop)) {
          return elemType;
        }
        if (["findIndex"].includes(prop)) {
          return "int";
        }
        if (["asString", "join"].includes(prop)) {
          return "string";
        }
      }
    }

    return "undefined";
  }

  private inferArrayLiteralType(node: ArrayLiteralNode, env: TypeEnvironment): TeraType {
    if (node.elements.length === 0) return "arr[undefined]";

    const firstElemType = this.inferExpressionType(node.elements[0]!, env);
    for (let i = 1; i < node.elements.length; i++) {
      const elemType = this.inferExpressionType(node.elements[i]!, env);
      if (elemType !== firstElemType) {
        throw new TypeError(
          `Array elements must have uniform types. Found '${firstElemType}' and '${elemType}'.`
        );
      }
    }

    return `arr[${firstElemType}]`;
  }

  private inferIndexAccessType(node: IndexAccessNode, env: TypeEnvironment): TeraType {
    const objType = this.inferExpressionType(node.object, env);
    const indexType = this.inferExpressionType(node.index, env);

    if (indexType !== "int") {
      throw new TypeError(`Array index must be of type 'int', got '${indexType}'.`);
    }

    if (objType.startsWith("arr[")) {
      return objType.slice(4, -1);
    }

    throw new TypeError(`Type '${objType}' is not indexable.`);
  }

  private isTypeCompatible(target: string, inferred: string): boolean {
    if (target === inferred) return true;
    if (target === "arr[int]" && inferred === "arr[int]") return true;
    return false;
  }
}