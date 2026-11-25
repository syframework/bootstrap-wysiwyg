/**
 * `buildConfig`: the CKEditor configuration resolved from the engine options.
 *
 * Everything here is asserted on the config actually handed to CKEditor — the
 * tests go through `create()`/`start()` and read the stub, so they also prove
 * the engine never bypasses `buildConfig`.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {installCkeditor} from './stubs/ckeditor.js';
import {cleanup, createInstance, createNet, destroyAll, flush, mount} from './helpers.js';

async function resolvedConfig(overrides = {}) {
	const element = mount();
	const instance = createInstance(element, overrides, {net: createNet({})});
	await instance.start();
	await flush();
	const config = window.CKEDITOR.__calls[0].config;
	instance.destroy();
	return config;
}

beforeEach(() => {
	cleanup();
	installCkeditor();
});

afterEach(() => {
	destroyAll();
});

describe('buildConfig — consumer config', () => {
	it('keeps every consumer key and never rewrites toolbar', async () => {
		const toolbar = [['Bold', 'Italic']];
		const config = await resolvedConfig({config: {toolbar, language: 'fr', entities: false}});

		expect(config.toolbar).toEqual(toolbar);
		expect(config.language).toBe('fr');
		expect(config.entities).toBe(false);
	});

	it('does not invent a toolbar from the options', async () => {
		const config = await resolvedConfig();

		expect('toolbar' in config).toBe(false);
	});

	it('keeps the component metadata map as-is', async () => {
		const metadata = {'A\\B': {label: 'A B', slot: '{B}', parameters: []}};
		const config = await resolvedConfig({
			components: {enabled: true, allowlist: ['A\\B'], metadata},
			extraPlugins: ['sycomponent'],
			assets: {
				engine: '/assets/js/wysiwyg.js',
				ckeditorJs: '/assets/ckeditor/ckeditor.js',
				ckeditorRoot: '/assets/ckeditor',
				plugins: '/assets/js/plugins',
			},
		});

		expect(config.components.metadata).toEqual(metadata);
	});
});

describe('buildConfig — plugins', () => {
	it('unions extraPlugins as CSV, without duplicates', async () => {
		const config = await resolvedConfig({
			extraPlugins: ['sourcedialog', 'tableresize'],
			config: {extraPlugins: 'sourcedialog,uploadimage'},
		});

		expect(config.extraPlugins).toBe('sourcedialog,uploadimage,tableresize');
	});

	it('unions removePlugins as CSV', async () => {
		const config = await resolvedConfig({
			removePlugins: ['about', 'flash'],
			config: {removePlugins: 'about,smiley'},
		});

		expect(config.removePlugins).toBe('about,smiley,flash');
	});
});

describe('buildConfig — allowedContent', () => {
	it('leaves CKEditor default when allowedContent is null', async () => {
		const config = await resolvedConfig({allowedContent: null});

		expect('allowedContent' in config).toBe(false);
	});

	it('passes true through', async () => {
		const config = await resolvedConfig({allowedContent: true});

		expect(config.allowedContent).toBe(true);
	});

	it('resolves the @dtd sentinel without mutating the options', async () => {
		const allowedContent = {
			$1: {elements: {'@dtd': true}, attributes: true, styles: false, classes: true},
		};
		const config = await resolvedConfig({allowedContent});

		expect(config.allowedContent.$1.elements).toBe(window.CKEDITOR.dtd);
		// The option tree is untouched: a second start() must rebuild it.
		expect(allowedContent.$1.elements).toEqual({'@dtd': true});
	});

	it('lets an explicit config.allowedContent win', async () => {
		const config = await resolvedConfig({
			allowedContent: {p: {classes: 'x'}},
			config: {allowedContent: true},
		});

		expect(config.allowedContent).toBe(true);
	});
});

describe('buildConfig — templates', () => {
	it('sets templates when no config value exists', async () => {
		const config = await resolvedConfig({templates: 'bootstrap-article'});

		expect(config.templates).toBe('bootstrap-article');
	});

	it('sets templates_files and defaults templates to "default"', async () => {
		const config = await resolvedConfig({templatesFiles: ['/assets/ckeditor/templates/article/js/fr.js']});

		expect(config.templates_files).toEqual(['/assets/ckeditor/templates/article/js/fr.js']);
		expect(config.templates).toBe('default');
	});

	it('does not override templates_files from config', async () => {
		const config = await resolvedConfig({
			templatesFiles: ['/from/options.js'],
			config: {templates_files: ['/from/config.js']},
		});

		expect(config.templates_files).toEqual(['/from/config.js']);
	});
});

describe('buildConfig — uploads', () => {
	it('maps image and file URLs onto every CKEditor key, with the json flag', async () => {
		const config = await resolvedConfig({
			upload: {
				image: {browse: '/editor/article/browse?type=image', upload: '/editor/article/upload?type=image', mode: 'ajax', window: {width: 400, height: 400}},
				file: {browse: '/editor/article/browse?type=file', upload: '/editor/article/upload?type=file', mode: 'ajax', window: {width: 400, height: 400}},
			},
		});

		expect(config.filebrowserImageBrowseUrl).toContain('/editor/article/browse');
		expect(config.filebrowserBrowseUrl).toContain('/editor/article/browse');
		expect(hasJsonFlag(config.filebrowserImageBrowseUrl)).toBe(false);
		expect(hasJsonFlag(config.filebrowserImageUploadUrl)).toBe(true);
		expect(hasJsonFlag(config.imageUploadUrl)).toBe(true);
		expect(hasJsonFlag(config.filebrowserUploadUrl)).toBe(true);
		expect(hasJsonFlag(config.uploadUrl)).toBe(true);
	});

	it('adds no json flag in dialog mode', async () => {
		const config = await resolvedConfig({
			upload: {
				image: {browse: null, upload: '/editor/article/upload', mode: 'dialog', window: {width: 400, height: 400}},
				file: {browse: null, upload: null, mode: 'ajax', window: {width: 400, height: 400}},
			},
		});

		expect(hasJsonFlag(config.filebrowserImageUploadUrl)).toBe(false);
	});

	it('never overrides an explicit filebrowser key', async () => {
		const config = await resolvedConfig({
			upload: {
				image: {browse: null, upload: '/from/options', mode: 'ajax', window: {width: 400, height: 400}},
				file: {browse: null, upload: null, mode: 'ajax', window: {width: 400, height: 400}},
			},
			config: {filebrowserImageUploadUrl: '/from/config'},
		});

		expect(config.filebrowserImageUploadUrl).toBe('/from/config');
		// imageUploadUrl is a distinct key: it still gets the option value.
		expect(hasJsonFlag(config.imageUploadUrl)).toBe(true);
	});

	it('maps the dialog window size, without overriding an explicit one', async () => {
		const config = await resolvedConfig({
			upload: {
				image: {browse: null, upload: null, mode: 'ajax', window: {width: 200, height: 300}},
				file: {browse: null, upload: null, mode: 'ajax', window: {width: 400, height: 400}},
			},
			config: {filebrowserWindowWidth: 640},
		});

		expect(config.filebrowserWindowWidth).toBe(640);
		expect(config.filebrowserWindowHeight).toBe(300);
	});
});

function hasJsonFlag(url) {
	if (!url) return false;
	return new URL(url, 'http://localhost').searchParams.has('json');
}
