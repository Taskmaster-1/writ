# One image for both processes: the gateway (default) and the console (`bun run console`).
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/console/package.json apps/console/
COPY packages/policy/package.json packages/policy/
COPY packages/store/package.json packages/store/
COPY packages/upstream/package.json packages/upstream/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# GATEWAY_URL is read when the console's rewrites are built; compose overrides it at runtime.
ARG GATEWAY_URL=http://gateway:8790
ENV GATEWAY_URL=${GATEWAY_URL}
RUN cd apps/console && bun run build

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
EXPOSE 8790 3000
CMD ["bun", "apps/gateway/src/main.ts"]
