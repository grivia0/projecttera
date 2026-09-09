export class Environment {
    variables = new Map();
    parent = null;
    constructor(parent = null) {
        this.parent = parent;
    }
    define(name, value) {
        this.variables.set(name, value);
    }
    get(name) {
        if (this.variables.has(name)) {
            return this.variables.get(name);
        }
        if (this.parent) {
            return this.parent.get(name);
        }
        throw new Error(`[Runtime Error] Undefined variable '${name}'`);
    }
    assign(name, value) {
        if (this.variables.has(name)) {
            this.variables.set(name, value);
            return;
        }
        if (this.parent) {
            this.parent.assign(name, value);
            return;
        }
        throw new Error(`[Runtime Error] Cannot assign to undefined variable '${name}'`);
    }
}
class ReturnValue {
    value;
    constructor(value) {
        this.value = value;
    }
}
export class Interpreter {
    globalEnv;
    constructor() {
        this.globalEnv = new Environment();
        this.setupGlobals();
    }
    setupGlobals() {
        // Built-in print statement / global function
        this.globalEnv.define("print", (...args) => {
            console.log(...args);
        });
    }
    interpret(program) {
        try {
            for (const statement of program.body) {
                this.execute(statement, this.globalEnv);
            }
        }
        catch (err) {
            if (err instanceof ReturnValue) {
                return;
            }
            throw err;
        }
    }
    execute(stmt, env) {
        switch (stmt.type) {
            case "VarDecl":
                this.executeVarDecl(stmt, env);
                break;
            case "FunctionDecl":
                this.executeFunctionDecl(stmt, env);
                break;
            case "IfStatement":
                this.executeIfStatement(stmt, env);
                break;
            case "WhileStatement":
                this.executeWhileStatement(stmt, env);
                break;
            case "SwitchStatement":
                this.executeSwitchStatement(stmt, env);
                break;
            case "ReturnStatement":
                const retValue = stmt.value ? this.evaluate(stmt.value, env) : undefined;
                throw new ReturnValue(retValue);
            case "ExpressionStatement":
                this.evaluate(stmt.expression, env);
                break;
            default:
                throw new Error(`[Runtime Error] Unknown statement type: ${stmt.type}`);
        }
    }
    executeVarDecl(node, env) {
        const value = node.value ? this.evaluate(node.value, env) : undefined;
        env.define(node.identifier, value);
    }
    executeFunctionDecl(node, env) {
        if (!node.name) {
            throw new Error("[Runtime Error] Anonymous function declaration missing name");
        }
        const fnClosure = (...args) => {
            const fnEnv = new Environment(env);
            for (let i = 0; i < node.params.length; i++) {
                fnEnv.define(node.params[i].name, args[i]);
            }
            try {
                if (Array.isArray(node.body)) {
                    for (const stmt of node.body) {
                        this.execute(stmt, fnEnv);
                    }
                }
                else {
                    // If body is a single expression (lambda/inline style)
                    return this.evaluate(node.body, fnEnv);
                }
            }
            catch (err) {
                if (err instanceof ReturnValue) {
                    return err.value;
                }
                throw err;
            }
            return undefined;
        };
        env.define(node.name, fnClosure);
    }
    executeIfStatement(node, env) {
        const condValue = this.evaluate(node.condition, env);
        if (condValue) {
            if (Array.isArray(node.thenBranch)) {
                const blockEnv = new Environment(env);
                for (const stmt of node.thenBranch)
                    this.execute(stmt, blockEnv);
            }
            else {
                this.execute(node.thenBranch, env);
            }
        }
        else if (node.elseBranch) {
            if (Array.isArray(node.elseBranch)) {
                const blockEnv = new Environment(env);
                for (const stmt of node.elseBranch)
                    this.execute(stmt, blockEnv);
            }
            else {
                this.execute(node.elseBranch, env);
            }
        }
    }
    executeWhileStatement(node, env) {
        while (this.evaluate(node.condition, env)) {
            if (Array.isArray(node.body)) {
                const loopEnv = new Environment(env);
                for (const stmt of node.body)
                    this.execute(stmt, loopEnv);
            }
            else {
                this.execute(node.body, env);
            }
        }
    }
    executeSwitchStatement(node, env) {
        const value = this.evaluate(node.discriminant, env);
        let matched = false;
        for (const caseNode of node.cases) {
            if (caseNode.test === null || matched || this.evaluate(caseNode.test, env) === value) {
                matched = true;
                const caseEnv = new Environment(env);
                for (const stmt of caseNode.consequent) {
                    this.execute(stmt, caseEnv);
                }
                if (matched)
                    break; // Break execution after matching case
            }
        }
    }
    evaluate(expr, env) {
        switch (expr.type) {
            case "Literal":
                return expr.value;
            case "Identifier":
                return env.get(expr.name);
            case "ArrayLiteral":
                return expr.elements.map((el) => this.evaluate(el, env));
            case "IndexAccess": {
                const target = this.evaluate(expr.object, env);
                const index = this.evaluate(expr.index, env);
                return target[index];
            }
            case "MemberExpr": {
                const obj = this.evaluate(expr.object, env);
                if (Array.isArray(obj)) {
                    if (expr.property === "length")
                        return obj.length;
                    if (expr.property === "push")
                        return (...args) => obj.push(...args);
                }
                if (typeof obj === "string") {
                    if (expr.property === "length")
                        return obj.length;
                }
                return obj ? obj[expr.property] : undefined;
            }
            case "AssignmentExpr": {
                const value = this.evaluate(expr.value, env);
                if (expr.target.type === "Identifier") {
                    env.assign(expr.target.name, value);
                }
                else if (expr.target.type === "IndexAccess") {
                    const targetObj = this.evaluate(expr.target.object, env);
                    const indexVal = this.evaluate(expr.target.index, env);
                    targetObj[indexVal] = value;
                }
                else if (expr.target.type === "MemberExpr") {
                    const targetObj = this.evaluate(expr.target.object, env);
                    targetObj[expr.target.property] = value;
                }
                else {
                    throw new Error(`[Runtime Error] Invalid assignment target.`);
                }
                return value;
            }
            case "BinaryExpr":
                return this.evaluateBinary(expr.left, expr.operator, expr.right, env);
            case "UnaryExpr":
                return this.evaluateUnary(expr.operator, expr.right, env, expr.isPostfix);
            case "CallExpr": {
                const callee = this.evaluate(expr.callee, env);
                const args = expr.arguments.map((arg) => this.evaluate(arg, env));
                if (typeof callee === "function") {
                    return callee(...args);
                }
                throw new Error(`[Runtime Error] Target is not callable`);
            }
            default:
                throw new Error(`[Runtime Error] Unknown expression type: ${expr.type}`);
        }
    }
    evaluateBinary(leftExpr, op, rightExpr, env) {
        const left = this.evaluate(leftExpr, env);
        const right = this.evaluate(rightExpr, env);
        switch (op) {
            case "+": return left + right;
            case "-": return left - right;
            case "*": return left * right;
            case "/": return left / right;
            case "%": return left % right;
            case "**": return left ** right;
            case ">": return left > right;
            case "<": return left < right;
            case ">=": return left >= right;
            case "<=": return left <= right;
            case "==": return left == right;
            case "!=": return left != right;
            case "===": return left === right;
            default:
                throw new Error(`[Runtime Error] Unsupported operator: ${op}`);
        }
    }
    evaluateUnary(op, rightExpr, env, isPostfix) {
        if (op === "++" || op === "--") {
            if (rightExpr.type !== "Identifier" && rightExpr.type !== "IndexAccess" && rightExpr.type !== "MemberExpr") {
                throw new Error(`[Runtime Error] Invalid target for increment/decrement`);
            }
            const currentValue = this.evaluate(rightExpr, env);
            const newValue = op === "++" ? currentValue + 1 : currentValue - 1;
            // Mutate the variable or container target in-place
            if (rightExpr.type === "Identifier") {
                env.assign(rightExpr.name, newValue);
            }
            else if (rightExpr.type === "IndexAccess") {
                const targetObj = this.evaluate(rightExpr.object, env);
                const indexVal = this.evaluate(rightExpr.index, env);
                targetObj[indexVal] = newValue;
            }
            else if (rightExpr.type === "MemberExpr") {
                const targetObj = this.evaluate(rightExpr.object, env);
                targetObj[rightExpr.property] = newValue;
            }
            // Postfix (x++) returns old value; Prefix (++x) returns new value
            return isPostfix ? currentValue : newValue;
        }
        const right = this.evaluate(rightExpr, env);
        switch (op) {
            case "-": return -right;
            case "+": return +right;
            case "!": return !right;
            default:
                throw new Error(`[Runtime Error] Unsupported unary operator: ${op}`);
        }
    }
}
//# sourceMappingURL=Interpreter.js.map