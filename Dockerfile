FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Seoul PORT=8080
COPY server.mjs ./
COPY public ./public
RUN mkdir -p data
EXPOSE 8080
CMD ["node", "server.mjs"]
