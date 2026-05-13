FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY shared/package.json shared/

RUN npm ci --workspaces

COPY shared/ shared/
COPY server/ server/
COPY client/ client/

RUN npm run build --workspace=client

EXPOSE 3000 3001

CMD ["npx", "tsx", "server/src/index.ts"]
