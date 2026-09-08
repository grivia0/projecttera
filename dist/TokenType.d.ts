export declare enum TokenType {
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
    TYPE_INT = "TYPE_INT",
    TYPE_STRING = "TYPE_STRING",
    TYPE_BOOL = "TYPE_BOOL",
    TYPE_FLOAT = "TYPE_FLOAT",
    TYPE_ARR = "TYPE_ARR",
    IDENTIFIER = "IDENTIFIER",
    NUMBER = "NUMBER",
    STRING = "STRING",
    BOOLEAN = "BOOLEAN",
    UNDEFINED = "UNDEFINED",
    COLON = "COLON",// :
    ARROW = "ARROW",// =>
    ASSIGN = "ASSIGN",// =
    EQUALS = "EQUALS",// ==
    STRICT_EQUALS = "STRICT_EQUALS",// ===
    PLUS = "PLUS",// +
    MINUS = "MINUS",// -
    STAR = "STAR",// *
    SLASH = "SLASH",// /
    GREATER = "GREATER",// >
    LESS = "LESS",// <
    LPAREN = "LPAREN",// (
    RPAREN = "RPAREN",// )
    LBRACE = "LBRACE",// {
    RBRACE = "RBRACE",// }
    LBRACKET = "LBRACKET",// [
    RBRACKET = "RBRACKET",// ]
    COMMA = "COMMA",// ,
    SEMICOLON = "SEMICOLON",// ;
    DOT = "DOT",// .
    BACKTICK = "BACKTICK",// `
    EOF = "EOF"
}
export interface Token {
    type: TokenType;
    lexeme: string;
    value?: any;
    line: number;
}
//# sourceMappingURL=TokenType.d.ts.map