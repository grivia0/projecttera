// Base AST Node
export interface ASTNode {
  type: string;
}

// Program Root
export interface ProgramNode extends ASTNode {
  type: "Program";
  body: StatementNode[];
}

// Statement Types
export type StatementNode =
  | VarDeclNode
  | FunctionDeclNode
  | IfStatementNode
  | WhileStatementNode
  | ForStatementNode
  | ForClauseStatementNode
  | SwitchStatementNode
  | ExpressionStatementNode
  | RemoveStatementNode
  | BreakStatementNode
  | ContinueStatementNode
  | ReturnStatementNode;

export interface VarDeclNode extends ASTNode {
  type: "VarDecl";
  identifier: string;
  value?: ExpressionNode | undefined;
  targetType?: string | undefined; // e.g., "int", "arr[int]"
}

export interface FunctionDeclNode extends ASTNode {
  type: "FunctionDecl";
  name?: string | undefined; // Optional for inline expression functions
  params: { name: string; paramType: string }[];
  returnType?: string | undefined;
  body: StatementNode[] | ExpressionNode; // Supports both block body and inline arrow expression
}

export interface IfStatementNode extends ASTNode {
  type: "IfStatement";
  condition: ExpressionNode;
  thenBranch: StatementNode[] | StatementNode;
  elseBranch?: StatementNode[] | StatementNode | undefined;
  isInline: boolean;
}

export interface WhileStatementNode extends ASTNode {
  type: "WhileStatement";
  condition: ExpressionNode;
  body: StatementNode[] | StatementNode;
  isInline: boolean;
}

// Native for-loop: `for x: <iterable> { ... }` or `for i: 0..10 => stmt`
export interface ForStatementNode extends ASTNode {
  type: "ForStatement";
  variable: string;
  iterable: ExpressionNode;
  body: StatementNode[] | StatementNode;
  isInline: boolean;
}

// C-style for-loop: `for (let i: 0 => int; i < 10; i++) { ... }`
export interface ForClauseStatementNode extends ASTNode {
  type: "ForClauseStatement";
  init: VarDeclNode | ExpressionNode | null;
  condition: ExpressionNode | null;
  update: ExpressionNode | null;
  body: StatementNode[] | StatementNode;
  isInline: boolean;
}

export interface SwitchCaseNode extends ASTNode {
  type: "SwitchCase";
  test: ExpressionNode | null; // null for default case
  consequent: StatementNode[];
}

export interface SwitchStatementNode extends ASTNode {
  type: "SwitchStatement";
  discriminant: ExpressionNode;
  cases: SwitchCaseNode[];
}

export interface ReturnStatementNode extends ASTNode {
  type: "ReturnStatement";
  value?: ExpressionNode | undefined;
}

// Exits the innermost enclosing loop (or switch).
export interface BreakStatementNode extends ASTNode {
  type: "BreakStatement";
}

// Skips to the next iteration of the innermost enclosing loop.
export interface ContinueStatementNode extends ASTNode {
  type: "ContinueStatement";
}

export interface ExpressionStatementNode extends ASTNode {
  type: "ExpressionStatement";
  expression: ExpressionNode;
}

export interface RemoveStatementNode extends ASTNode {
  type: "RemoveStatement";
  target: IndexAccessNode;
}

// Expression Types
export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryExprNode
  | UnaryExprNode 
  | MemberExprNode
  | CallExprNode
  | AssignmentExprNode
  | ArrayLiteralNode
  | FunctionExprNode
  | IndexAccessNode
  | RangeNode;

export interface LiteralNode extends ASTNode {
  type: "Literal";
  value: any;
  rawType: "number" | "string" | "boolean" | "undefined";
}

export interface IdentifierNode extends ASTNode {
  type: "Identifier";
  name: string;
}

export interface BinaryExprNode extends ASTNode {
  type: "BinaryExpr";
  left: ExpressionNode;
  operator: string;
  right: ExpressionNode;
}

export interface UnaryExprNode extends ASTNode {
  type: "UnaryExpr";
  operator: string;
  right: ExpressionNode;
  isPostfix?: boolean; // true if postfix (x++), false/undefined if prefix (++x)
}

export interface FunctionExprNode extends ASTNode {
  type: "FunctionExpr";
  params: { name: string; paramType: string }[];
  returnType?: string | undefined;
  body: StatementNode[] | ExpressionNode;
}

export interface CallExprNode extends ASTNode {
  type: "CallExpr";
  callee: ExpressionNode;
  arguments: ExpressionNode[];
}

export interface ArrayLiteralNode extends ASTNode {
  type: "ArrayLiteral";
  elements: ExpressionNode[];
}

export interface IndexAccessNode extends ASTNode {
  type: "IndexAccess";
  object: ExpressionNode;
  index: ExpressionNode;
}

// Numeric range literal, e.g. `0..10` (inclusive). Evaluates to an array of ints.
export interface RangeNode extends ASTNode {
  type: "Range";
  start: ExpressionNode;
  end: ExpressionNode;
  inclusive: boolean;
}

export interface MemberExprNode extends ASTNode {
  type: "MemberExpr";
  object: ExpressionNode;
  property: string;
}

export interface AssignmentExprNode extends ASTNode {
  type: "AssignmentExpr";
  target: IdentifierNode | MemberExprNode | IndexAccessNode;
  value: ExpressionNode;
}