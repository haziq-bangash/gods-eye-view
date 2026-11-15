import { startApplicationChrome } from '../app/startupChrome.js';
import { initKeySetup } from '../keySetup.js';
import { FREIGHT_UPSTREAM_WELCOME } from '../freightProfile.js';
export function startStandaloneChrome(options) {
  return startApplicationChrome({
    initializeSettings: initKeySetup,
    // Nadelöhr opens straight onto its freight view; upstream's mission
    // launcher (contacts, space, fires) stays off unless the profile enables it.
    ...(FREIGHT_UPSTREAM_WELCOME ? {} : { initializeWelcome: null }),
    ...options,
  });
}
