import { TokenType, type SourceLocation, type Token } from "./TokenType.js";
import { ParseError } from "./Errors.js";
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
  RemoveStatementNode,
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
    return { type: "Program", body, loc: { line: 1, column: 1 } };
  }

  // Every AST node is anchored to the token that introduced it, so later stages can
  // report a line and column instead of just a message.
  private at(token: Token): SourceLocation {
    return { line: token.line, column: token.column };
  }

  private statement(): StatementNode {
    if (this.match(TokenType.LET)) return this.varDeclaration();
    if (this.match(TokenType.FN)) return this.functionDeclaration();
    if (this.match(TokenType.IF)) return this.ifStatement();
    if (this.match(TokenType.WHILE)) return this.whileStatement();
    if (this.match(TokenType.FOR)) return this.forStatement();
    if (this.match(TokenType.SWITCH)) return this.switchStatement();
    if (this.match(TokenType.BREAK)) {
      const keyword = this.previous();
      this.optionalSemicolon();
      return { type: "BreakStatement", loc: this.at(keyword) };
    }
    if (this.match(TokenType.CONTINUE)) {
      const keyword = this.previous();
      this.optionalSemicolon();
      return { type: "ContinueStatement", loc: this.at(keyword) };
    }
    if (this.match(TokenType.RETURN)) return this.returnStatement(this.previous());

    // Catch 'rm x[0]' statement
    if (this.check(TokenType.IDENTIFIER) && this.peek().lexeme === "rm") {
      const keyword = this.advance(); // consume "rm"
      return this.removeStatement(keyword);
    }

    return this.expressionStatement();
  }

  private removeStatement(keyword: Token): RemoveStatementNode {
    const target = this.expression();
    if (target.type !== "IndexAccess") {
      throw new ParseError(
        `Expected index access expression after 'rm', got '${target.type}'.`,
        this.at(keyword)
      );
    }
    this.optionalSemicolon();
    return {
      type: "RemoveStatement",
      target,
      loc: this.at(keyword),
    };
  }

  private varDeclaration(expectTerminator: boolean = true): VarDeclNode {
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

    if (expectTerminator) {
      this.optionalSemicolon();
    }

    return {
      type: "VarDecl",
      identifier: nameToken.lexeme,
      value,
      targetType,
      loc: this.at(nameToken),
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

    return { type: "FunctionDecl", name: nameToken.lexeme, params, returnType, body, loc: this.at(nameToken) };
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

    return { type: "IfStatement", condition, thenBranch, elseBranch, isInline, loc: condition.loc };
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

    return { type: "WhileStatement", condition, body, isInline, loc: condition.loc };
  }

  // for <ident> : <iterable> (=> stmt | { ... })
  private forStatement(): StatementNode {
    // C-style form is disambiguated by the opening parenthesis.
    if (this.check(TokenType.LPAREN)) {
      return this.forClauseStatement();
    }

    const nameToken = this.consume(TokenType.IDENTIFIER, "Expected loop variable name after 'for'.");
    this.consume(TokenType.COLON, "Expected ':' after loop variable.");
    const iterable = this.expression();
    const { body, isInline } = this.loopBody();

    return {
      type: "ForStatement",
      variable: nameToken.lexeme,
      iterable,
      body,
      isInline,
      loc: this.at(nameToken),
    };
  }

  // for ( [let decl | expr] ; [cond] ; [update] ) (=> stmt | { ... })
  private forClauseStatement(): StatementNode {
    const openParen = this.consume(TokenType.LPAREN, "Expected '(' after 'for'.");

    let init: VarDeclNode | ExpressionNode | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      init = this.match(TokenType.LET) ? this.varDeclaration(false) : this.expression();
    }
    // The initializer has to be terminated by its own ';'. The declaration parser is
    // told not to consume it (see `expectTerminator`) so a missing one is a clear
    // error instead of the condition silently swallowing the next token.
    this.consume(TokenType.SEMICOLON, "Expected ';' after for-loop initializer.");

    let condition: ExpressionNode | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      condition = this.expression();
    }
    this.consume(TokenType.SEMICOLON, "Expected ';' after for-loop condition.");

    let update: ExpressionNode | null = null;
    if (!this.check(TokenType.RPAREN)) {
      update = this.expression();
    }
    this.consume(TokenType.RPAREN, "Expected ')' after for-loop clauses.");

    const { body, isInline } = this.loopBody();
    return {
      type: "ForClauseStatement",
      init,
      condition,
      update,
      body,
      isInline,
      loc: this.at(openParen),
    };
  }

  // Shared body parser for both loop forms: inline `=> stmt` or `{ ... }`.
  private loopBody(): { body: StatementNode[] | StatementNode; isInline: boolean } {
    if (this.match(TokenType.ARROW)) {
      return { body: this.statement(), isInline: true };
    }
    this.consume(TokenType.LBRACE, "Expected '{' or '=>' before loop body.");
    return { body: this.block(), isInline: false };
  }

  private switchStatement(): SwitchStatementNode {
    this.consume(TokenType.LPAREN, "Expected '(' after 'switch'.");
    const discriminant = this.expression();
    this.consume(TokenType.RPAREN, "Expected ')' after switch value.");
    this.consume(TokenType.LBRACE, "Expected '{' before switch cases.");

    const cases: SwitchCaseNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.CASE)) {
        const caseToken = this.previous();
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
        cases.push({ type: "SwitchCase", test, consequent, loc: this.at(caseToken) });
      } else if (this.match(TokenType.DEFAULT)) {
        const defaultToken = this.previous();
        this.consume(TokenType.COLON, "Expected ':' after 'default'.");
        const consequent: StatementNode[] = [];
        while (!this.check(TokenType.CASE) && !this.check(TokenType.RBRACE)) {
          if (this.match(TokenType.BREAK)) {
            this.optionalSemicolon();
            break;
          }
          consequent.push(this.statement());
        }
        cases.push({ type: "SwitchCase", test: null, consequent, loc: this.at(defaultToken) });
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after switch cases.");
    return { type: "SwitchStatement", discriminant, cases, loc: discriminant.loc };
  }

  private returnStatement(keyword: Token): StatementNode {
    let value: ExpressionNode | undefined = undefined;
    if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RBRACE)) {
      value = this.expression();
    }
    this.optionalSemicolon();
    return { type: "ReturnStatement", value, loc: this.at(keyword) };
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
    return { type: "ExpressionStatement", expression: expr, loc: expr.loc };
  }

  private expression(): ExpressionNode {
    return this.assignment();
  }

  private assignment(): ExpressionNode {
    const expr = this.logicalOr();

    if (this.match(TokenType.ASSIGN)) {
      const equalsToken = this.previous();
      const value = this.assignment();

      if (expr.type === "Identifier" || expr.type === "MemberExpr" || expr.type === "IndexAccess") {
        return {
          type: "AssignmentExpr",
          target: expr,
          value,
          loc: this.at(equalsToken),
        };
      }

      throw new ParseError("Invalid assignment target.", this.at(equalsToken));
    }

    return expr;
  }

  private logicalOr(): ExpressionNode {
    let expr = this.logicalAnd();

    while (this.match(TokenType.OR_OR)) {
      const operator = this.previous().lexeme;
      const right = this.logicalAnd();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private logicalAnd(): ExpressionNode {
    let expr = this.range();

    while (this.match(TokenType.AND_AND)) {
      const operator = this.previous().lexeme;
      const right = this.range();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private range(): ExpressionNode {
    const expr = this.equality();

    if (this.match(TokenType.DOT_DOT)) {
      const end = this.equality();
      return { type: "Range", start: expr, end, inclusive: true, loc: expr.loc };
    }

    return expr;
  }

  private equality(): ExpressionNode {
    let expr = this.comparison();

    while (this.match(TokenType.EQUALS, TokenType.STRICT_EQUALS, TokenType.NOT_EQUALS)) {
      const operator = this.previous().lexeme;
      const right = this.comparison();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private comparison(): ExpressionNode {
    let expr = this.term();

    while (this.match(TokenType.GREATER, TokenType.LESS, TokenType.GREATER_EQUALS, TokenType.LESS_EQUALS)) {
      const operator = this.previous().lexeme;
      const right = this.term();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private term(): ExpressionNode {
    let expr = this.factor();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().lexeme;
      const right = this.factor();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private factor(): ExpressionNode {
    let expr = this.exponentiation();

    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.previous().lexeme;
      const right = this.exponentiation();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private exponentiation(): ExpressionNode {
    let expr = this.unary();

    while (this.match(TokenType.STAR_STAR)) {
      const operator = this.previous().lexeme;
      const right = this.exponentiation();
      expr = { type: "BinaryExpr", left: expr, operator, right, loc: expr.loc };
    }

    return expr;
  }

  private unary(): ExpressionNode {
    if (this.match(TokenType.MINUS, TokenType.PLUS, TokenType.PLUS_PLUS, TokenType.MINUS_MINUS, TokenType.BANG)) {
      const operatorToken = this.previous();
      const right = this.unary();
      return {
        type: "UnaryExpr",
        operator: operatorToken.lexeme,
        right,
        isPostfix: false,
        loc: this.at(operatorToken),
      };
    }

    return this.call();
  }

  private call(): ExpressionNode {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.DOT)) {
        const propToken = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'.");
        expr = { type: "MemberExpr", object: expr, property: propToken.lexeme, loc: this.at(propToken) };
      } else if (this.match(TokenType.LPAREN)) {
        const openParen = this.previous();
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.expression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')' after call arguments.");
        expr = { type: "CallExpr", callee: expr, arguments: args, loc: this.at(openParen) };
      } else if (this.match(TokenType.LBRACKET)) {
        const openBracket = this.previous();
        const index = this.expression();
        this.consume(TokenType.RBRACKET, "Expected ']' after index.");
        expr = { type: "IndexAccess", object: expr, index, loc: this.at(openBracket) };
      } else if (this.match(TokenType.PLUS_PLUS, TokenType.MINUS_MINUS)) {
        const operatorToken = this.previous();
        if (expr.type !== "Identifier" && expr.type !== "MemberExpr" && expr.type !== "IndexAccess") {
          throw new ParseError("Invalid target for increment/decrement.", this.at(operatorToken));
        }
        expr = {
          type: "UnaryExpr",
          operator: operatorToken.lexeme,
          right: expr,
          isPostfix: true,
          loc: this.at(operatorToken),
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): ExpressionNode {
    if (this.match(TokenType.NUMBER)) {
      const token = this.previous();
      return { type: "Literal", value: token.value, rawType: "number", loc: this.at(token) };
    }
    if (this.match(TokenType.STRING)) {
      const token = this.previous();
      return { type: "Literal", value: token.value, rawType: "string", loc: this.at(token) };
    }
    if (this.match(TokenType.BOOLEAN)) {
      const token = this.previous();
      return { type: "Literal", value: token.lexeme === "true", rawType: "boolean", loc: this.at(token) };
    }
    if (this.match(TokenType.UNDEFINED)) {
      return { type: "Literal", value: undefined, rawType: "undefined", loc: this.at(this.previous()) };
    }
    // A type keyword in expression position is a conversion (`int("42")`), and a conversion is
    // an ordinary call: the keyword becomes the callee and `call()` picks up the argument list.
    // Without a `(` there is nothing to convert, so the keyword is reported on its own instead
    // of turning into an undefined variable later.
    if (this.match(TokenType.TYPE_INT, TokenType.TYPE_STRING, TokenType.TYPE_BOOL, TokenType.TYPE_FLOAT)) {
      const token = this.previous();
      if (!this.check(TokenType.LPAREN)) {
        throw new ParseError(
          `'${token.lexeme}' is a type; to convert a value write ${token.lexeme}(...).`,
          this.at(token)
        );
      }
      return { type: "Identifier", name: token.lexeme, loc: this.at(token) };
    }
    if (this.match(TokenType.IDENTIFIER)) {
      const token = this.previous();
      return { type: "Identifier", name: token.lexeme, loc: this.at(token) };
    }
    if (this.match(TokenType.FN)) {
      return this.functionExpression(this.previous());
    }
    if (this.match(TokenType.LPAREN)) {
      // Grouping: `(a + b)`, `0..(n - 1)`. The inner node keeps its own contents and
      // simply reports the position of the opening parenthesis.
      const openParen = this.previous();
      const grouped = this.expression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression.");
      grouped.loc = this.at(openParen);
      return grouped;
    }
    if (this.match(TokenType.LBRACKET)) {
      const openBracket = this.previous();
      const elements: ExpressionNode[] = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.expression());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RBRACKET, "Expected ']' after array elements.");
      return { type: "ArrayLiteral", elements, loc: this.at(openBracket) };
    }

    throw new ParseError(`Unexpected ${this.describe(this.peek())}.`, this.at(this.peek()));
  }

  private functionExpression(fnToken: Token): ExpressionNode {
    this.consume(TokenType.LPAREN, "Expected '(' after 'fn'.");

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

    return { type: "FunctionExpr", params, returnType, body, loc: this.at(fnToken) };
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
    throw new ParseError(`Expected a type annotation, got ${this.describe(this.peek())}.`, this.at(this.peek()));
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
    throw new ParseError(`${message} Got ${this.describe(this.peek())}`, this.at(this.peek()));
  }

  // Human readable rendering of a token for diagnostics: end of file has no lexeme.
  private describe(token: Token): string {
    return token.type === TokenType.EOF ? "end of file" : `'${token.lexeme}'`;
  }

  private optionalSemicolon(): void {
    if (this.check(TokenType.SEMICOLON)) this.advance();
  }
}