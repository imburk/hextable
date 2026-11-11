# Runs the table server, which also serves the game itself.
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm run build
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "packages/server/src/index.js"]
