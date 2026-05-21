FROM node:22-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Expose the port defined in vite.config.ts
EXPOSE 8080

# Command to run dev server
CMD ["npm", "run", "dev"]
