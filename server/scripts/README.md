# Server scripts

One-off utilities (run from repo root or `server/` as noted in each script).

`reset-db.js`, `make-admin.js`, and `set-pending-verification-status.js` use a **development-only** MongoDB default (`mongodb://localhost:27017/moving-mate`) when `MONGODB_URI` / `MONGO_URI` is unset. For production databases, always set `MONGODB_URI` in the environment before running.
