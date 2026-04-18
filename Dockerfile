FROM node:18-alpine AS frontend-build

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci || npm --prefix frontend install

COPY frontend ./frontend
RUN npm --prefix frontend run build

FROM node:18-alpine AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server.js http-wrapper.js ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
