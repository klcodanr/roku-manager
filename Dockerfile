FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig*.json vite.config.ts ./
COPY packages/core/package.json packages/core/package.json
COPY packages/service/package.json packages/service/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/core packages/core
COPY packages/service packages/service
COPY packages/web packages/web
RUN pnpm --filter @roku-manager/service build

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "packages/service/dist/index.js"]
