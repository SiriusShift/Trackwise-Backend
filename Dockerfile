FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app ./

EXPOSE 5000

CMD ["sh", "start.sh"]
