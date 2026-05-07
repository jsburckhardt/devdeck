# DevDeck — Development Commands
# Usage: just <recipe>

# Default recipe: show available commands
default:
    @just --list

# Start the development server (Next.js + terminal server with token auth)
dev:
    npx tsx src/server/start-dev.mts

# Start only the Next.js dev server (no terminal)
dev-next:
    npm run dev

# Start only the terminal WebSocket server
dev-terminal:
    npm run terminal

# Build the production application
build:
    npm run build

# Start the production server
start:
    npm run start

# Run tests
test:
    npm run test

# Run tests in watch mode
test-watch:
    npm run test:watch

# Run tests with coverage report
test-coverage:
    npm run test:coverage

# Run ESLint
lint:
    npm run lint

# Format code with Prettier
format:
    npm run format

# Check code formatting (no write)
format-check:
    npm run format:check

# Run all checks (lint + format + build + test)
check: lint format-check build test

# Install dependencies
install:
    npm install

# Clean build artifacts and node_modules
clean:
    rm -rf .next node_modules

# Reinstall everything from scratch
reinstall: clean install

# Show project info
info:
    @echo "DevDeck — Web-based Development Environment"
    @echo "Framework: Next.js (App Router)"
    @echo "Terminal:  xterm.js + node-pty via WebSocket"
    @echo "Node:      $(node --version)"
    @echo "npm:       $(npm --version)"
