# Docker Deployment Guide — JEEVIKA ERP (JA-HCL-31)

This document provides a comprehensive guide for containerized deployment of **JEEVIKA ERP** using Docker and Docker Compose.

---

## Architecture Overview

The containerized stack consists of:

```
                  ┌───────────────────────────────┐
                  │          Host / Client        │
                  │   Browser / Desktop UI (5002) │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
               ┌─────────────────────────────────────┐
               │    Container: jeevika-api (5002)    │
               │   ASP.NET Core 8 (.NET Web Host)    │
               │   - Web Assets & SPA Frontend       │
               │   - REST API Controllers            │
               │   - Communication Outbox Worker     │
               │   - Health Checks (/health)         │
               └──────────────────┬──────────────────┘
                                  │
                                  ▼
               ┌─────────────────────────────────────┐
               │  Container: jeevika-postgres (5432) │
               │   PostgreSQL 16 Relational DB       │
               │   - Persistent volume: postgres_data│
               └─────────────────────────────────────┘
```

---

## Prerequisites

1. **Docker Engine**: v24.0 or higher
2. **Docker Compose**: v2.20 or higher
3. Minimum 2GB RAM and 5GB disk space allocated to Docker daemon.

---

## Configuration Files

1. `Dockerfile`: Multi-stage build (.NET 8 SDK -> ASP.NET Core 8 Runtime with `libgdiplus` and native font libraries for PDF generation).
2. `docker-compose.yml`: Defines `postgres` and `api` services with health checks and persistent volume binding.
3. `.dockerignore`: Excludes build artifacts, secrets (`.env`), Git history, and transient logs.
4. `.env`: Environment variables loaded into the container runtime.

---

## Quickstart Instructions

### Step 1: Initialize Environment File
Copy the example template to create your production `.env` file:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Configure your environment variables in `.env`:
```env
APP_ENVIRONMENT=Production
APP_PORT=5002

DATABASE_PROVIDER=postgresql
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DATABASE=jeevika
POSTGRES_USER=jeevika
POSTGRES_PASSWORD=your_secure_db_password

ENCRYPTION_KEY=your_generated_32_byte_aes_key
COMMUNICATION_ENABLED=true
COMMUNICATION_WORKER_ENABLED=true
COMMUNICATION_WORKER_INTERVAL_MS=1000
```

### Step 2: Build the Container Images
```bash
docker compose build
```

### Step 3: Start Services in Background
```bash
docker compose up -d
```

### Step 4: Verify Container Status & Logs
```bash
# Check service health and running status
docker compose ps

# Follow API runtime logs
docker compose logs -f api

# Follow PostgreSQL logs
docker compose logs -f postgres
```

---

## Health Check Verification

The API exposes a health check endpoint at `/health`.

```bash
curl -i http://localhost:5002/health
```

Expected JSON response:
```json
{
  "status": "Healthy",
  "database": "Healthy",
  "timestamp": "2026-09-28T14:45:00Z"
}
```

---

## Operational Commands Reference

| Operation | Command | Notes |
| :--- | :--- | :--- |
| **Start Stack** | `docker compose up -d` | Launches services in background |
| **Stop Stack** | `docker compose down` | Stops containers without deleting database data |
| **Restart Stack** | `docker compose restart` | Soft restarts containers |
| **Rebuild Stack** | `docker compose build --no-cache && docker compose up -d` | Rebuilds after source code modifications |
| **View Logs** | `docker compose logs -f` | Tails output for all services |
| **Execute SQL Shell** | `docker compose exec postgres psql -U jeevika -d jeevika` | Interactive PostgreSQL terminal |
| **⚠️ Danger (Wipe Data)** | `docker compose down -v` | **WARNING:** Removes persistent DB volume |

---

## Persistent Data & Database Backups

Database records are stored in the named Docker volume `postgres_data`.

### Creating a Database Backup:
```bash
docker compose exec -T postgres pg_dump -U jeevika jeevika > backup_$(date +%Y%m%d).sql
```

### Restoring from Backup:
```bash
docker compose exec -T postgres psql -U jeevika -d jeevika < backup_20260928.sql
```
