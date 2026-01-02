FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Remove build dependencies to reduce image size
RUN apk del python3 make g++

# Copy source code
COPY . .

# Build frontend and server
RUN npm run build && npm run build:server

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/conversations.db
ENV PORT=3000

# Run Express server (serves both API and static files)
CMD ["node", "dist-server/index.js"]
