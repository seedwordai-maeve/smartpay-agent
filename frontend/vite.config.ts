import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production backend Worker URL. Set VITE_API_URL env var to override.
const apiUrl = process.env.VITE_API_URL || 'https://smartpay-api.smartpay-demo.workers.dev'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  define: {
    __VITE_API_URL__: JSON.stringify(apiUrl),
  },
})
