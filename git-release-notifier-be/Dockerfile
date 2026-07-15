FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY git-release-notifier-be/package.json git-release-notifier-be/package.json
COPY notification-service/package.json notification-service/package.json
COPY git-release-notifier-be/prisma git-release-notifier-be/prisma

RUN npm ci --ignore-scripts

COPY packages/contracts packages/contracts
COPY git-release-notifier-be git-release-notifier-be

RUN npm run build -w @grn/contracts
RUN npx prisma generate --schema=git-release-notifier-be/prisma/schema.prisma
RUN npm run build -w git-release-notifier-be

FROM node:20-alpine AS runner

WORKDIR /repo

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY git-release-notifier-be/package.json git-release-notifier-be/package.json
COPY notification-service/package.json notification-service/package.json
COPY git-release-notifier-be/prisma git-release-notifier-be/prisma
COPY git-release-notifier-be/prisma.config.ts git-release-notifier-be/prisma.config.ts

COPY --from=builder /repo/packages/contracts/dist packages/contracts/dist
COPY --from=builder /repo/git-release-notifier-be/dist git-release-notifier-be/dist

RUN npm ci --omit=dev --ignore-scripts
RUN npx prisma generate --schema=git-release-notifier-be/prisma/schema.prisma

WORKDIR /repo/git-release-notifier-be

EXPOSE 3000

CMD npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start
