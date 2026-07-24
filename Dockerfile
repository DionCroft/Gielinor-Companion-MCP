# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable

COPY . .
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm --filter @gielinor/hosted-server... build
RUN corepack pnpm --filter @gielinor/hosted-server deploy --prod --legacy /opt/gielinor

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV GIELINOR_HOST=0.0.0.0
ENV GIELINOR_HOSTED_PORT=3333
ENV GIELINOR_HOSTED_DATA_DIR=/data

RUN groupadd --system --gid 10001 gielinor \
  && useradd --system --uid 10001 --gid gielinor --home-dir /nonexistent --shell /usr/sbin/nologin gielinor \
  && mkdir -p /data \
  && chown gielinor:gielinor /data

WORKDIR /app
COPY --from=build --chown=gielinor:gielinor /opt/gielinor ./

USER 10001:10001
EXPOSE 3333
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
