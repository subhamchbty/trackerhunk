// The bridge exposed by preload.js. Importing it here keeps every other
// module free of direct `window` lookups and makes the dependency explicit.
export const api = window.tracker;
