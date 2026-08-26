FROM node:20-alpine

# Install FFmpeg (needed by workers that process video)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json package-lock.json ./

RUN npm ci --production

# Copy application source code
COPY src/ ./src/

# Create directories the app expects
RUN mkdir -p uploads temp

EXPOSE 4000

# Default: start the API server
CMD ["node", "src/server.js"]
