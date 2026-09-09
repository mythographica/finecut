/**
 * FineCut NestJS — Bootstrap
 *
 * Uses NestJS with Fastify adapter to match finecutnode's HTTP layer.
 * Static files are served by finecut-bff (port 3002), not this backend.
 */
// tracing must load first: it patches http/fastify at import time
import './tracing.js';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap () {
	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter()
	);

	await app.listen(PORT, '0.0.0.0');
	console.log(`FineCut-NestJS listening on http://0.0.0.0:${PORT}`);
}

bootstrap();
