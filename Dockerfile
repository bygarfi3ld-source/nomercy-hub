FROM node:24-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app
COPY server.js ./server.js
COPY clan-hq.js ./clan-hq.js
COPY clan-bank.js ./clan-bank.js
COPY public ./public
# /data is mounted as a persistent volume in production (see README)
EXPOSE 3030
CMD ["node", "server.js"]
