/**
 * FullBundleModule — the self-contained Thunderstruck demo slice:
 * bundle.controller + bundle.filter, types defined on defaultTypes.
 */
import { Module } from '@nestjs/common';
import { BundleController } from './bundle.controller.js';

@Module({
	controllers: [BundleController],
})
export class FullBundleModule {}
