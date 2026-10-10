# Frontend: builds the Angular app and serves it with nginx, proxying /api/ to the backend's private address.
# The backend has its own Dockerfile in backend/.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/proxy-api.conf /etc/nginx/proxy-api.conf
COPY --from=build /app/dist/productivist/browser /usr/share/nginx/html
# Railway private networking: internal DNS is IPv6 at fd12::10; the backend listens on PORT (pin it to 8080).
ENV BACKEND_ORIGIN="http://productivist-backend.railway.internal:8080" \
    DNS_RESOLVER="[fd12::10]" \
    PORT=8080
EXPOSE 8080
