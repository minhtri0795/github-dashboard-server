import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const corsConfig: CorsOptions = {
  origin: [
    'http://localhost:3000', // Local development
    'http://localhost:5173', // Vite default port
    'https://sd-dev.pro', // Production site
    /\.sd-dev\.pro$/, // Any subdomain of sd-dev.pro
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
