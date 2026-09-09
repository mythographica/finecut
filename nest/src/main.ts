/**
 * FineCut NestJS — Bootstrap
 *
 * Uses NestJS with Fastify adapter to match finecutnode's HTTP layer.
 * Static files are served by finecut-bff (port 3002), not this backend.
 */
// tracing must load first: it patches http/fastify at import time
import { reportProcessError, flushTracing } from './tracing.js';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

// Process-level failures → Jaeger error span, then exit (standard pattern):
// an uncaught error leaves the process in undefined state — report, flush, die.
process.on('uncaughtException', async (err) => {
	reportProcessError(err, 'uncaughtException');
	console.error(err);
	await flushTracing();
	process.exit(1);
});
process.on('unhandledRejection', async (reason) => {
	if (reason instanceof Error) {
		reportProcessError(reason, 'unhandledRejection');
		console.error(reason);
		await flushTracing();
	}
	process.exit(1);
});

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
