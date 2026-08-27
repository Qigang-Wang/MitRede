import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  const production = config.get<string>("NODE_ENV") === "production";
  const allowedOrigins = new Set(
    (config.get<string>("WEB_ORIGIN") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (production && allowedOrigins.size === 0) {
    throw new Error("WEB_ORIGIN muss in der Produktionsumgebung gesetzt sein.");
  }
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || !production || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error("Origin ist nicht erlaubt"), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("MitRede API")
    .setDescription("HTTP API für interaktive PDF-Präsentationen")
    .setVersion("0.3.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.get<number>("PORT", 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
