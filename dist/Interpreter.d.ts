import type { ProgramNode } from "./AST.js";
export declare class Environment {
    private variables;
    private parent;
    constructor(parent?: Environment | null);
    define(name: string, value: any): void;
    get(name: string): any;
    assign(name: string, value: any): void;
}
export declare class Interpreter {
    private globalEnv;
    constructor();
    private setupGlobals;
    interpret(program: ProgramNode): void;
    private execute;
    private executeVarDecl;
    private executeFunctionDecl;
    private executeIfStatement;
    private executeWhileStatement;
    private executeSwitchStatement;
    private evaluate;
    private evaluateBinary;
    private evaluateUnary;
}
//# sourceMappingURL=Interpreter.d.ts.map