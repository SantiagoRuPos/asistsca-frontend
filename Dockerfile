# syntax=docker/dockerfile:1

# ---- Etapa 1: build ----
# Compila el SPA de Angular con la configuracion "docker" (ver angular.json
# y src/environments/environment.docker.ts): apiUrl queda como '/api',
# relativo, para que el navegador siempre llame al mismo origen que sirve
# el frontend -- es Nginx (fuera de este contenedor) quien reenvia /api/*
# al backend. Usa npm (package-lock.json ya existente en este proyecto).
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration=production,docker

# ---- Etapa 2: runtime ----
# Solo el build estatico resultante + un Nginx minimo para servirlo. No
# lleva Node ni node_modules -- la imagen final es mucho mas chica.
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/asistsca-frontend/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
