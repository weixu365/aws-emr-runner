FROM node:alpine

LABEL author="SEEK AIPS CQ"
LABEL maintainer="SEEK AIPS CQ"

RUN mkdir /app
WORKDIR /app

COPY src /app/src
COPY package* /app/

RUN npm install
