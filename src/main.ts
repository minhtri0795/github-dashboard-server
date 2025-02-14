import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { corsConfig } from './config/cors.config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('Gitdash API')
    .setDescription('The Gitdash API description')
    .setVersion('1.0')
    .addTag('gitdash')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  // Configure CORS
  app.enableCors(corsConfig);

  app.useGlobalPipes(new ValidationPipe());

  // Heroku dynamically assigns port
  const port = process.env.PORT || 3000;
  console.log(`Application starting on port ${port}`);

  await app.listen(port, '0.0.0.0');
}
bootstrap();
