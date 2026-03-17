# Noise CAPTCHA - Installation Manual
This guide explains how to build and deploy the complete Noise CAPTCHA application using `docker-compose`.

## Features
- **Multi-Architecture Support**: The backend Dockerfile uses `--platform=$BUILDPLATFORM` for the Rust/WASM builder so it will cross-compile seamlessly on both ARM64 (like Apple Silicon / AWS Graviton) and AMD64 architectures natively.
- **Reference Script Integration**: We natively execute `scripts/build-wasm.sh` during the backend builder stage to guarantee a perfectly reproducible `engine.wasm` asset output just like your local builds.
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
2. Build the `captcha-backend` image (this compiles the WASM using your local `scripts/build-wasm.sh` and packages it into the Bun runtime server).
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

## Stopping the Server
To shut down the entire stack safely:
```bash
docker-compose down
```
