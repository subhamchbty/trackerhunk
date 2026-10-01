// A tiny event bus so modules can react to each other without importing
// each other in a cycle.
//
// Events used in the app:
//   project:changed  (projectId | null)   the dropdown selection changed
//   timer:changed    ()                   a timer started or stopped
//   entries:changed  ({ day? })           entries were added, edited or deleted
//   form:open        (entry | null)       open the entry form for edit or new

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  for (const handler of listeners.get(event) ?? []) handler(payload);
}
