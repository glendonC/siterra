/**
 * What one command may spend on live model calls at most, in micro-USD (the P0 limit, USD 0.50).
 * The agent's command ledger enforces it per command; an instance's spend cap reserves it for
 * every unfinished command when it decides whether a new command may start.
 */
export const COMMAND_SPEND_CAP_MICRO_USD = 500_000;
