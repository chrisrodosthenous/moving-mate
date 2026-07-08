# MovingMate

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

### Google Maps

Set a **referrer-restricted** browser key in `src/environments/environment.ts` (`googleMapsApiKey`). Production builds use `src/environments/environment.prod.ts` (via `angular.json` `fileReplacements`). Do not commit unrestricted keys to public repositories.

### API / backend (`server/.env`)

See `server/.env.example`. In **`NODE_ENV=production`**, **`MONGODB_URI`** (or **`MONGO_URI`**) and **`JWT_SECRET`** are **required** (no localhost / dev-default fallbacks). Optional: **`ENABLE_TEST_ROUTES=true`** (or **`NODE_ENV=development`**) to mount `/api/test/*` routes, **`FIREBASE_SERVICE_ACCOUNT_PATH`**, SMTP vars, **`CLIENT_URL`**.

**Production deploy (mock payments):** see [`deploy/README.md`](deploy/README.md). Run `npm run build:prod` then `npm run server:prod` — Node serves the Angular build and API on one port.

**Render (recommended, no VPS):** see [`deploy/RENDER.md`](deploy/RENDER.md) — GoDaddy domain only; no GoDaddy hosting needed.

The API **CORS** configuration is in `server/config/cors.js`. In development, origins are broadly allowed; in production, **`http://localhost:4200`** (Angular **`ng serve`**) and **`http://localhost:3000`** are in the static allow-list along with other documented patterns.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

Unit tests use the Angular CLI test target (`@angular/build:unit-test` with the Karma runner). Run:

```bash
ng test
```

By default, tests run in headless Chrome. Use `ng test --help` for options such as `--watch` and `--coverage`.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Admin dashboard

The app has an admin area at `/admin` (protected; only users with `role === 'admin'` can access). To make your account an admin, run from the project root (with the API server and MongoDB running as needed):

```bash
node server/scripts/make-admin.js your@email.com
```

Then log out and log in again so your token has the admin role. The sidebar will show an "Admin" link when you are an admin.

## Database reset (cleanup + seed admin)

To wipe the database and create a single admin user (e.g. before testing the Admin Dashboard), run from the **project root**:

```bash
# Windows (cmd)
set ADMIN_EMAIL=your@email.com
set ADMIN_PASSWORD=YourSecurePassword
node server/scripts/reset-db.js

# Windows (PowerShell)
$env:ADMIN_EMAIL="your@email.com"; $env:ADMIN_PASSWORD="YourSecurePassword"; node server/scripts/reset-db.js

# Unix / Mac
ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourSecurePassword node server/scripts/reset-db.js
```

The script deletes all documents from **Users**, **TransportOrders** (orders), and **Messages**. There is no separate Ratings collection (ratings live on orders). It then creates one user with your credentials, `role: 'admin'` and `isVerified: true`. Optional env vars: `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_PHONE` (defaults: Admin, User, +35700000000). On success it prints: `Database cleared successfully.` and the created admin email.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
