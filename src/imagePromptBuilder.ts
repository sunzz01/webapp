/**
 * Re-export shared prompt builder (canonical copy lives in api/_lib for Vercel).
 */
export {
  SEA_MARKETPLACE_STYLES,
  isMarketingPlatformStyle,
  generateStructuredPrompt,
  getSEAMarketVariations,
  buildImageGenerationPrompt,
  getOrchestratorInstructions,
} from '../api/_lib/imagePromptBuilder';
