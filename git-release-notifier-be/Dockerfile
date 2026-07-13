FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate --schema=prisma/schema.prisma

RUN npm run build

RUN mkdir -p dist/grpc/proto && \
    find src -name "subscription.proto" -exec cp {} dist/grpc/proto/subscription.proto \;
    

RUN mkdir -p dist/docs && cp src/docs/swagger.yaml dist/docs/swagger.yaml

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./

COPY --from=builder /app/dist ./dist

COPY --from=builder /app/prisma ./prisma

COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN npm ci --omit=dev

RUN npx prisma generate --schema=prisma/schema.prisma

EXPOSE 3000

CMD npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start