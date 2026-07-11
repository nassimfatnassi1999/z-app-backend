import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  console.log('Loading environment...');
  console.log('Loading Deepgram configuration...');
  console.log('Loading Groq configuration...');
  console.log('Loading Prisma...');
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  const port = config.port;
  const production = config.nodeEnvironment === 'production';
  const allowedOrigins = config.corsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (production) app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.enableCors({
    origin(origin, callback) {
      if (
        !origin ||
        (!production && allowedOrigins.length === 0) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Origin is not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Request-Id'],
  });
  app.setGlobalPrefix('api/v1');
  app.use((request: Request & { requestId?: string }, response: Response, next: NextFunction) => {
    request.requestId = request.header('x-request-id')?.slice(0, 100) || randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    if (production)
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const documentConfig = new DocumentBuilder()
    .setTitle('Z API')
    .setDescription('Local API for Z email generation workflows')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  if (!production || config.swaggerEnabled) {
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, documentConfig));
  }

  await app.listen(port, '0.0.0.0');
  console.log('Environment loaded successfully');
  console.log(`Deepgram:\nModel : ${config.deepgramModel}`);
  console.log(
    `Groq:\nPrimary : ${config.groqPrimaryModel}\nFallback : ${config.groqFallbackModel}`,
  );
  console.log('Database:\nConnected');
  console.log(`Node:\n${production ? 'Production' : 'Development'}`);
  console.log('Application started successfully.');
}

bootstrap();
