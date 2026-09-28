# Runtime image for the hosted (HTTP) MCP. Built on the Pi from the prebuilt dist + lockfile,
# mirroring the backend's thin image: no TypeScript build here, just install prod deps and run.
# The deps (express, @modelcontextprotocol/sdk, zod) are pure JS, so the image is arch-portable.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY dist ./dist

ENV MCP_HTTP=1 \
    MCP_HTTP_PORT=3000
EXPOSE 3000
USER node
CMD ["node", "dist/http.js"]
