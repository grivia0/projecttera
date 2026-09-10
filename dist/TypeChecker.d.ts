import type { ProgramNode } from "./AST.js";
export type TeraType = "int" | "string" | "boolean" | "undefined" | string;
export declare class TypeError extends Error {
    constructor(message: string);
}
export declare class TypeChecker {
    private globalEnv;
    constructor();
    check(node: ProgramNode): void;
    private checkStatement;
    private checkVarDecl;
    private checkFunctionDecl;
    private checkIfStatement;
    private checkWhileStatement;
    private checkRemoveStatement;
    private checkSwitchStatement;
    private checkReturnStatement;
    private inferExpressionType;
    private inferAssignmentExprType;
    private inferMemberExprType;
    private inferLiteralType;
    private inferBinaryExprType;
    private inferUnaryExprType;
    private inferCallExprType;
    private inferArrayLiteralType;
    private inferIndexAccessType;
    private isTypeCompatible;
}
//# sourceMappingURL=TypeChecker.d.ts.map