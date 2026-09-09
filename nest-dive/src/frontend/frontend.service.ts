/**
 * FrontendService — Page loading and rendering logic.
 * Mirrors finecutnode/src/lib/fileUtils.ts and page rendering.
 */
import { Injectable } from '@nestjs/common';
import path from 'path';
import { settings } from '../core/settings.js';

const ROOT = process.cwd();

@Injectable()
export class FrontendService {
	parseUrl (url: string): string {
		let uri = decodeURIComponent(url);
		uri = uri.replace(/index\.(php|htm|html)/g, '');
		uri = uri.replace(/_index\/?/g, '');
		uri = uri.replace(/^\//, '').replace(/\/$/, '');
		return '/' + uri;
	}

	resolvePagePath (pagePath: string): string {
		return path.join(ROOT, settings.pages, pagePath);
	}

	resolveTemplatePath (templateName: string): string {
		return path.join(ROOT, 'views', 'templates', templateName, 'index.html');
	}
}
