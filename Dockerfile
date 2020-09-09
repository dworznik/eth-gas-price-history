FROM node:11

RUN apt-get update && apt-get install -y sqlite3

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY *.sh ./
COPY src/ ./
