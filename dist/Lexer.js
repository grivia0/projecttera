import { TokenType } from "./TokenType.js";
export class Lexer {
    source;
    tokens = [];
    start = 0;
    current = 0;
    line = 1;
    static keywords = {
        let: TokenType.LET,
        fn: TokenType.FN,
        if: TokenType.IF,
        else: TokenType.ELSE,
        while: TokenType.WHILE,
        switch: TokenType.SWITCH,
        case: TokenType.CASE,
        default: TokenType.DEFAULT,
        break: TokenType.BREAK,
        return: TokenType.RETURN,
        int: TokenType.TYPE_INT,
        string: TokenType.TYPE_STRING,
        bool: TokenType.TYPE_BOOL,
        float: TokenType.TYPE_FLOAT,
        arr: TokenType.TYPE_ARR,
        true: TokenType.BOOLEAN,
        false: TokenType.BOOLEAN,
        undefined: TokenType.UNDEFINED,
    };
    constructor(source) {
        this.source = source;
    }
    tokenize() {
        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }
        this.tokens.push({ type: TokenType.EOF, lexeme: "", line: this.line });
        return this.tokens;
    }
    scanToken() {
        const c = this.advance();
        switch (c) {
            case ":":
                this.addToken(TokenType.COLON);
                break;
            case "(":
                this.addToken(TokenType.LPAREN);
                break;
            case ")":
                this.addToken(TokenType.RPAREN);
                break;
            case "{":
                this.addToken(TokenType.LBRACE);
                break;
            case "}":
                this.addToken(TokenType.RBRACE);
                break;
            case "[":
                this.addToken(TokenType.LBRACKET);
                break;
            case "]":
                this.addToken(TokenType.RBRACKET);
                break;
            case ",":
                this.addToken(TokenType.COMMA);
                break;
            case ";":
                this.addToken(TokenType.SEMICOLON);
                break;
            case ".":
                this.addToken(TokenType.DOT);
                break;
            case "`":
                this.addToken(TokenType.BACKTICK);
                break;
            // --- Full Arithmetic Operators Support, meow! ---
            case "+":
                this.addToken(this.match("+") ? TokenType.PLUS_PLUS : TokenType.PLUS);
                break;
            case "-":
                this.addToken(this.match("-") ? TokenType.MINUS_MINUS : TokenType.MINUS);
                break;
            case "*":
                this.addToken(this.match("*") ? TokenType.STAR_STAR : TokenType.STAR);
                break;
            case "%":
                this.addToken(TokenType.PERCENT);
                break;
            // ------------------------------------------------
            case ">":
                this.addToken(this.match("=") ? TokenType.GREATER : TokenType.GREATER);
                break;
            case "<":
                this.addToken(this.match("=") ? TokenType.LESS : TokenType.LESS);
                break;
            case "=":
                if (this.match(">")) {
                    this.addToken(TokenType.ARROW); // =>
                }
                else if (this.match("=")) {
                    if (this.match("=")) {
                        this.addToken(TokenType.STRICT_EQUALS); // ===
                    }
                    else {
                        this.addToken(TokenType.EQUALS); // ==
                    }
                }
                else {
                    this.addToken(TokenType.ASSIGN); // =
                }
                break;
            case "/":
                if (this.match("/")) {
                    // Single-line comment: ignore until end of line
                    while (this.peek() !== "\n" && !this.isAtEnd())
                        this.advance();
                }
                else if (this.match("*")) {
                    // Multi-line comment: ignore until */
                    while (!(this.peek() === "*" && this.peekNext() === "/") && !this.isAtEnd()) {
                        if (this.peek() === "\n")
                            this.line++;
                        this.advance();
                    }
                    this.advance(); // consume '*'
                    this.advance(); // consume '/'
                }
                else {
                    this.addToken(TokenType.SLASH); // Division operator, meow!
                }
                break;
            case " ":
            case "\r":
            case "\t":
                break; // Ignore whitespace
            case "\n":
                this.line++;
                break;
            case '"':
            case "'":
                this.string(c);
                break;
            default:
                if (this.isDigit(c)) {
                    this.number();
                }
                else if (this.isAlpha(c)) {
                    this.identifier();
                }
                else {
                    console.error(`[Line ${this.line}] Error: Unexpected character '${c}'`);
                }
                break;
        }
    }
    identifier() {
        while (this.isAlphaNumeric(this.peek()))
            this.advance();
        const text = this.source.substring(this.start, this.current);
        const type = Lexer.keywords[text] || TokenType.IDENTIFIER;
        this.addToken(type);
    }
    number() {
        while (this.isDigit(this.peek()))
            this.advance();
        // Handle float decimals
        if (this.peek() === "." && this.isDigit(this.peekNext())) {
            this.advance(); // Consume '.'
            while (this.isDigit(this.peek()))
                this.advance();
        }
        const value = parseFloat(this.source.substring(this.start, this.current));
        this.addToken(TokenType.NUMBER, value);
    }
    string(quoteType) {
        while (this.peek() !== quoteType && !this.isAtEnd()) {
            if (this.peek() === "\n")
                this.line++;
            this.advance();
        }
        if (this.isAtEnd()) {
            console.error(`[Line ${this.line}] Error: Unterminated string.`);
            return;
        }
        this.advance(); // The closing quote
        const value = this.source.substring(this.start + 1, this.current - 1);
        this.addToken(TokenType.STRING, value);
    }
    // Helpers
    advance() {
        return this.source.charAt(this.current++);
    }
    match(expected) {
        if (this.isAtEnd())
            return false;
        if (this.source.charAt(this.current) !== expected)
            return false;
        this.current++;
        return true;
    }
    peek() {
        if (this.isAtEnd())
            return "\0";
        return this.source.charAt(this.current);
    }
    peekNext() {
        if (this.current + 1 >= this.source.length)
            return "\0";
        return this.source.charAt(this.current + 1);
    }
    isAtEnd() {
        return this.current >= this.source.length;
    }
    isDigit(c) {
        return c >= "0" && c <= "9";
    }
    isAlpha(c) {
        return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
    }
    isAlphaNumeric(c) {
        return this.isAlpha(c) || this.isDigit(c);
    }
    addToken(type, value) {
        const text = this.source.substring(this.start, this.current);
        this.tokens.push({ type, lexeme: text, value, line: this.line });
    }
}
//# sourceMappingURL=Lexer.js.map