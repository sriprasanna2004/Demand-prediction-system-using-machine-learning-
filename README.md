# AI-Based Demand Forecasting & Inventory Optimization System

## Architecture Overview

```
┌─────────────────┐     WebSocket/REST     ┌──────────────────────┐
│  React Frontend │ ◄──────────────────── │  Node.js API Server  │
│   (Vercel)      │                        │     (Render)         │
└─────────────────┘                        └──────────┬───────────┘
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              │                        │                        │
                    ┌─────────▼──────┐      ┌─────────▼──────┐      ┌─────────▼──────┐
                    │   MongoDB      │      │  Python ML     │      │  External APIs │
                    │   Database     │      │  Microservice  │      │  Weather/Market│
                    │               │      │   (Railway)    │      │               │
                    └───────────────┘      └───────────────┘      └───────────────┘
```

## Data Flow
1. Simulation engine inserts sales every 5s → MongoDB
2. Node.js emits via Socket.io → React dashboard updates live
3. Prediction requests → Node.js merges DB + external API data → Python ML → response
4. Fallback: if sparse data, ML uses category averages + trend interpolation

## Quick Start
See each service's README for setup instructions.
