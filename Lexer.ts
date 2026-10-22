import { type SourceLocation, type Token, TokenType } from "./TokenType.js";
import { LexerError } from "./Errors.js";
import { INT_MAX, INT_MIN } from "./Numeric.js";

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 1;
  // Position of the first character of the token being scanned, used to anchor
  // both the token and any diagnostic reported for it.
  private startLine: number = 1;
  private startColumn: number = 1;

  private static keywords: Record<string, TokenType> = {
    let: TokenType.LET,
    fn: TokenType.FN,
    if: TokenType.IF,
    else: TokenType.ELSE,
    while: TokenType.WHILE,
    for: TokenType.FOR,
    switch: TokenType.SWITCH,
    case: TokenType.CASE,
    default: TokenType.DEFAULT,
    break: TokenType.BREAK,
    continue: TokenType.CONTINUE,
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

  constructor(source: string) {
    this.source = source;
  }

  public tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startLine = this.line;
      this.startColumn = this.column;
      this.scanToken();
    }

    this.tokens.push({ type: TokenType.EOF, lexeme: "", line: this.line, column: this.column });
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      case ":": this.addToken(TokenType.COLON); break;
      case "(": this.addToken(TokenType.LPAREN); break;
      case ")": this.addToken(TokenType.RPAREN); break;
      case "{": this.addToken(TokenType.LBRACE); break;
      case "}": this.addToken(TokenType.RBRACE); break;
      case "[": this.addToken(TokenType.LBRACKET); break;
      case "]": this.addToken(TokenType.RBRACKET); break;
      case ",": this.addToken(TokenType.COMMA); break;
      case ";": this.addToken(TokenType.SEMICOLON); break;
      case ".":
        this.addToken(this.match(".") ? TokenType.DOT_DOT : TokenType.DOT);
        break;
      case "`": this.addToken(TokenType.BACKTICK); break;
      
      // --- Full Arithmetic Operators Support
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
        this.addToken(this.match("=") ? TokenType.GREATER_EQUALS : TokenType.GREATER); 
        break;
      case "<":
        this.addToken(this.match("=") ? TokenType.LESS_EQUALS : TokenType.LESS); 
        break;

      // --- Logical & Negation Operators
      case "!":
        this.addToken(this.match("=") ? TokenType.NOT_EQUALS : TokenType.BANG);
        break;
      case "&":
        if (this.match("&")) {
          this.addToken(TokenType.AND_AND);
        } else {
          throw new LexerError("Unexpected character '&' (did you mean '&&'?)", this.location());
        }
        break;
      case "|":
        if (this.match("|")) {
          this.addToken(TokenType.OR_OR);
        } else {
          throw new LexerError("Unexpected character '|' (did you mean '||'?)", this.location());
        }
        break;

      case "=":
        if (this.match(">")) {
          this.addToken(TokenType.ARROW); // =>
        } else if (this.match("=")) {
          if (this.match("=")) {
            this.addToken(TokenType.STRICT_EQUALS); // ===
          } else {
            this.addToken(TokenType.EQUALS); // ==
          }
        } else {
          this.addToken(TokenType.ASSIGN); // =
        }
        break;

      case "/":
        if (this.match("/")) {
          // Single-line comment: ignore until end of line
          while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
        } else if (this.match("*")) {
          // Multi-line comment: ignore until */
          while (!(this.peek() === "*" && this.peekNext() === "/") && !this.isAtEnd()) {
            this.advance();
          }
          this.advance(); // consume '*'
          this.advance(); // consume '/'
        } else {
          this.addToken(TokenType.SLASH); // Division operator
        }
        break;

      case " ":
      case "\r":
      case "\t":
        break; // Ignore whitespace

      case "\n":
        // `advance` already moved the cursor to the next line.
        break;

      case '"':
      case "'":
        this.string(c);
        break;

      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          throw new LexerError(`Unexpected character '${c}'.`, this.location());
        }
        break;
    }
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) this.advance();

    const text = this.source.substring(this.start, this.current);
    const type = Lexer.keywords[text] || TokenType.IDENTIFIER;
    this.addToken(type);
  }

  private number(): void {
    while (this.isDigit(this.peek())) this.advance();

    // A fraction is what makes the literal a float: `1.5` is a different type from `1`. The
    // token itself stays a plain number — the parser reads the spelling back to decide the
    // type (see `Parser.primary`) — so `isFloat` is only needed for the range check below.
    let isFloat = false;
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      isFloat = true;
      this.advance(); // Consume '.'
      while (this.isDigit(this.peek())) this.advance();
    }

    const text = this.source.substring(this.start, this.current);
    const value = parseFloat(text);

    // An int literal has to be exactly representable (decision D13). `parseFloat` would quietly
    // round 9007199254740993 to 9007199254740992, and a program whose own literals already lie
    // cannot be made honest later.
    if (!isFloat && !Number.isSafeInteger(value)) {
      throw new LexerError(
        `Integer literal '${text}' is outside the Tera int range (${INT_MIN} to ${INT_MAX}).`,
        this.location()
      );
    }

    this.addToken(TokenType.NUMBER, value);
  }

  private string(quoteType: string): void {
    while (this.peek() !== quoteType && !this.isAtEnd()) {
      this.advance();
    }

    if (this.isAtEnd()) {
      throw new LexerError("Unterminated string literal.", this.location());
    }

    this.advance(); // The closing quote
    const value = this.source.substring(this.start + 1, this.current - 1);
    this.addToken(TokenType.STRING, value);
  }

  // Helpers
  private advance(): string {
    const c = this.source.charAt(this.current++);
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return c;
  }

  // Position of the token currently being scanned (its first character).
  private location(): SourceLocation {
    return { line: this.startLine, column: this.startColumn };
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;
    // `match` consumes a character directly (it is used for two-character tokens such as
    // `=>`, `==`, `&&`, `..` and for comment markers), so the position bookkeeping has
    // to happen here too. Without this the columns of every following token drift by one
    // character per two-character token.
    const c = this.source.charAt(this.current);
    this.current++;
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return "\0";
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return "\0";
    return this.source.charAt(this.current + 1);
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private addToken(type: TokenType, value?: any): void {
    const text = this.source.substring(this.start, this.current);
    // Anchor the token at its first character so diagnostics can point at the start
    // of a multi-character token instead of wherever scanning happened to end.
    this.tokens.push({ type, lexeme: text, value, line: this.startLine, column: this.startColumn });
  }
}