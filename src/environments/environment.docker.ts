// Usado solo por la imagen Docker (ver asistsca-frontend/Dockerfile y el
// docker-compose.yml de producción). apiUrl es relativo a propósito: el
// navegador llama a este mismo origen (http(s)://tu-dominio/api/...) y es
// Nginx (contenedor "nginx", punto de entrada único) quien reenvía esas
// peticiones al backend por la red interna de Docker — así nunca depende de
// un nombre de contenedor ni de un puerto distinto expuesto al navegador.
export const environment = {
  production: true,
  apiUrl: '/api',
};
