/**
 * Lifecycle (§2.7, D6, D6 bis, D12, D17, D23): event order, `lastSaved`,
 * restoration, destroy idempotence, one `beforeunload` and autosave.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installCkeditor} from './stubs/ckeditor.js';
import {cleanup, createInstance, createNet, destroyAll, flush, mount, recordEvents} from './helpers.js';

let events;

beforeEach(() => {
	cleanup();
	installCkeditor();
	events = recordEvents(['ready', 'start', 'change', 'save', 'saved', 'error', 'stopped', 'destroyed']);
});

afterEach(() => {
	destroyAll();
	events.stop();
	vi.useRealTimers();
});

describe('start', () => {
	it('fires ready before start and captures the pre-load HTML', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {
			loadUrl: '/api/article',
			loadData: {id: 1},
		}, {net: createNet({get: () => ({ok: true, status: 200, data: {status: 'ok', content: '<p>loaded</p>'}})})});

		await instance.start();
		await flush();

		expect(events.events.map((event) => event.name).slice(0, 2)).toEqual(['ready', 'start']);
		expect(events.of('start')[0].detail.originalHtml).toBe('<p>page</p>');
		expect(element.innerHTML).toBe('<p>loaded</p>');
	});

	it('adopts the csrf returned by the load request', async () => {
		const net = createNet({
			get: () => ({ok: true, status: 200, data: {status: 'ok', content: '<p>loaded</p>', csrf: 'fresh'}}),
		});
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {
			loadUrl: '/api/article',
			saveUrl: '/api/article',
			csrf: 'stale',
		}, {net});

		await instance.start();
		await flush();
		await instance.save();

		expect(net.calls.find((call) => call.method === 'POST').data.csrf).toBe('fresh');
	});

	it('reports a missing element instead of throwing', async () => {
		const instance = createInstance(null, {}, {net: createNet({})});

		await instance.start();
		await flush();

		expect(events.of('error')[0].detail.retryable).toBe(false);
		expect(events.of('error')[0].detail.message).toContain('not found');
	});
});

describe('save', () => {
	it('stores lastSaved as an object and emits saved', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'},
			{net: createNet({post: () => ({ok: true, status: 200, data: {status: 'ok', content: '<p>server</p>'}})})});

		await instance.start();
		await flush();
		window.CKEDITOR.instances['article-content'].setData('<p>edited</p>');
		await instance.save();

		expect(instance.getLastSaved()).toEqual({content: '<p>server</p>'});
		expect(events.of('saved')).toHaveLength(1);
		expect(events.of('saved')[0].detail.content).toBe('<p>server</p>');
	});

	it('falls back to editor.getData() when the response carries no content', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'},
			{net: createNet({post: () => ({ok: true, status: 200, data: {status: 'ok'}})})});

		await instance.start();
		await flush();
		window.CKEDITOR.instances['article-content'].setData('<p>edited</p>');
		await instance.save();

		expect(instance.getLastSaved().content).toBe('<p>edited</p>');
	});
});

describe('stop', () => {
	it('saves, then restores the server content into the DOM', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'},
			{net: createNet({post: () => ({ok: true, status: 200, data: {status: 'ok', content: '<p>server</p>'}})})});

		await instance.start();
		await flush();
		const editor = window.CKEDITOR.instances['article-content'];
		editor.setData('<p>edited</p>');
		editor.fire('change');

		const result = await instance.stop();
		await flush();

		expect(result).toEqual({saved: true, dirty: false, content: '<p>server</p>'});
		expect(element.innerHTML).toBe('<p>server</p>');
		expect(events.of('stopped')[0].detail.saved).toBe(true);
	});

	it('restores the original HTML when nothing was ever saved', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'}, {net: createNet({})});

		await instance.start();
		await flush();
		await instance.stop({save: false});
		await flush();

		expect(element.innerHTML).toBe('<p>page</p>');
		expect(element.innerHTML).not.toBe('undefined');
		expect(instance.getLastSaved()).toBeNull();
	});

	it('keeps the editor open and the content dirty when the save is retryable', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'},
			{net: createNet({post: () => ({ok: false, status: 503, data: null})})});

		await instance.start();
		await flush();
		const editor = window.CKEDITOR.instances['article-content'];
		editor.setData('<p>edited</p>');
		editor.fire('change');

		const result = await instance.stop();
		await flush();

		expect(result.saved).toBe(false);
		expect(result.dirty).toBe(true);
		expect(instance.isStarted()).toBe(true);
		expect(events.of('stopped')[0].detail.saved).toBe(false);
	});
});

describe('destroy', () => {
	it('is idempotent and emits wysiwyg:destroyed once', async () => {
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {}, {net: createNet({})});

		await instance.start();
		await flush();
		instance.destroy();
		instance.destroy();
		await flush();

		expect(events.of('destroyed')).toHaveLength(1);
	});
});

describe('beforeunload', () => {
	it('binds one global listener for every dirty instance, and releases it', async () => {
		const add = vi.spyOn(window, 'addEventListener');
		const remove = vi.spyOn(window, 'removeEventListener');

		const first = createInstance(mount('a'), {id: 'a'}, {net: createNet({})});
		const second = createInstance(mount('b'), {id: 'b'}, {net: createNet({})});
		await first.start();
		await second.start();
		await flush();

		window.CKEDITOR.instances.a.fire('change');
		window.CKEDITOR.instances.b.fire('change');

		const bound = add.mock.calls.filter(([name]) => name === 'beforeunload');
		expect(bound).toHaveLength(1);

		first.destroy();
		second.destroy();

		expect(remove.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
	});

	it('does not bind when guardUnload is false', async () => {
		const add = vi.spyOn(window, 'addEventListener');
		const instance = createInstance(mount('c'), {id: 'c', guardUnload: false}, {net: createNet({})});

		await instance.start();
		await flush();
		window.CKEDITOR.instances.c.fire('change');

		expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(0);
	});
});

describe('autosave', () => {
	it('saves on the configured interval only when dirty', async () => {
		vi.useFakeTimers();
		const net = createNet({});
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {
			saveUrl: '/api/article',
			autosave: {interval: 1000, onBlur: false, onDialogClose: false},
		}, {net});

		await instance.start();
		const editor = window.CKEDITOR.instances['article-content'];

		// Clean editor: the timer must not post anything.
		await vi.advanceTimersByTimeAsync(1000);
		expect(net.calls.filter((call) => call.method === 'POST')).toHaveLength(0);

		editor.setData('<p>edited</p>');
		editor.fire('change');
		await vi.advanceTimersByTimeAsync(1000);

		expect(net.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
		expect(instance.isDirty()).toBe(false);
	});
});
