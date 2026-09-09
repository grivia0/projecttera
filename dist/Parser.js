import { TokenType } from "./TokenType.js";
export class Parser {
    tokens;
    current = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    parse() {
        const body = [];
        while (!this.isAtEnd()) {
            body.push(this.statement());
        }
        return { type: "Program", body };
    }
    statement() {
        if (this.match(TokenType.LET))
            return this.varDeclaration();
        if (this.match(TokenType.FN))
            return this.functionDeclaration();
        if (this.match(TokenType.IF))
            return this.ifStatement();
        if (this.match(TokenType.WHILE))
            return this.whileStatement();
        if (this.match(TokenType.SWITCH))
            return this.switchStatement();
        if (this.match(TokenType.RETURN))
            return this.returnStatement();
        return this.expressionStatement();
    }
    varDeclaration() {
        const nameToken = this.consume(TokenType.IDENTIFIER, "Expected variable name.");
        let value = undefined;
        let targetType = undefined;
        if (this.match(TokenType.COLON)) {
            if (this.checkTypeAnnotation()) {
                targetType = this.parseTypeAnnotation();
            }
            else {
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
    functionDeclaration() {
        const nameToken = this.consume(TokenType.IDENTIFIER, "Expected function name.");
        this.consume(TokenType.LPAREN, "Expected '(' after function name.");
        const params = [];
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
        const body = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            body.push(this.statement());
        }
        this.consume(TokenType.RBRACE, "Expected '}' after function body.");
        return { type: "FunctionDecl", name: nameToken.lexeme, params, returnType, body };
    }
    ifStatement() {
        let isInline = false;
        if (this.match(TokenType.COLON)) {
            isInline = true;
        }
        else {
            this.consume(TokenType.LPAREN, "Expected '(' or ':' after 'if'.");
        }
        const condition = this.expression();
        if (!isInline) {
            this.consume(TokenType.RPAREN, "Expected ')' after condition.");
        }
        let thenBranch;
        if (isInline) {
            this.consume(TokenType.ARROW, "Expected '=>' in inline if statement.");
            thenBranch = this.statement();
        }
        else {
            this.consume(TokenType.LBRACE, "Expected '{' before then block.");
            thenBranch = this.block();
        }
        let elseBranch = undefined;
        if (this.match(TokenType.ELSE)) {
            if (isInline && this.match(TokenType.COLON)) {
                elseBranch = this.statement();
            }
            else if (this.match(TokenType.LBRACE)) {
                elseBranch = this.block();
            }
            else {
                elseBranch = this.statement();
            }
        }
        return { type: "IfStatement", condition, thenBranch, elseBranch, isInline };
    }
    whileStatement() {
        let isInline = false;
        if (this.match(TokenType.COLON)) {
            isInline = true;
        }
        else {
            this.consume(TokenType.LPAREN, "Expected '(' or ':' after 'while'.");
        }
        const condition = this.expression();
        if (!isInline) {
            this.consume(TokenType.RPAREN, "Expected ')' after condition.");
        }
        let body;
        if (isInline) {
            this.consume(TokenType.ARROW, "Expected '=>' in inline loop.");
            body = this.statement();
        }
        else {
            this.consume(TokenType.LBRACE, "Expected '{' before loop block.");
            body = this.block();
        }
        return { type: "WhileStatement", condition, body, isInline };
    }
    switchStatement() {
        this.consume(TokenType.LPAREN, "Expected '(' after 'switch'.");
        const discriminant = this.expression();
        this.consume(TokenType.RPAREN, "Expected ')' after switch value.");
        this.consume(TokenType.LBRACE, "Expected '{' before switch cases.");
        const cases = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.CASE)) {
                const test = this.expression();
                this.consume(TokenType.COLON, "Expected ':' after case value.");
                const consequent = [];
                while (!this.check(TokenType.CASE) && !this.check(TokenType.DEFAULT) && !this.check(TokenType.RBRACE)) {
                    if (this.match(TokenType.BREAK)) {
                        this.optionalSemicolon();
                        break;
                    }
                    consequent.push(this.statement());
                }
                cases.push({ type: "SwitchCase", test, consequent });
            }
            else if (this.match(TokenType.DEFAULT)) {
                this.consume(TokenType.COLON, "Expected ':' after 'default'.");
                const consequent = [];
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
    returnStatement() {
        let value = undefined;
        if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RBRACE)) {
            value = this.expression();
        }
        this.optionalSemicolon();
        return { type: "ReturnStatement", value };
    }
    block() {
        const statements = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            statements.push(this.statement());
        }
        this.consume(TokenType.RBRACE, "Expected '}' after block.");
        return statements;
    }
    expressionStatement() {
        const expr = this.expression();
        this.optionalSemicolon();
        return { type: "ExpressionStatement", expression: expr };
    }
    expression() {
        return this.assignment();
    }
    assignment() {
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
    equality() {
        let expr = this.comparison();
        while (this.match(TokenType.EQUALS, TokenType.STRICT_EQUALS)) {
            const operator = this.previous().lexeme;
            const right = this.comparison();
            expr = { type: "BinaryExpr", left: expr, operator, right };
        }
        return expr;
    }
    comparison() {
        let expr = this.term();
        while (this.match(TokenType.GREATER, TokenType.LESS)) {
            const operator = this.previous().lexeme;
            const right = this.term();
            expr = { type: "BinaryExpr", left: expr, operator, right };
        }
        return expr;
    }
    term() {
        let expr = this.factor();
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const operator = this.previous().lexeme;
            const right = this.factor();
            expr = { type: "BinaryExpr", left: expr, operator, right };
        }
        return expr;
    }
    factor() {
        let expr = this.exponentiation();
        while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
            const operator = this.previous().lexeme;
            const right = this.exponentiation();
            expr = { type: "BinaryExpr", left: expr, operator, right };
        }
        return expr;
    }
    exponentiation() {
        let expr = this.unary();
        while (this.match(TokenType.STAR_STAR)) {
            const operator = this.previous().lexeme;
            const right = this.exponentiation(); // Right-associative for **
            expr = { type: "BinaryExpr", left: expr, operator, right };
        }
        return expr;
    }
    unary() {
        if (this.match(TokenType.MINUS, TokenType.PLUS)) {
            const operator = this.previous().lexeme;
            const right = this.unary();
            return { type: "UnaryExpr", operator, right };
        }
        return this.call();
    }
    call() {
        let expr = this.primary();
        while (true) {
            if (this.match(TokenType.DOT)) {
                const propToken = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'.");
                expr = { type: "MemberExpr", object: expr, property: propToken.lexeme };
            }
            else if (this.match(TokenType.LPAREN)) {
                const args = [];
                if (!this.check(TokenType.RPAREN)) {
                    do {
                        args.push(this.expression());
                    } while (this.match(TokenType.COMMA));
                }
                this.consume(TokenType.RPAREN, "Expected ')' after call arguments.");
                expr = { type: "CallExpr", callee: expr, arguments: args };
            }
            else if (this.match(TokenType.LBRACKET)) {
                const index = this.expression();
                this.consume(TokenType.RBRACKET, "Expected ']' after index.");
                expr = { type: "IndexAccess", object: expr, index };
            }
            else {
                break;
            }
        }
        return expr;
    }
    primary() {
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
            const elements = [];
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
    checkTypeAnnotation() {
        const currentType = this.peek().type;
        return (currentType === TokenType.TYPE_INT ||
            currentType === TokenType.TYPE_STRING ||
            currentType === TokenType.TYPE_BOOL ||
            currentType === TokenType.TYPE_FLOAT ||
            currentType === TokenType.TYPE_ARR);
    }
    parseTypeAnnotation() {
        if (this.match(TokenType.TYPE_INT))
            return "int";
        if (this.match(TokenType.TYPE_STRING))
            return "string";
        if (this.match(TokenType.TYPE_BOOL))
            return "bool";
        if (this.match(TokenType.TYPE_FLOAT))
            return "float";
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
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    check(type) {
        if (this.isAtEnd())
            return false;
        return this.peek().type === type;
    }
    advance() {
        if (!this.isAtEnd())
            this.current++;
        return this.previous();
    }
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
    peek() {
        return this.tokens[this.current];
    }
    previous() {
        return this.tokens[this.current - 1];
    }
    consume(type, message) {
        if (this.check(type))
            return this.advance();
        throw new Error(`[Line ${this.peek().line}] ${message} Got '${this.peek().lexeme}'`);
    }
    optionalSemicolon() {
        if (this.check(TokenType.SEMICOLON))
            this.advance();
    }
}
//# sourceMappingURL=Parser.js.map