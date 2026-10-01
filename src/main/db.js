'use strict';

const Database = require('better-sqlite3');

const SCHEMA_VERSION = 3;

const SESSION_SELECT = `
  SELECT s.id, s.task_id AS taskId, s.start, s.duration, s.start + s.duration AS "end",
         t.name AS task, t.description, t.url, t.project_id AS projectId, p.name AS project
  FROM sessions s
  JOIN tasks t ON t.id = s.task_id
  LEFT JOIN projects p ON p.id = t.project_id
`;

const TASK_SELECT = `
  SELECT t.id, t.name, t.description, t.url, t.project_id AS projectId, p.name AS project
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
`;

/**
 * All SQLite access for the app. A task is the thing being worked on; a
 * session is one block of time spent on it. Callers pass already-validated
 * values; see validate.js for the shapes.
 */
class TrackerDb {
  constructor(file) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.createTables();
    this.prepareStatements();
    this.ensureDefaultProject();
  }

  /** Every task belongs to a project, so there is always at least one. */
  ensureDefaultProject() {
    const run = this.db.transaction(() => {
      let first = this.db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get();
      if (!first) {
        const info = this.db.prepare("INSERT INTO projects (name) VALUES ('General')").run();
        first = { id: Number(info.lastInsertRowid) };
      }
      this.db.prepare('UPDATE tasks SET project_id = ? WHERE project_id IS NULL').run(first.id);
    });
    run();
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT    NOT NULL UNIQUE COLLATE NOCASE
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        name         TEXT    NOT NULL DEFAULT '',
        description  TEXT    NOT NULL DEFAULT '',
        url          TEXT    NOT NULL DEFAULT '',
        created      INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        start     INTEGER NOT NULL,
        duration  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions (start);
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions (task_id);
      CREATE TABLE IF NOT EXISTS settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `);
  }

  /** Upgrade databases created by earlier versions, one step at a time. */
  migrate() {
    const version = this.db.pragma('user_version', { simple: true });
    if (version >= SCHEMA_VERSION) return;

    const hasTable = (name) =>
      Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
    const columns = (table) => this.db.pragma(`table_info(${table})`).map((c) => c.name);

    const upgrade = this.db.transaction(() => {
      // v1-v2: the flat `entries` table gained project, description and url.
      if (hasTable('entries')) {
        const have = columns('entries');
        if (!have.includes('project_id')) this.db.exec('ALTER TABLE entries ADD COLUMN project_id INTEGER');
        if (!have.includes('description')) this.db.exec("ALTER TABLE entries ADD COLUMN description TEXT NOT NULL DEFAULT ''");
        if (!have.includes('url')) this.db.exec("ALTER TABLE entries ADD COLUMN url TEXT NOT NULL DEFAULT ''");
      }

      // v3: entries become tasks with sessions. Entries that share a project,
      // name, description and link collapse into one task.
      if (version < 3) {
        this.createTables();
        if (hasTable('entries')) {
          this.db.exec(`
            INSERT INTO tasks (project_id, name, description, url, created)
            SELECT project_id, task, description, url, MIN(start)
            FROM entries
            GROUP BY project_id, task, description, url;

            INSERT INTO sessions (task_id, start, duration)
            SELECT t.id, e.start, e.duration
            FROM entries e
            JOIN tasks t
              ON t.name = e.task AND t.description = e.description AND t.url = e.url
             AND t.project_id IS e.project_id;

            DROP TABLE entries;
          `);
        }
      }

      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    });
    upgrade();
  }

  prepareStatements() {
    const d = this.db;
    this.stmt = {
      listProjects: d.prepare('SELECT id, name FROM projects ORDER BY name COLLATE NOCASE'),
      findProject: d.prepare('SELECT id, name FROM projects WHERE name = ? COLLATE NOCASE'),
      insertProject: d.prepare('INSERT INTO projects (name) VALUES (?)'),
      renameProject: d.prepare('UPDATE projects SET name = ? WHERE id = ?'),
      deleteProject: d.prepare('DELETE FROM projects WHERE id = ?'),

      getTask: d.prepare(`${TASK_SELECT} WHERE t.id = ?`),
      insertTask: d.prepare(`
        INSERT INTO tasks (project_id, name, description, url, created)
        VALUES (@projectId, @name, @description, @url, @created)
      `),
      updateTask: d.prepare(`
        UPDATE tasks SET project_id = @projectId, name = @name, description = @description, url = @url
        WHERE id = @id
      `),
      deleteTask: d.prepare('DELETE FROM tasks WHERE id = ?'),
      countSessions: d.prepare('SELECT COUNT(*) AS n FROM sessions WHERE task_id = ?'),

      sessionsInRange: d.prepare(`${SESSION_SELECT} WHERE s.start >= ? AND s.start < ? ORDER BY s.start DESC`),
      getSession: d.prepare(`${SESSION_SELECT} WHERE s.id = ?`),
      insertSession: d.prepare('INSERT INTO sessions (task_id, start, duration) VALUES (@taskId, @start, @duration)'),
      updateSession: d.prepare('UPDATE sessions SET start = @start, duration = @duration WHERE id = @id'),
      deleteSession: d.prepare('DELETE FROM sessions WHERE id = ?'),
      deleteTaskSessionsInRange: d.prepare('DELETE FROM sessions WHERE task_id = ? AND start >= ? AND start < ?'),

      getSetting: d.prepare('SELECT value FROM settings WHERE key = ?'),
      setSetting: d.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      deleteSetting: d.prepare('DELETE FROM settings WHERE key = ?')
    };
  }

  // ---- projects ----

  listProjects() {
    return this.stmt.listProjects.all();
  }

  /** Returns the existing project when the name is already taken. */
  addProject(name) {
    const existing = this.stmt.findProject.get(name);
    if (existing) return existing;
    const info = this.stmt.insertProject.run(name);
    return { id: Number(info.lastInsertRowid), name };
  }

  /** Throws when another project already has the new name. */
  renameProject(id, name) {
    const clash = this.stmt.findProject.get(name);
    if (clash && clash.id !== id) throw new Error('A project with that name already exists.');
    this.stmt.renameProject.run(name, id);
    return { id, name };
  }

  /** Sessions logged against a project. Used to warn before deleting it. */
  projectStats(id) {
    return this.db
      .prepare(`
        SELECT COUNT(DISTINCT t.id) AS tasks, COUNT(s.id) AS sessions, COALESCE(SUM(s.duration), 0) AS total
        FROM tasks t LEFT JOIN sessions s ON s.task_id = t.id
        WHERE t.project_id = ?
      `)
      .get(id);
  }

  /** Delete a project with all its tasks and sessions. The last one stays. */
  deleteProject(id) {
    const run = this.db.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
      if (count <= 1) throw new Error('Keep at least one project.');
      this.db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
      this.stmt.deleteProject.run(id);
    });
    run();
  }

  // ---- tasks ----

  getTask(id) {
    return this.stmt.getTask.get(id) ?? null;
  }

  createTask(fields) {
    const info = this.stmt.insertTask.run({ ...fields, created: Date.now() });
    return this.getTask(Number(info.lastInsertRowid));
  }

  updateTask(id, fields) {
    this.stmt.updateTask.run({ ...fields, id });
    return this.getTask(id);
  }

  /** Delete the task and every session it has. */
  deleteTask(id) {
    this.stmt.deleteTask.run(id);
  }

  /** Delete a task when nothing is logged against it any more. */
  deleteTaskIfEmpty(id) {
    if (this.stmt.countSessions.get(id).n === 0) this.stmt.deleteTask.run(id);
  }

  /**
   * Remove a task's sessions within [from, to). The task itself goes too
   * once it has no sessions left, unless `keepTask` is set (it is running).
   */
  removeTaskDay(taskId, from, to, keepTask) {
    const run = this.db.transaction(() => {
      this.stmt.deleteTaskSessionsInRange.run(taskId, from, to);
      if (!keepTask) this.deleteTaskIfEmpty(taskId);
    });
    run();
  }

  // ---- sessions ----

  /** Sessions that start within [from, to), newest first, with task fields. */
  loadRange(from, to) {
    return this.stmt.sessionsInRange.all(from, to);
  }

  /**
   * Sessions for export, oldest first. `from`/`to` bound the start time
   * (null for open-ended) and `projectId` limits to one project (null for all).
   */
  listSessionsForExport({ from, to, projectId }) {
    const where = [];
    const params = [];
    if (from != null) { where.push('s.start >= ?'); params.push(from); }
    if (to != null) { where.push('s.start < ?'); params.push(to); }
    if (projectId != null) { where.push('t.project_id = ?'); params.push(projectId); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(`${SESSION_SELECT} ${clause} ORDER BY s.start ASC`).all(...params);
  }

  addSession(fields) {
    const info = this.stmt.insertSession.run(fields);
    return this.stmt.getSession.get(Number(info.lastInsertRowid));
  }

  updateSession(id, fields) {
    this.stmt.updateSession.run({ ...fields, id });
    return this.stmt.getSession.get(id);
  }

  deleteSession(id, keepTask) {
    const row = this.stmt.getSession.get(id);
    if (!row) return;
    const run = this.db.transaction(() => {
      this.stmt.deleteSession.run(id);
      if (!keepTask) this.deleteTaskIfEmpty(row.taskId);
    });
    run();
  }

  // ---- settings (small JSON blobs such as the running timer) ----

  getSetting(key) {
    const row = this.stmt.getSetting.get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    if (value == null) this.stmt.deleteSetting.run(key);
    else this.stmt.setSetting.run(key, value);
  }

  close() {
    this.db.close();
  }
}

module.exports = { TrackerDb };
