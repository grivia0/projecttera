export enum TokenType {
  // Keywords
  LET = "LET",
  FN = "FN",
  IF = "IF",
  ELSE = "ELSE",
  WHILE = "WHILE",
  SWITCH = "SWITCH",
  CASE = "CASE",
  DEFAULT = "DEFAULT",
  BREAK = "BREAK",
  RETURN = "RETURN",

  // Type Keywords
  TYPE_INT = "TYPE_INT",
  TYPE_STRING = "TYPE_STRING",
  TYPE_BOOL = "TYPE_BOOL",
  TYPE_FLOAT = "TYPE_FLOAT",
  TYPE_ARR = "TYPE_ARR",

  // Identifiers & Literals
  IDENTIFIER = "IDENTIFIER",
  NUMBER = "NUMBER",
  STRING = "STRING",
  BOOLEAN = "BOOLEAN",
  UNDEFINED = "UNDEFINED",

// Operators
  COLON = "COLON",           // :
  ARROW = "ARROW",           // =>
  ASSIGN = "ASSIGN",         // =
  EQUALS = "EQUALS",         // ==
  STRICT_EQUALS = "STRICT_EQUALS", // ===
  PLUS = "PLUS",             // +
  PLUS_PLUS = "PLUS_PLUS",     // ++
  MINUS = "MINUS",           // -
  MINUS_MINUS = "MINUS_MINUS", // --
  STAR = "STAR",             // *
  STAR_STAR = "STAR_STAR",     // **
  SLASH = "SLASH",           // /
  PERCENT = "PERCENT",       // %
  GREATER = "GREATER",       // >
  LESS = "LESS",             // <

  // Delimiters
  LPAREN = "LPAREN",         // (
  RPAREN = "RPAREN",         // )
  LBRACE = "LBRACE",         // {
  RBRACE = "RBRACE",         // }
  LBRACKET = "LBRACKET",     // [
  RBRACKET = "RBRACKET",     // ]
  COMMA = "COMMA",           // ,
  SEMICOLON = "SEMICOLON",   // ;
  DOT = "DOT",               // .
  BACKTICK = "BACKTICK",     // `

  EOF = "EOF"
}

export interface Token {
  type: TokenType;
  lexeme: string;
  value?: any;
  line: number;
}