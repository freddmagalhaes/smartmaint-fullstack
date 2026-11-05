# Estágio 1: Build (Compilação) usando Node 20 (compatível com Vite 8 e React Router 7)
FROM node:20-alpine AS build
WORKDIR /app

# Copia apenas os arquivos de dependência primeiro (aproveita o cache do Docker)
COPY package*.json ./

# Instala as dependências do frontend.
# --ignore-scripts evita o "postinstall" que instalaria o backend (não é necessário aqui)
RUN npm ci --ignore-scripts

# Copia o restante do código e faz o build de produção do React/Vite
COPY . .
RUN npm run build

# Estágio 2: Produção (Servidor Nginx)
FROM nginx:alpine

# Configuração do Nginx: SPA + proxy de /api e /uploads para o backend
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copia a pasta gerada pelo build para o Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Expõe a porta 80 internamente
EXPOSE 80

# Inicia o servidor
CMD ["nginx", "-g", "daemon off;"]
