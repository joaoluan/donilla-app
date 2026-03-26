FROM node:20-alpine

ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY . .
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run prisma:generate
RUN chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "--disable-proto=throw", "index.js"]
