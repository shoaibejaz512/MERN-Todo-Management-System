FROM node:22-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy application
COPY . .

# Run as non-root user
USER node

# Expose port
EXPOSE 5000

# Start application
CMD ["npm", "start"]