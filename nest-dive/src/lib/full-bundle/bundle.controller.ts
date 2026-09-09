/**
 * BundleController — the CREATION site of the full-bundle demo, built on the
 * adapter shortcuts:
 *
 *   mti — MnemonicaThunderstruckInterceptor, applied per-controller: pre-root
 *         feeding happens on THESE routes only, not app-wide.
 *   mvp — MnemonicaValidationPipe: validates the DTO, feeds it to the
 *         collector, then constructs the mnemonica instance — so the
 *         "creation traced" stack frame points into the adapter's pipe,
 *         distinct from definition and invocation.
 *
 * Two failure shapes are served:
 *
 *   POST /bundle/invoice        — sync construction inside the pipe: the
 *                                 failure is a handled 500 carrying the full
 *                                 bundle (see bundle.filter.ts).
 *   POST /bundle/invoice-async  — fire-and-forget async construction: the
 *                                 rejection escapes as a REAL process-level
 *                                 unhandledRejection; the bundle is captured
 *                                 by rejection-report.ts and polled back via
 *                                 GET /bundle/rejection-report?requestId=...
 *   POST /bundle/strict-invoice — the class-fields gap: a TypeØmatica strict
 *                                 DTO whose native class fields bypass the
 *                                 guard; the postCreation hook compares,
 *                                 finalizes, and proves the guard afterwards.
 *                                 Report: GET /bundle/strict-report?requestId=...
 */
import { Controller, Get, Post, Body, Query, Res, UseInterceptors, UseFilters } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { lookup } from 'mnemonica/module';
import { mti, mvp } from '@mnemonica/nestjs';
import type { InvoiceEntityInstance } from './invoice.types.js';
import './invoice.types.js'; // side effect: defaultTypes.define('InvoiceEntity')
import type { InvoiceAsyncData } from './invoice-async.types.js';
import './invoice-async.types.js'; // side effect: defaultTypes.define('InvoiceEntityAsync')
import type { StrictInvoiceEntityData, StrictInvoiceEntityInstance } from './strict-invoice.types.js';
import './strict-invoice.types.js'; // side effect: defaultTypes.define('StrictInvoiceEntity')
import { CreateInvoiceDto } from './invoice.dto.js';
import { FullBundleFilter } from './bundle.filter.js';
import { armRejectionCapture, readRejectionReport } from './rejection-report.js';
import { armStrictFinalize, readStrictReport } from './strict-report.js';

const InvoiceEntity = lookup('InvoiceEntity');
const InvoiceEntityAsync = lookup('InvoiceEntityAsync');
const StrictInvoiceEntity = lookup('StrictInvoiceEntity');

@Controller('bundle')
@UseInterceptors(mti)
@UseFilters(FullBundleFilter)
export class BundleController {
	@Post('invoice')
	createInvoice (
		@Body(mvp.forType(InvoiceEntity, CreateInvoiceDto))
		invoice: InvoiceEntityInstance,
	): InvoiceEntityInstance {
		// Success path: the instance carries its preRoot wiring; the global
		// MnemonicaSerializerInterceptor (autoExtract) flattens it for JSON.
		return invoice;
	}

	@Post('invoice-async')
	createInvoiceAsync (
		@Body() body: InvoiceAsyncData,
	): { requestId: string } {
		armRejectionCapture();
		// Fire-and-forget ON PURPOSE: the construction promise is deliberately
		// not awaited and not caught, so a failing invariant surfaces as a
		// genuine unhandledRejection at process level — that escape IS the demo.
		// Do NOT copy this pattern into real code: normal consumption of an
		// async type is `const instance = await new InvoiceEntityAsync(body)`
		// (see core docs/async-constructors.md). Awaiting here would turn the
		// escape into a handled 500 — which is what the sync route above
		// already demonstrates.
		void new InvoiceEntityAsync(body);
		return { requestId: body.requestId };
	}

	/**
	 * Retrieval endpoint for the async demo. 404 { ready: false } until the
	 * process-level rejection has been captured; then the full bundle.
	 */
	@Get('rejection-report')
	rejectionReport (@Query('requestId') requestId: string, @Res() res: FastifyReply) {
		const report = readRejectionReport(String(requestId || ''));
		if (!report) {
			return res.status(404).type('application/json').send({
				ready : false,
				requestId,
			});
		}
		return res.type('application/json').send(report);
	}

	/**
	 * The class-fields gap. The construction is sync, so the postCreation
	 * hook (comparator + finalize + proof) has already run when the response
	 * leaves — the report is immediately available via /bundle/strict-report.
	 */
	@Post('strict-invoice')
	createStrictInvoice (
		@Body() body: StrictInvoiceEntityData,
	): { requestId: string } {
		armStrictFinalize();
		const entity = new StrictInvoiceEntity(body) as StrictInvoiceEntityInstance;
		// TypeØmatica boxes guarded primitives; read through .valueOf()
		return { requestId: entity.dto.requestId.valueOf() };
	}

	@Get('strict-report')
	strictReport (@Query('requestId') requestId: string, @Res() res: FastifyReply) {
		const report = readStrictReport(String(requestId || ''));
		if (!report) {
			return res.status(404).type('application/json').send({
				ready : false,
				requestId,
			});
		}
		return res.type('application/json').send(report);
	}
}
