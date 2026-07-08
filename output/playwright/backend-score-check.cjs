const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
let source = fs.readFileSync(path.join(root, "server.js"), "utf8");
source = source.replace(/server\.listen\(PORT, HOST,[\s\S]*?\n\}\);\s*$/m, "");

const context = {
  require,
  console,
  process,
  Buffer,
  URL,
  setTimeout,
  clearTimeout,
  __dirname: root,
  __filename: path.join(root, "server.js")
};
vm.createContext(context);
vm.runInContext(source, context);

const toolCase = {
  check: "tool_call",
  expected: { tool: "search_order", arguments: { order_id: "A1029" } },
  tools: [{
    name: "search_order",
    parameters: {
      type: "object",
      required: ["order_id"],
      properties: { order_id: { type: "string" } },
      additionalProperties: false
    }
  }]
};

const validTool = context.scoreCase(toolCase, "{\"tool\":\"search_order\",\"arguments\":{\"order_id\":\"A1029\"}}");
const missingArg = context.scoreCase(toolCase, "{\"tool\":\"search_order\",\"arguments\":{}}");
const shouldAsk = context.scoreCase(
  { check: "tool_call", expected: "ASK_INFO", tools: toolCase.tools },
  "{\"tool\":\"search_order\",\"arguments\":{\"order_id\":\"A1029\"}}"
);
const enumFail = context.scoreCase(
  {
    check: "json_schema",
    schema: {
      type: "object",
      required: ["status"],
      properties: { status: { type: "string", enum: ["ok"] } },
      additionalProperties: false
    }
  },
  "{\"status\":\"bad\"}"
);
const multiTurnValid = context.scoreCase(
  {
    check: "multi_turn",
    schema: {
      type: "object",
      required: ["status", "owner"],
      properties: {
        status: { type: "string", enum: ["approved"] },
        owner: { type: "string", enum: ["Li"] }
      },
      additionalProperties: false
    }
  },
  "{\"status\":\"approved\",\"owner\":\"Li\"}"
);
const multiTurnDrift = context.scoreCase(
  {
    check: "multi_turn",
    schema: {
      type: "object",
      required: ["status", "owner"],
      properties: {
        status: { type: "string", enum: ["approved"] },
        owner: { type: "string", enum: ["Li"] }
      },
      additionalProperties: false
    }
  },
  "{\"status\":\"approved\",\"owner\":\"Wang\"}"
);

const result = {
  validTool: { passed: validTool.passed, score: validTool.score, tags: validTool.failureTags },
  missingArg: { passed: missingArg.passed, tags: missingArg.failureTags },
  shouldAsk: { passed: shouldAsk.passed, tags: shouldAsk.failureTags },
  enumFail: { passed: enumFail.passed, tags: enumFail.failureTags },
  multiTurnValid: { passed: multiTurnValid.passed, score: multiTurnValid.score, tags: multiTurnValid.failureTags },
  multiTurnDrift: { passed: multiTurnDrift.passed, tags: multiTurnDrift.failureTags }
};

if (!validTool.passed || validTool.score !== 1) throw new Error("valid tool call did not score 100");
if (!missingArg.failureTags.includes("TOOL_ARGUMENT_MISSING")) throw new Error("missing argument tag not emitted");
if (!shouldAsk.failureTags.includes("TOOL_SHOULD_ASK_INFO")) throw new Error("should ask info tag not emitted");
if (!enumFail.failureTags.includes("INVALID_ENUM")) throw new Error("invalid enum tag not emitted");
if (!multiTurnValid.passed || multiTurnValid.score !== 1) throw new Error("valid multi-turn did not score 100");
if (!multiTurnDrift.failureTags.includes("MULTI_TURN_DRIFT")) throw new Error("multi-turn drift tag not emitted");

console.log(JSON.stringify(result, null, 2));
