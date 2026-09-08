import { type Token } from "./TokenType.js";
export declare class Lexer {
    private source;
    private tokens;
    private start;
    private current;
    private line;
    private static keywords;
    constructor(source: string);
    tokenize(): Token[];
    private scanToken;
    private identifier;
    private number;
    private string;
    private advance;
    private match;
    private peek;
    private peekNext;
    private isAtEnd;
    private isDigit;
    private isAlpha;
    private isAlphaNumeric;
    private addToken;
}
//# sourceMappingURL=Lexer.d.ts.map