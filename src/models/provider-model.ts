/**
 * Parse "provider:model" refs from config (e.g. groq:llama-3.3-70b-versatile).
 */
export function parseProviderModel(
  modelRef: string,
  fallbackProvider = 'openai',
): { provider: string; model: string } {
  const colon = modelRef.indexOf(':');
  if (colon === -1) {
    return { provider: fallbackProvider, model: modelRef };
  }
  return {
    provider: modelRef.slice(0, colon),
    model: modelRef.slice(colon + 1),
  };
}
