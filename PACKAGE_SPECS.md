# PACKAGE_SPECS.md
# All package.json files for the monorepo.
# Create each file at the exact path shown.
# Use exact version numbers — do not use ^ or ~ unless noted.

---

## 1. Root — `package.json`

```json
{
  "name": "outreach-agent",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=apps/api\" \"npm run dev --workspace=apps/worker\" \"npm run dev --workspace=apps/web\"",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "db:migrate": "npm run migrate --workspace=packages/db",
    "db:seed": "npm run seed --workspace=packages/db",
    "db:studio": "npm run studio --workspace=packages/db",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "7.18.0",
    "@typescript-eslint/parser": "7.18.0",
    "concurrently": "9.1.0",
    "eslint": "8.57.0",
    "prettier": "3.3.3",
    "typescript": "5.5.4"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

---

## 2. API Service — `apps/api/package.json`

```json
{
  "name": "@outreach/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "0.32.1",
    "@outreach/ai": "*",
    "@outreach/db": "*",
    "@outreach/integrations": "*",
    "@outreach/shared": "*",
    "bcryptjs": "2.4.3",
    "bullmq": "5.13.0",
    "compression": "1.7.4",
    "cors": "2.8.5",
    "csv-parse": "5.5.6",
    "dotenv": "16.4.5",
    "express": "4.19.2",
    "express-rate-limit": "7.4.0",
    "helmet": "7.1.0",
    "ioredis": "5.4.1",
    "jsonwebtoken": "9.0.2",
    "multer": "1.4.5-lts.1",
    "uuid": "10.0.0",
    "winston": "3.14.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "2.4.6",
    "@types/compression": "1.7.5",
    "@types/cors": "2.8.17",
    "@types/express": "4.17.21",
    "@types/jsonwebtoken": "9.0.6",
    "@types/multer": "1.4.11",
    "@types/node": "20.16.5",
    "@types/uuid": "10.0.0",
    "tsx": "4.19.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

---

## 3. Worker Service — `apps/worker/package.json`

```json
{
  "name": "@outreach/worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@outreach/ai": "*",
    "@outreach/db": "*",
    "@outreach/integrations": "*",
    "@outreach/shared": "*",
    "bullmq": "5.13.0",
    "dotenv": "16.4.5",
    "ioredis": "5.4.1",
    "winston": "3.14.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "tsx": "4.19.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

---

## 4. Web Frontend — `apps/web/package.json`

```json
{
  "name": "@outreach/web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-alert-dialog": "1.1.1",
    "@radix-ui/react-avatar": "1.1.0",
    "@radix-ui/react-badge": "1.0.0",
    "@radix-ui/react-dialog": "1.1.1",
    "@radix-ui/react-dropdown-menu": "2.1.1",
    "@radix-ui/react-label": "2.1.0",
    "@radix-ui/react-select": "2.1.1",
    "@radix-ui/react-separator": "1.1.0",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-tabs": "1.1.0",
    "@radix-ui/react-toast": "1.2.1",
    "@radix-ui/react-tooltip": "1.1.2",
    "@tanstack/react-query": "5.56.2",
    "@tanstack/react-table": "8.20.5",
    "axios": "1.7.7",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "date-fns": "3.6.0",
    "lucide-react": "0.438.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "7.53.0",
    "react-router-dom": "6.26.2",
    "recharts": "2.12.7",
    "tailwind-merge": "2.5.2",
    "tailwindcss-animate": "1.0.7",
    "zod": "3.23.8",
    "@hookform/resolvers": "3.9.0"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "@types/react": "18.3.5",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.45",
    "tailwindcss": "3.4.10",
    "typescript": "5.5.4",
    "vite": "5.4.3",
    "vitest": "2.0.5"
  }
}
```

---

## 5. Database Package — `packages/db/package.json`

```json
{
  "name": "@outreach/db",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "migrate": "prisma migrate dev",
    "migrate:prod": "prisma migrate deploy",
    "seed": "tsx prisma/seed.ts",
    "studio": "prisma studio",
    "generate": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "5.19.1",
    "dotenv": "16.4.5"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "prisma": "5.19.1",
    "tsx": "4.19.0",
    "typescript": "5.5.4"
  }
}
```

---

## 6. AI Package — `packages/ai/package.json`

```json
{
  "name": "@outreach/ai",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@anthropic-ai/sdk": "0.32.1",
    "@outreach/db": "*",
    "@outreach/shared": "*",
    "dotenv": "16.4.5",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "tsx": "4.19.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

---

## 7. Integrations Package — `packages/integrations/package.json`

```json
{
  "name": "@outreach/integrations",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@outreach/shared": "*",
    "axios": "1.7.7",
    "dotenv": "16.4.5",
    "resend": "4.0.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "tsx": "4.19.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

---

## 8. Shared Package — `packages/shared/package.json`

```json
{
  "name": "@outreach/shared",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.16.5",
    "typescript": "5.5.4"
  }
}
```

---

## 9. Root `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

---

## 10. `docker-compose.yml`

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: outreach
      POSTGRES_PASSWORD: outreach_dev_password
      POSTGRES_DB: outreach_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U outreach"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/api/src:/app/apps/api/src  # Hot reload in dev

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: development
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

---

## 11. `.gitignore`

```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
.next/

# Environment files
.env
.env.local
.env.production

# Secrets — never commit these
*.pem
*.key
*.cert

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea/

# Prisma
packages/db/prisma/migrations/

# Test coverage
coverage/
```
