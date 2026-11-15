import { createAssetDirectorySource } from '../director/packs/source.js';
import { createApplicationTools } from '../app/tools.js';
import { startStandaloneChrome } from './startupChrome.js';
import { loadToolCatalog } from './toolCatalog.js';
export function createStandaloneTools(options) {
  return createApplicationTools({
    startChrome: startStandaloneChrome,
    sceneDataPacks: {
      sources: {
        assets: createAssetDirectorySource({
          // A panel names the app's address; see src/tools/globePanel.js.
          baseUrl: new URL(
            '/scene-assets/',
            globalThis.GEV_APP_BASE_URL ?? document.baseURI,
          ).href,
        }),
      },
    },
    ...options,
    voice: {
      // GEV_ASSISTANT_PROVIDER pins one provider (a hosted site with one key).
      supportedProviders: import.meta.env.GEV_ASSISTANT_PROVIDER
        ? [import.meta.env.GEV_ASSISTANT_PROVIDER]
        : ['openai', 'gemini'],
      panel: true,
      toolCatalog: loadToolCatalog,
      ...options?.voice,
    },
  });
}
