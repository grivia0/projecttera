import { type Token, TokenType } from "./TokenType.js";

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;

  private static keywords: Record<string, TokenType> = {
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

  constructor(source: string) {
    this.source = source;
  }

  public tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push({ type: TokenType.EOF, lexeme: "", line: this.line });
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
  case ".": this.addToken(TokenType.DOT); break;
  case "`": this.addToken(TokenType.BACKTICK); break;
  case "+": this.addToken(TokenType.PLUS); break;
  case "-": this.addToken(TokenType.MINUS); break;
  case "*": this.addToken(TokenType.STAR); break;

  // --- ADD THESE TWO CASES ---
  case ">":
    this.addToken(this.match("=") ? TokenType.GREATER : TokenType.GREATER); // Add GREATER_EQUAL if needed later
    break;
  case "<":
    this.addToken(this.match("=") ? TokenType.LESS : TokenType.LESS); // Add LESS_EQUAL if needed later
    break;
  // ---------------------------

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
            if (this.peek() === "\n") this.line++;
            this.advance();
          }
          this.advance(); // consume '*'
          this.advance(); // consume '/'
        } else {
          this.addToken(TokenType.SLASH);
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
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          console.error(`[Line ${this.line}] Error: Unexpected character '${c}'`);
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

    // Handle float decimals
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance(); // Consume '.'
      while (this.isDigit(this.peek())) this.advance();
    }

    const value = parseFloat(this.source.substring(this.start, this.current));
    this.addToken(TokenType.NUMBER, value);
  }

  private string(quoteType: string): void {
    while (this.peek() !== quoteType && !this.isAtEnd()) {
      if (this.peek() === "\n") this.line++;
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
  private advance(): string {
    return this.source.charAt(this.current++);
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;
    this.current++;
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
    this.tokens.push({ type, lexeme: text, value, line: this.line });
  }
}