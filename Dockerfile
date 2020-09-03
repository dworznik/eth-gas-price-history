FROM node:11

RUN apt-get update && apt-get install -y sqlite3

WORKDIR /usr/src/app
COPY package.json ./
RUN npm install

COPY db.sh ./
COPY dump.sh ./
COPY ./fetch.js ./
COPY ./server.js ./
