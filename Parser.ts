import { TokenType, type Token } from "./TokenType.js";
import type {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  VarDeclNode,
  IfStatementNode,
  WhileStatementNode,
  SwitchStatementNode,
  SwitchCaseNode,
  FunctionDeclNode,
} from "./AST.js";

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): ProgramNode {
    const body: StatementNode[] = [];
    while (!this.isAtEnd()) {
      body.push(this.statement());
    }
    return { type: "Program", body };
  }

  private statement(): StatementNode {
    if (this.match(TokenType.LET)) return this.varDeclaration();
    if (this.match(TokenType.FN)) return this.functionDeclaration();
    if (this.match(TokenType.IF)) return this.ifStatement();
    if (this.match(TokenType.WHILE)) return this.whileStatement();
    if (this.match(TokenType.SWITCH)) return this.switchStatement();
    if (this.match(TokenType.RETURN)) return this.returnStatement();

    return this.expressionStatement();
  }

  private varDeclaration(): VarDeclNode {
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expected variable name.");
    let value: ExpressionNode | undefined = undefined;
    let targetType: string | undefined = undefined;

    if (this.match(TokenType.COLON)) {
      if (this.checkTypeAnnotation()) {
        targetType = this.parseTypeAnnotation();
      } else {
        value = this.expression();
        if (this.match(TokenType.ARROW)) {
          targetType = this.parseTypeAnnotation();
        }
      }
    }

    this.optionalSemicolon();
    return {
      type: "VarDecl",
      identifier: nameToken.lexeme,
      value,
      targetType,
    };
  }

  private functionDeclaration(): FunctionDeclNode {
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expected function name.");
    this.consume(TokenType.LPAREN, "Expected '(' after function name.");

    const params: { name: string; paramType: string }[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        const pName = this.consume(TokenType.IDENTIFIER, "Expected parameter name.").lexeme;
        this.consume(TokenType.COLON, "Expected ':' after parameter name.");
        const pType = this.parseTypeAnnotation();
        params.push({ name: pName, paramType: pType });
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RPAREN, "Expected ')' after parameters.");

    this.consume(TokenType.ARROW, "Expected '=>' before return type.");
    const returnType = this.parseTypeAnnotation();

    this.consume(TokenType.LBRACE, "Expected '{' before function body.");
    const body: StatementNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.statement());
    }
    this.consume(TokenType.RBRACE, "Expected '}' after function body.");

    return { type: "FunctionDecl", name: nameToken.lexeme, params, returnType, body };
  }

  private ifStatement(): IfStatementNode {
    let isInline = false;

    if (this.match(TokenType.COLON)) {
      isInline = true;
    } else {
      this.consume(TokenType.LPAREN, "Expected '(' or ':' after 'if'.");
    }

    const condition = this.expression();

    if (!isInline) {
      this.consume(TokenType.RPAREN, "Expected ')' after condition.");
    }

    let thenBranch: StatementNode[] | StatementNode;
    if (isInline) {
      this.consume(TokenType.ARROW, "Expected '=>' in inline if statement.");
      thenBranch = this.statement();
    } else {
      this.consume(TokenType.LBRACE, "Expected '{' before then block.");
      thenBranch = this.block();
    }

    let elseBranch: StatementNode[] | StatementNode | undefined = undefined;
    if (this.match(TokenType.ELSE)) {
      if (isInline && this.match(TokenType.COLON)) {
        elseBranch = this.statement();
      } else if (this.match(TokenType.LBRACE)) {
        elseBranch = this.block();
      } else {
        elseBranch = this.statement();
      }
    }

    return { type: "IfStatement", condition, thenBranch, elseBranch, isInline };
  }

  private whileStatement(): WhileStatementNode {
    let isInline = false;

    if (this.match(TokenType.COLON)) {
      isInline = true;
    } else {
      this.consume(TokenType.LPAREN, "Expected '(' or ':' after 'while'.");
    }

    const condition = this.expression();

    if (!isInline) {
      this.consume(TokenType.RPAREN, "Expected ')' after condition.");
    }

    let body: StatementNode[] | StatementNode;
    if (isInline) {
      this.consume(TokenType.ARROW, "Expected '=>' in inline loop.");
      body = this.statement();
    } else {
      this.consume(TokenType.LBRACE, "Expected '{' before loop block.");
      body = this.block();
    }

    return { type: "WhileStatement", condition, body, isInline };
  }

  private switchStatement(): SwitchStatementNode {
    this.consume(TokenType.LPAREN, "Expected '(' after 'switch'.");
    const discriminant = this.expression();
    this.consume(TokenType.RPAREN, "Expected ')' after switch value.");
    this.consume(TokenType.LBRACE, "Expected '{' before switch cases.");

    const cases: SwitchCaseNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.CASE)) {
        const test = this.expression();
        this.consume(TokenType.COLON, "Expected ':' after case value.");
        const consequent: StatementNode[] = [];
        while (!this.check(TokenType.CASE) && !this.check(TokenType.DEFAULT) && !this.check(TokenType.RBRACE)) {
          if (this.match(TokenType.BREAK)) {
            this.optionalSemicolon();
            break;
          }
          consequent.push(this.statement());
        }
        cases.push({ type: "SwitchCase", test, consequent });
      } else if (this.match(TokenType.DEFAULT)) {
        this.consume(TokenType.COLON, "Expected ':' after 'default'.");
        const consequent: StatementNode[] = [];
        while (!this.check(TokenType.CASE) && !this.check(TokenType.RBRACE)) {
          if (this.match(TokenType.BREAK)) {
            this.optionalSemicolon();
            break;
          }
          consequent.push(this.statement());
        }
        cases.push({ type: "SwitchCase", test: null, consequent });
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after switch cases.");
    return { type: "SwitchStatement", discriminant, cases };
  }

  private returnStatement(): StatementNode {
    let value: ExpressionNode | undefined = undefined;
    if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RBRACE)) {
      value = this.expression();
    }
    this.optionalSemicolon();
    return { type: "ReturnStatement", value };
  }

  private block(): StatementNode[] {
    const statements: StatementNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      statements.push(this.statement());
    }
    this.consume(TokenType.RBRACE, "Expected '}' after block.");
    return statements;
  }

  private expressionStatement(): StatementNode {
    const expr = this.expression();
    this.optionalSemicolon();
    return { type: "ExpressionStatement", expression: expr };
  }

  private expression(): ExpressionNode {
    return this.assignment();
  }

  private assignment(): ExpressionNode {
    const expr = this.equality();

    if (this.match(TokenType.ASSIGN)) {
      const equalsToken = this.previous();
      const value = this.assignment();

      if (expr.type === "Identifier" || expr.type === "MemberExpr" || expr.type === "IndexAccess") {
        return {
          type: "AssignmentExpr",
          target: expr,
          value,
        };
      }

      throw new Error(`[Line ${equalsToken.line}] Invalid assignment target.`);
    }

    return expr;
  }

  private equality(): ExpressionNode {
    let expr = this.comparison();

    while (this.match(TokenType.EQUALS, TokenType.STRICT_EQUALS)) {
      const operator = this.previous().lexeme;
      const right = this.comparison();
      expr = { type: "BinaryExpr", left: expr, operator, right };
    }

    return expr;
  }

  private comparison(): ExpressionNode {
    let expr = this.term();

    while (this.match(TokenType.GREATER, TokenType.LESS)) {
      const operator = this.previous().lexeme;
      const right = this.term();
      expr = { type: "BinaryExpr", left: expr, operator, right };
    }

    return expr;
  }

  private term(): ExpressionNode {
    let expr = this.factor();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().lexeme;
      const right = this.factor();
      expr = { type: "BinaryExpr", left: expr, operator, right };
    }

    return expr;
  }

  private factor(): ExpressionNode {
    let expr = this.exponentiation();

    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.previous().lexeme;
      const right = this.exponentiation();
      expr = { type: "BinaryExpr", left: expr, operator, right };
    }

    return expr;
  }

  private exponentiation(): ExpressionNode {
    let expr = this.unary();

    while (this.match(TokenType.STAR_STAR)) {
      const operator = this.previous().lexeme;
      const right = this.exponentiation(); // Right-associative for **
      expr = { type: "BinaryExpr", left: expr, operator, right };
    }

    return expr;
  }

  private unary(): ExpressionNode {
    if (this.match(TokenType.MINUS, TokenType.PLUS, TokenType.PLUS_PLUS, TokenType.MINUS_MINUS)) {
      const operator = this.previous().lexeme;
      const right = this.unary();
      return { type: "UnaryExpr", operator, right, isPostfix: false };
    }

    return this.call();
  }

  private call(): ExpressionNode {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.DOT)) {
        const propToken = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'.");
        expr = { type: "MemberExpr", object: expr, property: propToken.lexeme };
      } else if (this.match(TokenType.LPAREN)) {
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.expression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')' after call arguments.");
        expr = { type: "CallExpr", callee: expr, arguments: args };
      } else if (this.match(TokenType.LBRACKET)) {
        const index = this.expression();
        this.consume(TokenType.RBRACKET, "Expected ']' after index.");
        expr = { type: "IndexAccess", object: expr, index };
      } else if (this.match(TokenType.PLUS_PLUS, TokenType.MINUS_MINUS)) {
        const operator = this.previous().lexeme;
        if (expr.type !== "Identifier" && expr.type !== "MemberExpr" && expr.type !== "IndexAccess") {
          throw new Error(`[Parser Error] Invalid target for increment/decrement.`);
        }
        expr = { type: "UnaryExpr", operator, right: expr, isPostfix: true };
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): ExpressionNode {
    if (this.match(TokenType.NUMBER)) {
      return { type: "Literal", value: this.previous().value, rawType: "number" };
    }
    if (this.match(TokenType.STRING)) {
      return { type: "Literal", value: this.previous().value, rawType: "string" };
    }
    if (this.match(TokenType.BOOLEAN)) {
      return { type: "Literal", value: this.previous().lexeme === "true", rawType: "boolean" };
    }
    if (this.match(TokenType.UNDEFINED)) {
      return { type: "Literal", value: undefined, rawType: "undefined" };
    }
    if (this.match(TokenType.IDENTIFIER)) {
      return { type: "Identifier", name: this.previous().lexeme };
    }
    if (this.match(TokenType.LBRACKET)) {
      const elements: ExpressionNode[] = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.expression());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RBRACKET, "Expected ']' after array elements.");
      return { type: "ArrayLiteral", elements };
    }

    throw new Error(`[Parser Error] Unexpected token '${this.peek().lexeme}' on line ${this.peek().line}`);
  }

  private checkTypeAnnotation(): boolean {
    const currentType = this.peek().type;
    return (
      currentType === TokenType.TYPE_INT ||
      currentType === TokenType.TYPE_STRING ||
      currentType === TokenType.TYPE_BOOL ||
      currentType === TokenType.TYPE_FLOAT ||
      currentType === TokenType.TYPE_ARR
    );
  }

  private parseTypeAnnotation(): string {
    if (this.match(TokenType.TYPE_INT)) return "int";
    if (this.match(TokenType.TYPE_STRING)) return "string";
    if (this.match(TokenType.TYPE_BOOL)) return "bool";
    if (this.match(TokenType.TYPE_FLOAT)) return "float";
    if (this.match(TokenType.TYPE_ARR)) {
      if (this.match(TokenType.LBRACKET)) {
        const subType = this.parseTypeAnnotation();
        this.consume(TokenType.RBRACKET, "Expected ']' after array sub-type.");
        return `arr[${subType}]`;
      }
      return "arr";
    }
    if (this.check(TokenType.IDENTIFIER)) {
      return this.advance().lexeme;
    }
    throw new Error(`[Parser Error] Expected type annotation on line ${this.peek().line}`);
  }

  // Helpers
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`[Line ${this.peek().line}] ${message} Got '${this.peek().lexeme}'`);
  }

  private optionalSemicolon(): void {
    if (this.check(TokenType.SEMICOLON)) this.advance();
  }
}