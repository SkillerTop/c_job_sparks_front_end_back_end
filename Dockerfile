# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install --global pnpm@11.25.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json

RUN pnpm install --frozen-lockfile


FROM dependencies AS build

COPY . .

ARG VITE_APP_MODE=api
ARG VITE_SHOP_MODE=api
ARG VITE_API_BASE_URL=
ARG VITE_BASE_PATH=/
ARG VITE_PUBLIC_ORIGIN

ENV VITE_APP_MODE=${VITE_APP_MODE}
ENV VITE_SHOP_MODE=${VITE_SHOP_MODE}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_PUBLIC_ORIGIN=${VITE_PUBLIC_ORIGIN}

RUN pnpm build
RUN pnpm --dir server build


FROM node:24-bookworm-slim AS production-dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install --global pnpm@11.25.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json

RUN pnpm install --frozen-lockfile --prod --filter c-job-sparks-server


FROM node:24-bookworm-slim AS api

ENV NODE_ENV=production

WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations

RUN mkdir -p /app/server/data/media \
    && chown -R node:node /app/server/data

WORKDIR /app/server

USER node

EXPOSE 3001

CMD ["node", "dist/src/server.js"]


FROM nginx:stable-alpine AS web

COPY deploy/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
