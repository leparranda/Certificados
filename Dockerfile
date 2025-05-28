FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-dejavu \
    fontconfig \
 && fc-cache -f \
 && apt-get clean

