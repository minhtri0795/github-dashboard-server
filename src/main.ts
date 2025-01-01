import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { corsConfig } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure CORS
  app.enableCors(corsConfig);

  app.useGlobalPipes(new ValidationPipe());

  // Heroku dynamically assigns port
  const port = process.env.PORT || 3000;
  console.log(`Application starting on port ${port}`);

  await app.listen(port, '0.0.0.0');
}
bootstrap();
