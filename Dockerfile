FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apk add --no-cache openssl \
  && corepack enable \
  && corepack prepare pnpm@11.23.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN pnpm --filter @mitrede/contracts exec tsc -b --force \
  && pnpm --filter @mitrede/api build \
  && pnpm --filter @mitrede/web build

FROM build AS api

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @mitrede/api exec prisma migrate deploy && pnpm --filter @mitrede/api start"]

FROM nginx:1.27-alpine AS web

COPY infra/nginx/mitrede.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /srv/mitrede/web

EXPOSE 80
