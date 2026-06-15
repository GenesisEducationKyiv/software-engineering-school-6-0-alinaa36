FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY git-release-notifier-be/package.json git-release-notifier-be/package.json
COPY notification-service/package.json notification-service/package.json

RUN npm ci --ignore-scripts

COPY packages/contracts packages/contracts
COPY notification-service notification-service

RUN npm run build -w @grn/contracts
RUN npm run build -w notification-service

FROM node:20-alpine AS runner

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY git-release-notifier-be/package.json git-release-notifier-be/package.json
COPY notification-service/package.json notification-service/package.json

COPY --from=builder /repo/packages/contracts/dist packages/contracts/dist
COPY --from=builder /repo/notification-service/dist notification-service/dist

RUN npm ci --omit=dev --ignore-scripts

WORKDIR /repo/notification-service

CMD ["node", "dist/index.js"]
