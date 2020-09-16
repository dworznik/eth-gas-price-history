FROM node:12

RUN apt-get update && apt-get install -y sqlite3

WORKDIR /usr/src/app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY *.sh ./
COPY dist/ ./
