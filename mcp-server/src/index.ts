// Library entry. Re-exports everything an embedder might want to build a
// custom transport (e.g. an HTTP variant) or test harness against the tool
// without going through stdio.
//
// For the runnable server, use the `bin` entry: `npx @fixyourdocs/mcp-server`.

export {
  createServer,
  runServer,
  SERVER_NAME,
  SERVER_VERSION,
  type CreateServerOptions,
} from "./server.js";

export {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  inputSchema,
  inputSchemaShape,
  handleFileDocFeedback,
  FixYourDocsError,
  type FileDocFeedbackInput,
  type FileDocFeedbackResult,
  type FileDocFeedbackOptions,
} from "./tool.js";
