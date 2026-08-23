# ForgebyteX

A browser-based C and HTML learning app with a real backend compiler path for deployment.

## Local development

```bash
npm install
npm run dev
npm run server
```

The frontend expects a backend URL in `.env` when using the production compiler path:

```env
VITE_BACKEND_URL=http://localhost:3001
PORT=3001
```

## Render deployment

This project includes a Render config at [render.yaml](render.yaml) for the backend service.

### Recommended deployment structure

- Frontend: Vercel
- Backend: Render web service (Docker)
- C compiler: GCC installed in the backend container via the Dockerfile

### Deploy to Render

1. Push this repo to GitHub.
2. In Render, create a new Web Service.
3. Connect the repo.
4. Render will detect [render.yaml](render.yaml).
5. Confirm the service uses the Dockerfile.
6. The service will expose `/health` for health checks.

The backend listens on `PORT`, and the Docker image installs `gcc` and `build-essential` automatically.

### Frontend environment variable after deployment

Set this in your Vercel app:

```env
VITE_BACKEND_URL=https://your-render-backend-url.onrender.com
```

This tells the frontend to send C compile requests to the backend instead of the browser worker fallback.
