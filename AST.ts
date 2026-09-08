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
  | SwitchStatementNode
  | ExpressionStatementNode
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

export interface ExpressionStatementNode extends ASTNode {
  type: "ExpressionStatement";
  expression: ExpressionNode;
}

// Expression Types
export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryExprNode
  | MemberExprNode
  | CallExprNode
  | AssignmentExprNode
  | ArrayLiteralNode
  | IndexAccessNode;

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

export interface MemberExprNode {
  type: "MemberExpr";
  object: ExpressionNode;
  property: string;
}

export interface AssignmentExprNode extends ASTNode {
  type: "AssignmentExpr";
  target: IdentifierNode | MemberExprNode | IndexAccessNode;
  value: ExpressionNode;
}