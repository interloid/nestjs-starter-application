// src/types/modules.d.ts

declare module '@newrelic/pino-enricher' {
  /**
   * Enriches pino log payloads with New Relic linking metadata
   * (entity.name, entity.type, trace.id, span.id)
   */
  function enricher(): Record<string, unknown>;

  export default enricher;
}
