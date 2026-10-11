import type { SourceLocation } from "./TokenType.js";
import { TypeCheckError } from "./Errors.js";
import type {
  ASTNode,
  ProgramNode,
  StatementNode,
  VarDeclNode,
  FunctionDeclNode,
  IfStatementNode,
  WhileStatementNode,
  ForStatementNode,
  ForClauseStatementNode,
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

// The annotation keyword is `bool` but inferred boolean values are typed `boolean`;
// normalize so the two spellings (including inside arr[...]) compare as equal.
function normalizeType(t: string): string {
  if (t === "bool") return "boolean";
  if (t.startsWith("arr[")) return `arr[${normalizeType(t.slice(4, -1))}]`;
  return t;
}

// Signature parameters carry modifiers: `int?` is optional, `int...` takes the rest.
function stripParamModifiers(t: string): string {
  if (t.endsWith("...")) return t.slice(0, -3);
  if (t.endsWith("?")) return t.slice(0, -1);
  return t;
}

class TypeEnvironment {
  private bindings: Map<string, TeraType> = new Map();

  constructor(private parent: TypeEnvironment | null = null) {}

  public define(name: string, type: TeraType, loc?: SourceLocation): void {
    if (this.bindings.has(name)) {
      throw new TypeCheckError(`Identifier '${name}' has already been declared in this scope.`, loc);
    }
    this.bindings.set(name, type);
  }

  public assign(name: string, type: TeraType, loc?: SourceLocation): void {
    if (this.bindings.has(name)) {
      const expectedType = this.bindings.get(name)!;
      if (!this.isCompatible(expectedType, type)) {
        throw new TypeCheckError(
          `Cannot assign value of type '${type}' to variable '${name}' of type '${expectedType}'.`,
          loc
        );
      }
      return;
    }
    if (this.parent) {
      this.parent.assign(name, type, loc);
      return;
    }
    throw new TypeCheckError(`Undefined variable '${name}'.`, loc);
  }

  public lookup(name: string, loc?: SourceLocation): TeraType {
    if (this.bindings.has(name)) {
      return this.bindings.get(name)!;
    }
    if (this.parent) {
      return this.parent.lookup(name, loc);
    }
    throw new TypeCheckError(`Undefined variable '${name}'.`, loc);
  }

  private isCompatible(target: string, inferred: string): boolean {
    return normalizeType(target) === normalizeType(inferred);
  }
}

export class TypeChecker {
  private globalEnv: TypeEnvironment;
  // Declared return type of the function currently being checked (null at top level).
  private currentReturnType: TeraType | null = null;
  // Nesting depth so `break`/`continue` can be validated statically.
  private breakableDepth: number = 0;   // loops + switch
  private continuableDepth: number = 0; // loops only

  constructor() {
    this.globalEnv = new TypeEnvironment();
    // Built-in functions
    this.globalEnv.define("print", "function");
    this.globalEnv.define("input", "function");
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
      case "ForStatement":
        this.checkForStatement(stmt, env);
        break;
      case "ForClauseStatement":
        this.checkForClauseStatement(stmt, env);
        break;
      case "SwitchStatement":
        this.checkSwitchStatement(stmt, env);
        break;
      case "ReturnStatement":
        this.checkReturnStatement(stmt, env);
        break;
      case "BreakStatement":
        if (this.breakableDepth === 0) {
          throw new TypeCheckError(`'break' used outside of a loop or switch.`, stmt.loc);
        }
        break;
      case "ContinueStatement":
        if (this.continuableDepth === 0) {
          throw new TypeCheckError(`'continue' used outside of a loop.`, stmt.loc);
        }
        break;
      case "ExpressionStatement":
        this.inferExpressionType(stmt.expression, env);
        break;
      case "RemoveStatement":
        this.checkRemoveStatement(stmt, env);
        break;
      default:
        throw new TypeCheckError(`Unknown statement type: ${(stmt as ASTNode).type}`, (stmt as ASTNode).loc);
    }
  }

  private checkVarDecl(node: VarDeclNode, env: TypeEnvironment): void {
    let inferredType: TeraType = "undefined";

    if (node.value) {
      inferredType = this.inferExpressionType(node.value, env);
    }

    if (node.targetType) {
      if (node.value && !this.isTypeCompatible(node.targetType, inferredType)) {
        throw new TypeCheckError(
          `Cannot assign value of type '${inferredType}' to target type '${node.targetType}' for variable '${node.identifier}'.`,
          node.loc
        );
      }
      env.define(node.identifier, normalizeType(node.targetType), node.loc);
    } else {
      env.define(node.identifier, inferredType, node.loc);
    }
  }

  private checkFunctionDecl(node: FunctionDeclNode, env: TypeEnvironment): void {
    const returnType = node.returnType ?? "undefined";
    if (node.name) {
      env.define(node.name, this.makeSignature(node.params, returnType), node.loc);
    }

    const fnEnv = new TypeEnvironment(env);
    for (const param of node.params) {
      fnEnv.define(param.name, normalizeType(param.paramType), node.loc);
    }

    this.checkFunctionBody(node.body, returnType, fnEnv);
  }

  // Shared by named functions and inline function expressions: checks the body while
  // enforcing the declared return type and resetting loop/break context at the boundary.
  private checkFunctionBody(
    body: StatementNode[] | ExpressionNode,
    returnType: TeraType,
    fnEnv: TypeEnvironment
  ): void {
    const outerReturn = this.currentReturnType;
    const outerBreak = this.breakableDepth;
    const outerContinue = this.continuableDepth;
    this.currentReturnType = returnType;
    this.breakableDepth = 0;
    this.continuableDepth = 0;
    try {
      if (Array.isArray(body)) {
        for (const stmt of body) {
          this.checkStatement(stmt, fnEnv);
        }
      } else {
        this.inferExpressionType(body, fnEnv);
      }
    } finally {
      this.currentReturnType = outerReturn;
      this.breakableDepth = outerBreak;
      this.continuableDepth = outerContinue;
    }
  }

  private checkIfStatement(node: IfStatementNode, env: TypeEnvironment): void {
    const condType = this.inferExpressionType(node.condition, env);
    if (condType !== "boolean") {
      throw new TypeCheckError(`If statement condition must be a boolean, got '${condType}'.`, node.condition.loc);
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
      throw new TypeCheckError(`While loop condition must be a boolean, got '${condType}'.`, node.condition.loc);
    }

    this.breakableDepth++;
    this.continuableDepth++;
    try {
      if (Array.isArray(node.body)) {
        const loopEnv = new TypeEnvironment(env);
        for (const stmt of node.body) this.checkStatement(stmt, loopEnv);
      } else {
        this.checkStatement(node.body, env);
      }
    } finally {
      this.breakableDepth--;
      this.continuableDepth--;
    }
  }

  private checkForStatement(node: ForStatementNode, env: TypeEnvironment): void {
    const iterableType = this.inferExpressionType(node.iterable, env);

    if (!iterableType.startsWith("arr[")) {
      throw new TypeCheckError(`Cannot iterate over non-array type '${iterableType}'.`, node.iterable.loc);
    }

    const elementType = iterableType.slice(4, -1);
    const loopEnv = new TypeEnvironment(env);
    loopEnv.define(node.variable, elementType, node.loc);

    this.breakableDepth++;
    this.continuableDepth++;
    try {
      if (Array.isArray(node.body)) {
        for (const stmt of node.body) this.checkStatement(stmt, loopEnv);
      } else {
        this.checkStatement(node.body, loopEnv);
      }
    } finally {
      this.breakableDepth--;
      this.continuableDepth--;
    }
  }

  private checkForClauseStatement(node: ForClauseStatementNode, env: TypeEnvironment): void {
    const loopEnv = new TypeEnvironment(env);

    if (node.init) {
      if (node.init.type === "VarDecl") {
        this.checkVarDecl(node.init, loopEnv);
      } else {
        this.inferExpressionType(node.init, loopEnv);
      }
    }

    if (node.condition) {
      const condType = this.inferExpressionType(node.condition, loopEnv);
      if (condType !== "boolean") {
        throw new TypeCheckError(`For loop condition must be a boolean, got '${condType}'.`, node.condition.loc);
      }
    }

    if (node.update) {
      this.inferExpressionType(node.update, loopEnv);
    }

    this.breakableDepth++;
    this.continuableDepth++;
    try {
      if (Array.isArray(node.body)) {
        for (const stmt of node.body) this.checkStatement(stmt, loopEnv);
      } else {
        this.checkStatement(node.body, loopEnv);
      }
    } finally {
      this.breakableDepth--;
      this.continuableDepth--;
    }
  }

  private checkRemoveStatement(node: RemoveStatementNode, env: TypeEnvironment): void {
    this.inferIndexAccessType(node.target, env);
  }

  private checkSwitchStatement(node: SwitchStatementNode, env: TypeEnvironment): void {
    const discType = this.inferExpressionType(node.discriminant, env);
    this.breakableDepth++;
    try {
      for (const c of node.cases) {
        if (c.test) {
          const testType = this.inferExpressionType(c.test, env);
          if (discType !== testType) {
            throw new TypeCheckError(
              `Switch case test type '${testType}' does not match discriminant type '${discType}'.`,
              c.test.loc
            );
          }
        }
        const caseEnv = new TypeEnvironment(env);
        for (const stmt of c.consequent) {
          this.checkStatement(stmt, caseEnv);
        }
      }
    } finally {
      this.breakableDepth--;
    }
  }

  private checkReturnStatement(node: ReturnStatementNode, env: TypeEnvironment): void {
    if (this.currentReturnType === null) {
      throw new TypeCheckError(`'return' used outside of a function.`, node.loc);
    }

    const valueType: TeraType = node.value ? this.inferExpressionType(node.value, env) : "undefined";
    if (!this.isTypeCompatible(this.currentReturnType, valueType)) {
      throw new TypeCheckError(
        `Cannot return value of type '${valueType}' from a function declared to return '${this.currentReturnType}'.`,
        node.loc
      );
    }
  }

  private inferExpressionType(expr: ExpressionNode, env: TypeEnvironment): TeraType {
    switch (expr.type) {
      case "Literal":
        return this.inferLiteralType(expr);
      case "Identifier":
        return env.lookup(expr.name, expr.loc);
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
      case "Range": {
        const startType = this.inferExpressionType(expr.start, env);
        const endType = this.inferExpressionType(expr.end, env);
        if (startType !== "int" || endType !== "int") {
          throw new TypeCheckError(
            `Range bounds must be of type 'int', got '${startType}' and '${endType}'.`,
            expr.loc
          );
        }
        return "arr[int]";
      }
      case "MemberExpr":
        return this.inferMemberExprType(expr, env);
      case "AssignmentExpr":
        return this.inferAssignmentExprType(expr, env);
      case "FunctionExpr": {
        const returnType: TeraType = expr.returnType ?? "undefined";
        const fnEnv = new TypeEnvironment(env);
        for (const param of expr.params) {
          fnEnv.define(param.name, normalizeType(param.paramType), expr.loc);
        }
        this.checkFunctionBody(expr.body, returnType, fnEnv);
        return this.makeSignature(expr.params, returnType);
      }
      default:
        throw new TypeCheckError(`Unknown expression type: ${(expr as ASTNode).type}`, (expr as ASTNode).loc);
    }
  }

  private inferAssignmentExprType(node: AssignmentExprNode, env: TypeEnvironment): TeraType {
    const valueType = this.inferExpressionType(node.value, env);

    if (node.target.type === "Identifier") {
      env.assign(node.target.name, valueType, node.target.loc);
      return valueType;
    }

    if (node.target.type === "IndexAccess") {
      const targetType = this.inferIndexAccessType(node.target, env);
      if (targetType !== valueType) {
        throw new TypeCheckError(
          `Cannot assign value of type '${valueType}' to array index expecting type '${targetType}'.`,
          node.loc
        );
      }
      return valueType;
    }

    if (node.target.type === "MemberExpr") {
      // Members of the built-in types are read-only; naming the member makes the
      // message actionable (`nums.leng = 4`).
      const memberType = this.resolveMember(
        this.inferExpressionType(node.target.object, env),
        node.target.property,
        node.target.loc
      );
      throw new TypeCheckError(
        `Cannot assign to read-only member '${node.target.property}' of type '${memberType}'.`,
        node.target.loc
      );
    }

    throw new TypeCheckError(`Invalid assignment target.`, node.loc);
  }

  private inferMemberExprType(node: MemberExprNode, env: TypeEnvironment): TeraType {
    const objectType = this.inferExpressionType(node.object, env);
    return this.resolveMember(objectType, node.property, node.loc);
  }

  // Member tables for the built-in array and string types. Properties map to a plain
  // type while methods map to a signature string, so a call can be checked argument by
  // argument (`T?` marks an optional parameter and `T...` the variadic tail). An
  // unknown member is a static error, which is what keeps typos such as `nums.length`
  // or `nums.push(x)` from turning into `undefined` and blowing up later at run time.
  private arrayMembers(elemType: TeraType): Record<string, TeraType> {
    const arrayType = `arr[${elemType}]`;
    return {
      leng: "int",
      isEmpty: "boolean",
      first: elemType,
      last: elemType,
      asString: "fn()->string",
      at: `fn(int)->${elemType}`,
      get: `fn(int)->${elemType}`,
      rmv: `fn(int)->${elemType}`,
      shift: `fn()->${elemType}`,
      rmShift: `fn()->${elemType}`,
      add: `fn(${elemType},${elemType}...)->int`,
      join: "fn(string?)->string",
      find: `fn(fn(${elemType})->boolean)->${elemType}`,
      findIndex: `fn(fn(${elemType})->boolean)->int`,
      merge: `fn(${arrayType})->${arrayType}`,
      copyIn: `fn(${arrayType})->${arrayType}`,
      flat: `fn()->${arrayType}`,
      slice: `fn(int,int?)->${arrayType}`,
      splice: `fn(int,int?,${elemType}...)->${arrayType}`,
    };
  }

  private stringMembers(): Record<string, TeraType> {
    return {
      leng: "int",
      isEmpty: "boolean",
      first: "string",
      last: "string",
      asString: "fn()->string",
    };
  }

  // Reports the member table for a receiver type. Types that have no members at all
  // (int, float, bool, undefined, function values) are rejected here rather than
  // silently yielding `undefined`.
  private membersOf(objectType: TeraType, loc?: SourceLocation): Record<string, TeraType> {
    if (objectType.startsWith("arr[")) {
      return this.arrayMembers(objectType.slice(4, -1));
    }
    if (objectType === "string") {
      return this.stringMembers();
    }
    throw new TypeCheckError(`Type '${objectType}' has no members.`, loc);
  }

  private resolveMember(objectType: TeraType, property: string, loc?: SourceLocation): TeraType {
    const members = this.membersOf(objectType, loc);
    const memberType = members[property];
    if (memberType === undefined) {
      throw new TypeCheckError(
        `Type '${objectType}' has no member '${property}'. Available members: ${Object.keys(members).join(", ")}.`,
        loc
      );
    }
    return memberType;
  }

  // Checks a call against a signature string, honouring optional (`T?`) and variadic
  // (`T...`) parameters. Shared by user-defined functions and by the built-in
  // array/string methods, so argument counts and argument types are enforced for both.
  private checkCallSignature(
    calleeType: TeraType,
    argTypes: TeraType[],
    loc: SourceLocation,
    what: string
  ): TeraType {
    if (!calleeType.startsWith("fn(")) {
      throw new TypeCheckError(`Cannot call non-function target of type '${calleeType}'.`, loc);
    }

    const { params, ret } = this.parseSignature(calleeType);
    const variadic = params.length > 0 && params[params.length - 1]!.endsWith("...");
    const required = params.filter((p) => !p.endsWith("?") && !p.endsWith("...")).length;
    const maxArgs = variadic ? Number.POSITIVE_INFINITY : params.length;

    if (argTypes.length < required || argTypes.length > maxArgs) {
      throw new TypeCheckError(
        `${what} expects ${this.describeArity(required, params.length, variadic)} argument(s) but got ${argTypes.length}.`,
        loc
      );
    }

    for (let i = 0; i < argTypes.length; i++) {
      const paramType = stripParamModifiers(params[Math.min(i, params.length - 1)]!);
      if (!this.isTypeCompatible(paramType, argTypes[i]!)) {
        throw new TypeCheckError(
          `Argument ${i + 1} expects type '${paramType}' but got '${argTypes[i]}'.`,
          loc
        );
      }
    }

    return ret;
  }

  private describeArity(required: number, total: number, variadic: boolean): string {
    if (variadic) return `at least ${required}`;
    if (required !== total) return `between ${required} and ${total}`;
    return `${required}`;
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

    if (node.operator === "&&" || node.operator === "||") {
      if (leftType !== "boolean" || rightType !== "boolean") {
        throw new TypeCheckError(
          `Operator '${node.operator}' requires boolean operands, got '${leftType}' and '${rightType}'.`,
          node.loc
        );
      }
      return "boolean";
    }

    if (["+", "-", "*", "/", "%", "**"].includes(node.operator)) {
      if (leftType === "int" && rightType === "int") return "int";
      if (node.operator === "+" && leftType === "string" && rightType === "string") return "string";
      throw new TypeCheckError(
        `Operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'.`,
        node.loc
      );
    }

    if (["==", "===", "!=", "<", ">", "<=", ">="].includes(node.operator)) {
      if (leftType !== rightType) {
        throw new TypeCheckError(
          `Comparison '${node.operator}' expects matching types, got '${leftType}' and '${rightType}'.`,
          node.loc
        );
      }
      return "boolean";
    }

    throw new TypeCheckError(`Unsupported binary operator '${node.operator}'.`, node.loc);
  }

  private inferUnaryExprType(node: UnaryExprNode, env: TypeEnvironment): TeraType {
    const rightType = this.inferExpressionType(node.right, env);
    if (node.operator === "!") {
      if (rightType !== "boolean") {
        throw new TypeCheckError(
          `Unary operator '!' requires a boolean operand, got '${rightType}'.`,
          node.loc
        );
      }
      return "boolean";
    }
    if (["-", "+", "++", "--"].includes(node.operator)) {
      if (rightType === "int" || rightType === "float") {
        return rightType;
      }
    }
    throw new TypeCheckError(`Unary operator '${node.operator}' cannot be applied to type '${rightType}'.`, node.loc);
  }

  private inferCallExprType(node: CallExprNode, env: TypeEnvironment): TeraType {
    // Member calls resolve against the receiver's member table first, so every built-in
    // method is checked against its own signature before the call is accepted.
    if (node.callee.type === "MemberExpr") {
      const receiverType = this.inferExpressionType(node.callee.object, env);
      const memberType = this.resolveMember(receiverType, node.callee.property, node.callee.loc);
      const argTypes = node.arguments.map((arg) => this.inferExpressionType(arg, env));
      return this.checkCallSignature(memberType, argTypes, node.loc, `'${node.callee.property}'`);
    }

    const calleeType = this.inferExpressionType(node.callee, env);
    const argTypes = node.arguments.map((arg) => this.inferExpressionType(arg, env));

    // User-defined function: verify arity + argument types and yield its return type.
    if (calleeType.startsWith("fn(")) {
      return this.checkCallSignature(calleeType, argTypes, node.loc, "Function");
    }

    if (calleeType !== "function") {
      throw new TypeCheckError(`Cannot call non-function target of type '${calleeType}'.`, node.loc);
    }

    // `input` is the only built-in whose arguments are checked: an optional prompt
    // string, and it always evaluates to a string.
    if (node.callee.type === "Identifier" && node.callee.name === "input") {
      this.checkCallSignature("fn(string?)->string", argTypes, node.loc, "'input'");
      return "string";
    }

    // `print` accepts any number of arguments and returns nothing.
    return "undefined";
  }

  private inferArrayLiteralType(node: ArrayLiteralNode, env: TypeEnvironment): TeraType {
    if (node.elements.length === 0) return "arr[undefined]";

    const firstElemType = this.inferExpressionType(node.elements[0]!, env);
    for (let i = 1; i < node.elements.length; i++) {
      const elemType = this.inferExpressionType(node.elements[i]!, env);
      if (elemType !== firstElemType) {
        throw new TypeCheckError(
          `Array elements must have uniform types. Found '${firstElemType}' and '${elemType}'.`,
          node.loc
        );
      }
    }

    return `arr[${firstElemType}]`;
  }

  private inferIndexAccessType(node: IndexAccessNode, env: TypeEnvironment): TeraType {
    const objType = this.inferExpressionType(node.object, env);
    const indexType = this.inferExpressionType(node.index, env);

    if (indexType !== "int") {
      throw new TypeCheckError(`Array index must be of type 'int', got '${indexType}'.`, node.index.loc);
    }

    if (objType.startsWith("arr[")) {
      return objType.slice(4, -1);
    }

    throw new TypeCheckError(`Type '${objType}' is not indexable.`, node.loc);
  }

  // Encodes a function's type as a string, e.g. `fn(int,string)->bool`. Parameters may
  // carry modifiers (`T?`, `T...`) for the optional and variadic built-in methods.
  private makeSignature(params: { name: string; paramType: string }[], returnType: TeraType): string {
    return `fn(${params.map((p) => normalizeType(p.paramType)).join(",")})->${normalizeType(returnType)}`;
  }

  // Inverse of makeSignature. `lastIndexOf` keeps nested signatures such as
  // `fn(fn(int)->boolean)->int` intact.
  private parseSignature(sig: string): { params: string[]; ret: string } {
    const closed = sig.lastIndexOf(")->");
    const inner = sig.slice(3, closed);
    const ret = sig.slice(closed + 3);
    const params = inner.length === 0 ? [] : inner.split(",");
    return { params, ret };
  }

  private isTypeCompatible(target: string, inferred: string): boolean {
    return normalizeType(target) === normalizeType(inferred);
  }
}