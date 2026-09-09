import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The dive-crash demo routes deliberately fire REAL uncaughtException
		// and unhandledRejection errors — surviving and inspecting them at
		// process level is the feature under test. The app registers its own
		// handlers (app.module.ts, lib/dive-demo/report.ts), so vitest must
		// not fail the run for "unhandled" errors that are, in fact, handled.
		dangerouslyIgnoreUnhandledErrors : true,
	},
});
