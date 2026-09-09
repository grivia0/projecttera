import { type Token } from "./TokenType.js";
import type { ProgramNode } from "./AST.js";
export declare class Parser {
    private tokens;
    private current;
    constructor(tokens: Token[]);
    parse(): ProgramNode;
    private statement;
    private varDeclaration;
    private functionDeclaration;
    private ifStatement;
    private whileStatement;
    private switchStatement;
    private returnStatement;
    private block;
    private expressionStatement;
    private expression;
    private assignment;
    private equality;
    private comparison;
    private term;
    private factor;
    private exponentiation;
    private unary;
    private call;
    private primary;
    private checkTypeAnnotation;
    private parseTypeAnnotation;
    private match;
    private check;
    private advance;
    private isAtEnd;
    private peek;
    private previous;
    private consume;
    private optionalSemicolon;
}
//# sourceMappingURL=Parser.d.ts.map