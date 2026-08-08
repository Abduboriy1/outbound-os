export * from "./normalize";
export * from "./fields";
export * from "./csv";
export * from "./dedupe";
export * from "./manual";

/**
 * The row shape every function here parses into. It is declared alongside the
 * `LeadProvider` interface in `server/lib/contracts.ts` and re-exported from
 * here so a browser-side importer gets the parser and its type from one module.
 * `export type` is erased at compile time, so this pulls nothing from
 * `server/lib/**` into the client bundle (MIGRATION.md §1).
 */
export type { DiscoveredLead } from "~~/server/lib/contracts";
