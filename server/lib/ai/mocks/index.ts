// Importing this module registers every hand-written mock generator.
// Agents without one fall back to the JSON-Schema synthesiser in
// providers/mock.ts, which is correct but produces field-shaped filler.
import "./reply";
