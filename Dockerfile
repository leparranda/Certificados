# Dockerfile
FROM node:18-alpine

# Instalar LibreOffice y dependencias
RUN apk add --no-cache \
    libreoffice \
    ttf-dejavu \
    fontconfig \
    && fc-cache -f

# Crear directorio de la aplicación
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]