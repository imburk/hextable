# Runs the table server, which also serves the game itself.
# Stage 1 builds dist/ from the sources; stage 2 holds only what the server needs at run time:
# the built game, the rules (the server imports them) and the server. No docs, reference text, tests or scripts.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts/build.mjs scripts/
COPY packages/client packages/client
COPY packages/rules/src packages/rules/src
COPY assets/models assets/models
# CI passes the commit it built (--build-arg GITHUB_SHA=...) so dist/build.json names it; Railway passes nothing and the server reads its own variables instead.
ARG GITHUB_SHA
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json docker-entrypoint.mjs ./
# scripts/backup.mjs: the same backup the server runs nightly, for a one-off run in the container (node scripts/backup.mjs)
COPY scripts/backup.mjs scripts/
COPY packages/rules/src packages/rules/src
COPY packages/server/src packages/server/src
COPY --from=build /app/dist dist
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
# DATA_DIR exists and belongs to `node`, so a plain Docker volume starts out writable. No VOLUME line: Railway refuses to build a Dockerfile that has one.
RUN mkdir /data && chown node:node /data
EXPOSE 8080
# The entrypoint starts as root, fixes the ownership of DATA_DIR (a Railway volume arrives root-owned),
# then drops to the `node` user before the server starts. See packages/server/README.md.
ENTRYPOINT ["node", "docker-entrypoint.mjs"]
