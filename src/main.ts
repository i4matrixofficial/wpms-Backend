import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1'); // mobile-first: versioned from day 1
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  const config = new DocumentBuilder()
    .setTitle('WPMS Backend API')
    .setDescription('Worker Platform Management System — API documentation')
    .setVersion('1.0')
    .addBearerAuth() // adds the "Authorize" button for JWT
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document); // served at /docs

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
