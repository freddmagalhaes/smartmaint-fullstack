
# Estágio 1: Build (Compilação) usando Node 20 (compatível com Vite 8 e React Router 7)
FROM node:20-alpine as build
WORKDIR /app

# Copia TODO o código do projeto para dentro do container primeiro
# Isso resolve o erro do "postinstall" garantindo que a pasta "server" exista
COPY . .

# Instala as dependências principais e roda os scripts de postinstall
RUN npm install

# Faz o build de produção do React/Vite
RUN npm run build

# Estágio 2: Produção (Servidor Nginx)
FROM nginx:alpine

# Copia a pasta gerada pelo build para o Nginx
# NOTA: O Vite normalmente gera a pasta "dist". Se falhar aqui, mude "/app/dist" para "/app/build"
COPY --from=build /app/dist /usr/share/nginx/html

# Expõe a porta 80 internamente
EXPOSE 80

# Inicia o servidor
CMD ["nginx", "-g", "daemon off;"]