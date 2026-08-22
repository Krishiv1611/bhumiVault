# BhumiVault Frontend

Dependency-free TypeScript dashboard for the BhumiVault backend.

## Configuration

The build writes `dist/env.js` from `BHUMIVAULT_API_BASE_URL` or `VITE_API_BASE_URL`.

```powershell
$env:BHUMIVAULT_API_BASE_URL = "http://localhost:5000/api"
npm run build
npm run start
```

At runtime, you can also edit `dist/env.js`:

```js
window.BHUMIVAULT_CONFIG = {
  API_BASE_URL: "http://localhost:5000/api"
};
```

No private keys are stored in this frontend. Prototype-only signing fields are user-entered and are only sent to the backend endpoints that currently require them.
