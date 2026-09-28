# JEEVIKA ERP 2.0 — Electron Desktop Host

**Module:** Desktop Application Host  
**Organization:** HENU OS PRIVATE LIMITED  
**Version:** 2.0.0  

---

## 1. Overview

The Desktop Host packages JEEVIKA ERP 2.0 into a desktop window without altering any existing accounting logic, database schemas, API contracts, or frontend layouts.

It serves as a **secure application container** that:
- Probes local ASP.NET Core Web API health (`http://127.0.0.1:5002`)
- Manages local backend process lifecycle when started in standalone desktop mode
- Connects transparently to already-running backend instances during developer workflows
- Enforces strict Chromium sandboxing, context isolation, and origin filtering
- Ensures clean shutdown and process teardown with zero orphaned processes

---

## 2. Directory Architecture

```
Desktop/
├── package.json
├── README.md
├── start-desktop.bat
├── scripts/
│   └── verify-electron.js
└── src/
    ├── main/
    │   ├── main.js
    │   ├── app-lifecycle.js
    │   ├── backend-manager.js
    │   ├── readiness-check.js
    │   ├── window-manager.js
    │   ├── navigation-guard.js
    │   └── ipc/
    │       └── ipc-handlers.js
    ├── preload/
    │   └── preload.js
    └── shared/
        ├── constants.js
        └── configuration.js
```

---

## 3. Quick Start

### Windows Desktop Launcher:
Double-click `start-desktop.bat` or run:
```cmd
cd Desktop
start-desktop.bat
```

### Developer CLI:
```bash
cd Desktop
npm start
```

### Run Automated Security & Bridge Tests:
```bash
cd Desktop
npm test
```
