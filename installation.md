# Noise CAPTCHA - Installation Manual
This guide explains how to build and deploy the complete Noise CAPTCHA application using `docker-compose`.

## Features
- **Ultra-Fast Builds**: The backend Dockerfile bypasses runtime Rust/WASM compilation entirely, instantly injecting the pre-compiled `engine.js` and `engine.wasm` assets. This guarantees perfect Alpine compatibility and instantaneous container builds.
- **Unified Services**: Frontend, Backend, and Redis instances run securely within a single isolated Docker network.
- **Traefik Ready**: Out of the box annotations designed for Traefik to handle your domain and SSL automatically.

## Pre-requisites
1. [Docker](https://docs.docker.com/get-docker/) installed.
2. [Docker Compose](https://docs.docker.com/compose/install/) installed. 
3. (If using Traefik) Make sure an external Docker network named `proxy` exists (`docker network create proxy`).

## Installation Steps

### 1. Configuration Check
Open the project root's `docker-compose.yml` and modify the environment variables to fit your production values:
- `AES_KEY_SEED` and `AES_KEY_MASK`: MUST be replaced with your real **64-character hexadecimal (0-9, a-f) keys**.
- `ALLOWED_ORIGINS`: Restrict this from `*` to your actual frontend domains if desired.

### 2. Build and Start
Navigate to the root directory where `docker-compose.yml` is located, and run:

```bash
docker-compose up -d --build
```

Docker will:
1. Pull the Redis image.
2. Build the `captcha-backend` image (this packages the pre-compiled WASM assets into the Bun runtime server).
3. Build the `captcha-frontend` image (this builds the Vite app and runs it via our custom `server.ts` bun script).

### 3. Verification
Verify the status of all three containers:
```bash
docker-compose ps
```

Verify the backend logs to ensure it successfully connected to Redis and validated the ENV keys:
```bash
docker-compose logs -f backend
```

## Developing the engine (Optional)
If you make code changes to the Rust engine and need to rebuild the WASM assets before deploying:
```bash
cd backend
./scripts/build-wasm.sh
```
This updates the static assets in `backend/public`, which will then be automatically used on your next `docker-compose build`.

## Stopping the Server
To shut down the entire stack safely:
```bash
docker-compose down
```
