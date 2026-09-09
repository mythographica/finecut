/**
 * OpenTelemetry tracing bootstrap — must be imported FIRST in the entry
 * file, before Nest/Fastify and any other instrumented module, so the
 * auto-instrumentations patch them at load time.
 *
 * Identical setup in every finecut backend; only the service name differs.
 * Spans go to the local Jaeger all-in-one (../../docker-compose.yml).
 *
 * NOTE: this app ALSO carries @mnemonica/dive. The two answer the same
 * question ("where did this fail and with what data?") from opposite ends:
 * OTel via an instrumentation layer, dive via the data itself. The
 * /engine/dive-crash* endpoints exist to show the difference live.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
	resource        : resourceFromAttributes({
		[ ATTR_SERVICE_NAME ] : 'finecut-nest-dive',
	}),
	traceExporter   : new OTLPTraceExporter({
		url : 'http://localhost:4318/v1/traces',
	}),
	instrumentations : [ getNodeAutoInstrumentations() ],
});

sdk.start();
