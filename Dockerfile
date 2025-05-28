# Dockerfile
FROM node:18

# Instalar LibreOffice
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer puerto
EXPOSE 3000

# Iniciar aplicación
CMD ["npm", "start"]
