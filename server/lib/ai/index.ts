/** Public surface of the AI layer. Callers import from here, not from files inside. */

export { AIService, aiService, resetAiService, AiRunError } from "./service";
export type { AiRunResult, RunOptions } from "./service";
export { getAiProvider, resetAiProvider } from "./provider";
export { MockAiProvider, registerMockAgent } from "./providers/mock";
export { AnthropicAiProvider } from "./providers/anthropic";
export {
  wrapUntrusted,
  stripInjection,
  detectInjection,
  sanitizeDocument,
} from "./sanitize";
export { systemPrompt, userTurn, contextBlock, readContext, renderUserContent } from "./prompt";
export type { AgentRequest } from "./prompt";
