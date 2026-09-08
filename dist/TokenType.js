export var TokenType;
(function (TokenType) {
    // Keywords
    TokenType["LET"] = "LET";
    TokenType["FN"] = "FN";
    TokenType["IF"] = "IF";
    TokenType["ELSE"] = "ELSE";
    TokenType["WHILE"] = "WHILE";
    TokenType["SWITCH"] = "SWITCH";
    TokenType["CASE"] = "CASE";
    TokenType["DEFAULT"] = "DEFAULT";
    TokenType["BREAK"] = "BREAK";
    TokenType["RETURN"] = "RETURN";
    // Type Keywords
    TokenType["TYPE_INT"] = "TYPE_INT";
    TokenType["TYPE_STRING"] = "TYPE_STRING";
    TokenType["TYPE_BOOL"] = "TYPE_BOOL";
    TokenType["TYPE_FLOAT"] = "TYPE_FLOAT";
    TokenType["TYPE_ARR"] = "TYPE_ARR";
    // Identifiers & Literals
    TokenType["IDENTIFIER"] = "IDENTIFIER";
    TokenType["NUMBER"] = "NUMBER";
    TokenType["STRING"] = "STRING";
    TokenType["BOOLEAN"] = "BOOLEAN";
    TokenType["UNDEFINED"] = "UNDEFINED";
    // Operators
    TokenType["COLON"] = "COLON";
    TokenType["ARROW"] = "ARROW";
    TokenType["ASSIGN"] = "ASSIGN";
    TokenType["EQUALS"] = "EQUALS";
    TokenType["STRICT_EQUALS"] = "STRICT_EQUALS";
    TokenType["PLUS"] = "PLUS";
    TokenType["MINUS"] = "MINUS";
    TokenType["STAR"] = "STAR";
    TokenType["SLASH"] = "SLASH";
    TokenType["GREATER"] = "GREATER";
    TokenType["LESS"] = "LESS";
    // Delimiters
    TokenType["LPAREN"] = "LPAREN";
    TokenType["RPAREN"] = "RPAREN";
    TokenType["LBRACE"] = "LBRACE";
    TokenType["RBRACE"] = "RBRACE";
    TokenType["LBRACKET"] = "LBRACKET";
    TokenType["RBRACKET"] = "RBRACKET";
    TokenType["COMMA"] = "COMMA";
    TokenType["SEMICOLON"] = "SEMICOLON";
    TokenType["DOT"] = "DOT";
    TokenType["BACKTICK"] = "BACKTICK";
    TokenType["EOF"] = "EOF";
})(TokenType || (TokenType = {}));
//# sourceMappingURL=TokenType.js.map