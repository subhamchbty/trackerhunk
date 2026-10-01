'use strict';

/**
 * Input validation for values arriving over IPC. The renderer is trusted
 * code, but keeping the checks here means the database only ever sees
 * well-formed rows regardless of what the UI sends.
 */

const MAX_TEXT = 2000;
const SETTING_KEYS = new Set(['running']);

class ValidationError extends Error {}

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function id(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Invalid id.');
  return n;
}

function optionalId(value) {
  return value == null || value === '' ? null : id(value);
}

function timestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError('Invalid timestamp.');
  return Math.round(n);
}

function bool(value) {
  return Boolean(value);
}

function projectName(value) {
  const name = text(value, 200);
  if (!name) throw new ValidationError('Project name is required.');
  return name;
}

function url(value) {
  const v = text(value);
  if (v && !/^https?:\/\//i.test(v)) throw new ValidationError('Links must start with http:// or https://.');
  return v;
}

function taskFields(input) {
  const f = input && typeof input === 'object' ? input : {};
  return {
    name: text(f.name, 500),
    description: text(f.description),
    url: url(f.url),
    projectId: id(f.projectId)
  };
}

/** Start and duration of a session; `withTask` also requires a task id. */
function sessionFields(input, withTask) {
  const f = input && typeof input === 'object' ? input : {};
  const start = timestamp(f.start);
  const duration = timestamp(f.duration);
  if (duration <= 0) throw new ValidationError('End time must be after start time.');
  const out = { start, duration };
  if (withTask) out.taskId = id(f.taskId);
  return out;
}

function exportOptions(input) {
  const f = input && typeof input === 'object' ? input : {};
  const from = f.from == null ? null : timestamp(f.from);
  const to = f.to == null ? null : timestamp(f.to);
  if (from != null && to != null && to <= from) throw new ValidationError('End date must be after start date.');
  return { from, to, projectId: optionalId(f.projectId) };
}

function settingKey(value) {
  if (!SETTING_KEYS.has(value)) throw new ValidationError('Unknown setting.');
  return value;
}

function settingValue(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 10000) throw new ValidationError('Invalid setting value.');
  return value;
}

module.exports = {
  ValidationError,
  id,
  timestamp,
  bool,
  projectName,
  taskFields,
  sessionFields,
  exportOptions,
  settingKey,
  settingValue
};
