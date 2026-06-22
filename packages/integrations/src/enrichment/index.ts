// Enrichment adapter factory: live Apollo adapter when a real key is configured,
// otherwise the mock. Memoized.
import type { EnrichmentAdapter } from '../types';
import { enrichmentIsLive } from '../config';
import { ApolloEnrichmentAdapter } from './apollo.adapter';
import { MockEnrichmentAdapter } from '../mock/enrichment.mock';

let instance: EnrichmentAdapter | null = null;

export function getEnrichmentAdapter(): EnrichmentAdapter {
  if (!instance) {
    instance = enrichmentIsLive()
      ? new ApolloEnrichmentAdapter()
      : new MockEnrichmentAdapter();
  }
  return instance;
}

export { ApolloEnrichmentAdapter, MockEnrichmentAdapter };
