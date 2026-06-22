// Public API for the @outreach/ai package. The API and worker services import
// only from here; they never call the Anthropic SDK directly (CLAUDE.md).

// Config / mode
export { aiConfig, isLiveMode } from './config';

// Low-level client (exposed for advanced/custom calls + tests)
export { callClaude } from './client';
export type { ClaudeCall, ClaudeResult, CallUsage } from './client';

// Prompt registry
export { getActivePrompt, renderPrompt, clearPromptCache } from './registry';
export type { LoadedPrompt } from './registry';

// Shared result types + generic product context
export type { AiMeta, AiResult, ProductContext } from './types';
export { GENERIC_PRODUCT, productContextFrom } from './types';

// Generators
export { generateResearchBrief } from './generators/research';
export type { ResearchInput, ResearchResult } from './generators/research';
export { generateDraft } from './generators/draft';
export type {
  DraftInput,
  DraftResult,
  TouchIntent,
  TouchBranding,
} from './generators/draft';
export { personalizeDraft } from './generators/personalization';
export type {
  PersonalizationInput,
  PersonalizationResult,
} from './generators/personalization';
export { generateNextStepScripts, SCRIPT_SITUATIONS } from './generators/scripts';
export type { ScriptsInput, ScriptsResult, NextStepScript } from './generators/scripts';
export { recommendNextAction } from './generators/nextAction';
export type { NextActionInput, NextActionResult } from './generators/nextAction';

// Classifier
export { classifyReply, REPLY_CATEGORIES, CONFIDENCE_THRESHOLD } from './classifiers/reply';
export type { ReplyClassification, ClassifyResult } from './classifiers/reply';

// Evaluator
export { evaluateDraft } from './evaluators/quality';
export type { QualityInput, QualityResult } from './evaluators/quality';
