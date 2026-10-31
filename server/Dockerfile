FROM node:24-slim
WORKDIR /app
COPY electron/collaboration/roles.cjs ./electron/collaboration/roles.cjs
COPY server ./server
ENV HOST=0.0.0.0
ENV PORT=8787
ENV DB_PATH=/data/collab.db
ENV DEV_AUTH=false
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server/index.cjs"]
