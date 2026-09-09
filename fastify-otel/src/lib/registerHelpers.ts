/**
 * Register all template component helpers with the template engine.
 */
import { registerHelper } from './templateEngine.js';
import { jsonInfo, headAdditional, contentParser, menuMain, menuLeft } from './components.js';
import type { TemplateContext } from '../types/index.js';

registerHelper('jsonInfo', (ctx: TemplateContext) => jsonInfo(ctx));
registerHelper('headAdditional', () => headAdditional());
registerHelper('contentParser', (ctx: TemplateContext) => contentParser(ctx));
registerHelper('menuMain', (ctx: TemplateContext) => menuMain(ctx));
registerHelper('menuLeft', (ctx: TemplateContext) => menuLeft(ctx));
