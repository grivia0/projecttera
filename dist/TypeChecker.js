export class TypeError extends Error {
    constructor(message) {
        super(`[Type Error] ${message}`);
        this.name = "TypeError";
    }
}
class TypeEnvironment {
    parent;
    bindings = new Map();
    constructor(parent = null) {
        this.parent = parent;
    }
    define(name, type) {
        if (this.bindings.has(name)) {
            throw new TypeError(`Identifier '${name}' has already been declared in this scope.`);
        }
        this.bindings.set(name, type);
    }
    assign(name, type) {
        if (this.bindings.has(name)) {
            const expectedType = this.bindings.get(name);
            if (!this.isCompatible(expectedType, type)) {
                throw new TypeError(`Cannot assign value of type '${type}' to variable '${name}' of type '${expectedType}'.`);
            }
            return;
        }
        if (this.parent) {
            this.parent.assign(name, type);
            return;
        }
        throw new TypeError(`Undefined variable '${name}'.`);
    }
    lookup(name) {
        if (this.bindings.has(name)) {
            return this.bindings.get(name);
        }
        if (this.parent) {
            return this.parent.lookup(name);
        }
        throw new TypeError(`Undefined variable '${name}'.`);
    }
    isCompatible(target, inferred) {
        if (target === inferred)
            return true;
        return false;
    }
}
export class TypeChecker {
    globalEnv;
    constructor() {
        this.globalEnv = new TypeEnvironment();
        // Built-in functions
        this.globalEnv.define("print", "function");
    }
    check(node) {
        const env = new TypeEnvironment(this.globalEnv);
        for (const stmt of node.body) {
            this.checkStatement(stmt, env);
        }
    }
    checkStatement(stmt, env) {
        switch (stmt.type) {
            case "VarDecl":
                this.checkVarDecl(stmt, env);
                break;
            case "FunctionDecl":
                this.checkFunctionDecl(stmt, env);
                break;
            case "IfStatement":
                this.checkIfStatement(stmt, env);
                break;
            case "WhileStatement":
                this.checkWhileStatement(stmt, env);
                break;
            case "SwitchStatement":
                this.checkSwitchStatement(stmt, env);
                break;
            case "ReturnStatement":
                this.checkReturnStatement(stmt, env);
                break;
            case "ExpressionStatement":
                this.inferExpressionType(stmt.expression, env);
                break;
            default:
                throw new TypeError(`Unknown statement type: ${stmt.type}`);
        }
    }
    checkVarDecl(node, env) {
        let inferredType = "undefined";
        if (node.value) {
            inferredType = this.inferExpressionType(node.value, env);
        }
        if (node.targetType) {
            if (node.value && !this.isTypeCompatible(node.targetType, inferredType)) {
                throw new TypeError(`Cannot assign value of type '${inferredType}' to target type '${node.targetType}' for variable '${node.identifier}'.`);
            }
            env.define(node.identifier, node.targetType);
        }
        else {
            env.define(node.identifier, inferredType);
        }
    }
    checkFunctionDecl(node, env) {
        if (node.name) {
            env.define(node.name, "function");
        }
        const fnEnv = new TypeEnvironment(env);
        for (const param of node.params) {
            fnEnv.define(param.name, param.paramType);
        }
        if (Array.isArray(node.body)) {
            for (const stmt of node.body) {
                this.checkStatement(stmt, fnEnv);
            }
        }
        else {
            this.inferExpressionType(node.body, fnEnv);
        }
    }
    checkIfStatement(node, env) {
        const condType = this.inferExpressionType(node.condition, env);
        if (condType !== "boolean") {
            throw new TypeError(`If statement condition must be a boolean, got '${condType}'.`);
        }
        if (Array.isArray(node.thenBranch)) {
            const thenEnv = new TypeEnvironment(env);
            for (const stmt of node.thenBranch)
                this.checkStatement(stmt, thenEnv);
        }
        else {
            this.checkStatement(node.thenBranch, env);
        }
        if (node.elseBranch) {
            if (Array.isArray(node.elseBranch)) {
                const elseEnv = new TypeEnvironment(env);
                for (const stmt of node.elseBranch)
                    this.checkStatement(stmt, elseEnv);
            }
            else {
                this.checkStatement(node.elseBranch, env);
            }
        }
    }
    checkWhileStatement(node, env) {
        const condType = this.inferExpressionType(node.condition, env);
        if (condType !== "boolean") {
            throw new TypeError(`While loop condition must be a boolean, got '${condType}'.`);
        }
        if (Array.isArray(node.body)) {
            const loopEnv = new TypeEnvironment(env);
            for (const stmt of node.body)
                this.checkStatement(stmt, loopEnv);
        }
        else {
            this.checkStatement(node.body, env);
        }
    }
    checkSwitchStatement(node, env) {
        const discType = this.inferExpressionType(node.discriminant, env);
        for (const c of node.cases) {
            if (c.test) {
                const testType = this.inferExpressionType(c.test, env);
                if (discType !== testType) {
                    throw new TypeError(`Switch case test type '${testType}' does not match discriminant type '${discType}'.`);
                }
            }
            const caseEnv = new TypeEnvironment(env);
            for (const stmt of c.consequent) {
                this.checkStatement(stmt, caseEnv);
            }
        }
    }
    checkReturnStatement(node, env) {
        if (node.value) {
            this.inferExpressionType(node.value, env);
        }
    }
    inferExpressionType(expr, env) {
        switch (expr.type) {
            case "Literal":
                return this.inferLiteralType(expr);
            case "Identifier":
                return env.lookup(expr.name);
            case "BinaryExpr":
                return this.inferBinaryExprType(expr, env);
            case "CallExpr":
                return this.inferCallExprType(expr, env);
            case "ArrayLiteral":
                return this.inferArrayLiteralType(expr, env);
            case "IndexAccess":
                return this.inferIndexAccessType(expr, env);
            case "MemberExpr":
                return this.inferMemberExprType(expr, env);
            case "AssignmentExpr":
                return this.inferAssignmentExprType(expr, env);
            default:
                throw new TypeError(`Unknown expression type: ${expr.type}`);
        }
    }
    inferAssignmentExprType(node, env) {
        const valueType = this.inferExpressionType(node.value, env);
        if (node.target.type === "Identifier") {
            env.assign(node.target.name, valueType);
            return valueType;
        }
        else if (node.target.type === "IndexAccess") {
            const targetType = this.inferIndexAccessType(node.target, env);
            if (targetType !== valueType) {
                throw new TypeError(`Cannot assign value of type '${valueType}' to array index expecting type '${targetType}'.`);
            }
            return valueType;
        }
        else {
            throw new TypeError(`Invalid assignment target.`);
        }
    }
    inferMemberExprType(node, env) {
        const objectType = this.inferExpressionType(node.object, env);
        if (objectType.startsWith("arr[")) {
            if (node.property === "length")
                return "int";
            if (node.property === "push")
                return "function";
        }
        if (objectType === "string") {
            if (node.property === "length")
                return "int";
        }
        return "undefined";
    }
    inferLiteralType(node) {
        switch (node.rawType) {
            case "number":
                return "int";
            case "string":
                return "string";
            case "boolean":
                return "boolean";
            default:
                return "undefined";
        }
    }
    inferBinaryExprType(node, env) {
        const leftType = this.inferExpressionType(node.left, env);
        const rightType = this.inferExpressionType(node.right, env);
        if (["+", "-", "*", "/", "%"].includes(node.operator)) {
            if (leftType === "int" && rightType === "int")
                return "int";
            if (node.operator === "+" && leftType === "string" && rightType === "string")
                return "string";
            throw new TypeError(`Operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'.`);
        }
        if (["==", "!=", "<", ">", "<=", ">="].includes(node.operator)) {
            if (leftType !== rightType) {
                throw new TypeError(`Comparison '${node.operator}' expects matching types, got '${leftType}' and '${rightType}'.`);
            }
            return "boolean";
        }
        throw new TypeError(`Unsupported binary operator '${node.operator}'.`);
    }
    inferCallExprType(node, env) {
        const calleeType = this.inferExpressionType(node.callee, env);
        if (calleeType !== "function") {
            throw new TypeError(`Cannot call non-function target of type '${calleeType}'.`);
        }
        for (const arg of node.arguments) {
            this.inferExpressionType(arg, env);
        }
        return "undefined";
    }
    inferArrayLiteralType(node, env) {
        if (node.elements.length === 0)
            return "arr[undefined]";
        const firstElemType = this.inferExpressionType(node.elements[0], env);
        for (let i = 1; i < node.elements.length; i++) {
            const elemType = this.inferExpressionType(node.elements[i], env);
            if (elemType !== firstElemType) {
                throw new TypeError(`Array elements must have uniform types. Found '${firstElemType}' and '${elemType}'.`);
            }
        }
        return `arr[${firstElemType}]`;
    }
    inferIndexAccessType(node, env) {
        const objType = this.inferExpressionType(node.object, env);
        const indexType = this.inferExpressionType(node.index, env);
        if (indexType !== "int") {
            throw new TypeError(`Array index must be of type 'int', got '${indexType}'.`);
        }
        if (objType.startsWith("arr[")) {
            return objType.slice(4, -1);
        }
        throw new TypeError(`Type '${objType}' is not indexable.`);
    }
    isTypeCompatible(target, inferred) {
        if (target === inferred)
            return true;
        if (target === "arr[int]" && inferred === "arr[int]")
            return true;
        return false;
    }
}
//# sourceMappingURL=TypeChecker.js.map