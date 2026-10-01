# TrackerHunk

A minimal Electron time tracker for Windows. Work is organised as projects,
each with tasks; every block of time spent on a task is a session. Start a
timer on a task as often as you like and its row simply accumulates.
Everything exports to CSV for invoicing.

## Run

    npm install
    npm start

`npm install` downloads a prebuilt SQLite binary for the installed Electron
version, so no compiler or Python is needed. `npm start` clears the
`ELECTRON_RUN_AS_NODE` variable that terminals inside VS Code export, which
would otherwise stop Electron from opening a window.

## Build for Windows

    npm run dist

This produces, in `dist/`, an NSIS installer (`TrackerHunk-<version>-x64.exe`)
that lets the user pick the install folder and adds a desktop shortcut, and a
single-file portable `TrackerHunk-<version>-portable.exe` that runs without
installing. Native modules are not recompiled; the prebuilt SQLite binary
fetched at install time is packaged as is. The build is unsigned, so
SmartScreen will warn on first run until you add a code-signing certificate.

## Continuous build and releases

The GitHub Actions workflow in `.github/workflows/build.yml` runs on every
push to `main` and on pull requests against it. It installs dependencies,
runs the smoke test in `scripts/ci-smoke.js` (starts Electron headless,
writes to a throwaway database, loads the page and checks for errors), then
builds the installer and portable exe and uploads them as the
`TrackerHunk-windows` artifact on the run.

To publish a release, tag a commit and push the tag:

    git tag v0.1.0
    git push origin v0.1.0

The same workflow then creates a GitHub Release for that tag with the
installer, the portable exe and the update metadata attached, and
generates release notes from the commits.

To sign builds in CI, add two repository secrets: `WINDOWS_CERT_BASE64`
(the PFX file, base64 encoded) and `WINDOWS_CERT_PASSWORD`. Without them
the build is unsigned.

## Signing the build

Windows treats an unsigned installer two ways. Plain SmartScreen shows
"Windows protected your PC" with a More info / Run anyway link. Smart App
Control (Windows 11, Windows Security > App & browser control) blocks any
app that is not signed by a publicly trusted certificate, with no override.
Self-signed certificates do not satisfy either.

### Option A: a certificate from a public CA (ships to anyone)

1. Get a code-signing certificate. Cheapest practical routes: Azure Trusted
   Signing (monthly subscription, identity check, no hardware token), or an
   OV certificate from Certum, SSL.com or Sectigo (yearly, usually delivered
   on a USB token or in a cloud HSM). An EV certificate gives SmartScreen
   reputation immediately; OV builds it over the first weeks of downloads.
2. For a PFX file, set two environment variables and build:

       $env:CSC_LINK = "C:\path\to\certificate.pfx"
       $env:CSC_KEY_PASSWORD = "the pfx password"
       npm run dist

   For Azure Trusted Signing, add to `build.win` in package.json instead:

       "azureSignOptions": {
         "endpoint": "https://<region>.codesigning.azure.net",
         "codeSigningAccountName": "<account>",
         "certificateProfileName": "<profile>"
       }

   and sign in with `az login` before `npm run dist`.
3. The installer, the portable exe, the app exe and the uninstaller are all
   signed. Check with `Get-AuthenticodeSignature dist\*.exe`.

### Option B: test the pipeline locally

    powershell -ExecutionPolicy Bypass -File scripts\dev-cert.ps1

creates a self-signed certificate under `certs\` and prints the variables
to set. The resulting build is signed but not trusted: it only proves that
signing works. Do not ship it.

### Installing on a machine with Smart App Control on

Until the build carries a trusted signature, the only way to install it is
to turn Smart App Control off (Windows Security > App & browser control >
Smart App Control settings). Windows does not allow turning it back on
without reinstalling, so decide deliberately. With it off, SmartScreen still
warns once; More info > Run anyway proceeds.

## Branding

The mark in `assets/logo.svg` is the single source for the logo in the title
bar and the app icon. After changing it, run `npm run icons` to regenerate
the PNG sizes and the `.ico` the window uses.

## Using it

- The big clock is today's total across all projects. While a timer runs,
  the task name shows above it, a "Session" line counts the current block,
  and the window title shows the elapsed time for the taskbar.
- The dropdown above the list is the current project. The list shows that
  project's tasks for the day, and new tasks go to it.
- Press the round play button on a task to start a timer on it. The row
  turns into the running one, its total ticks live, and the button becomes
  stop. Stopping adds a session to the same task, never a new row.
- "+" above the list, the "Start a task" button, or Space opens the new
  task form. Enter starts a timer; "Log time" saves the listed sessions.
- Click a task to edit its name, project, description and link, and the
  sessions it has on that day: adjust times to the second, add or remove
  sessions. A session that ends before it starts is taken to run past
  midnight.
- Hover a task for the x to delete its time on that day, which asks first.
  Click a link to open it in your browser.
- Use the arrows to move between days, click the day label for a date
  picker, and the dot to come back to today.
- The gear at the top opens Settings: add projects, click a name to rename,
  delete with confirmation (this removes the project's tasks and time; the
  last project cannot be deleted).
- Export, at the top and in Settings, writes sessions to CSV with local
  dates, times, durations and decimal hours. Pick one project or all, and a
  period: this week, this month, last month, last 30 days, all time, or a
  custom range. The file name carries the project and dates.
- Closing the app does not stop a running timer. It is saved and resumes on
  the next launch.

## Layout

    assets/
      logo.svg         the TrackerHunk mark, used in the title bar
      icons/           PNG sizes and icon.ico generated from the mark
    src/
      main/
        main.js        app lifecycle and window
        db.js          SQLite access (TrackerDb) with versioned migrations
        validate.js    checks on everything arriving over IPC
        ipc.js         maps IPC channels to database calls
        csv.js         CSV export and save dialog
      preload.js       the small `window.tracker` API exposed to the page
      renderer/
        index.html
        styles/        base tokens and controls, then one file per area
        js/
          app.js       bootstraps modules and global shortcuts
          api.js       the preload bridge
          events.js    event bus the modules talk through
          format.js    pure time and text helpers
          projects.js  project dropdown
          settings.js  settings screen: projects
          export.js    export dialog: project and date range
          timer.js     running timer, persistence and day-total clock
          log.js       day navigation and the task list
          task-item.js one row of the list
          task-form.js new task / edit task / running timer dialog
          confirm.js   confirmation dialog
    scripts/
      electron.js      launches Electron with a clean environment
      build-icons.js   renders logo.svg to the icon files (npm run icons)
      fetch-sqlite.js  downloads the SQLite binary after install

The renderer runs sandboxed with context isolation; it only reaches the
database through the preload bridge, and the main process validates every
call before it touches SQLite.

## Data

The database lives at `%APPDATA%\TrackerHunk\tracker.db` and survives
reinstalls and updates. Schema changes are applied automatically on
startup; databases from earlier versions have their flat entries converted
into tasks and sessions, and a "General" project is created if none exists.
A database left in the old `time-tracker` folder is copied over on first
launch.
