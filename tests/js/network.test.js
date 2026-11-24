/**
 * Network contract (§2.4): what is sent, in which shape, and how a response is
 * classified. The transport is injected, so no request leaves jsdom.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installCkeditor} from './stubs/ckeditor.js';
import {cleanup, createInstance, createNet, destroyAll, flush, mount} from './helpers.js';

beforeEach(() => {
	cleanup();
	installCkeditor();
});

afterEach(() => {
	destroyAll();
	vi.unstubAllGlobals();
});

async function started(overrides = {}, routes = {}) {
	const element = mount('article-content', '<p>initial</p>');
	const net = createNet(routes);
	const instance = createInstance(element, overrides, {net});
	await instance.start();
	await flush();
	return {element, instance, net, editor: window.CKEDITOR.instances['article-content']};
}

function parse(url) {
	return new URL(url, 'http://localhost');
}

describe('loading', () => {
	it('passes load-data to the transport and nothing else', async () => {
		const {net} = await started({
			loadUrl: '/api/article',
			loadData: {id: 42, lang: 'fr'},
		});

		expect(net.calls[0].method).toBe('GET');
		expect(net.calls[0].url).toBe('/api/article');
		expect(net.calls[0].data).toEqual({id: 42, lang: 'fr'});
	});

	it('adds ts and load-data to the URL with the default transport', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({status: 'ok', content: '<p>x</p>'}),
		}));
		vi.stubGlobal('fetch', fetchMock);

		const element = mount('article-content', '');
		const instance = createInstance(element, {
			loadUrl: '/api/article',
			loadData: {id: 42, lang: 'fr'},
		});
		await instance.start();

		const url = parse(fetchMock.mock.calls[0][0]);
		expect(url.searchParams.get('id')).toBe('42');
		expect(url.searchParams.get('lang')).toBe('fr');
		expect(url.searchParams.get('ts')).toBeTruthy();
	});
});

describe('saving', () => {
	it('posts content, csrf then save-data, with no extra field', async () => {
		const {instance, net, editor} = await started({
			saveUrl: '/api/article',
			saveData: {id: 42, lang: 'fr'},
			csrf: 'token-1',
		});

		editor.setData('<p>edited</p>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(post.url).toBe('/api/article');
		expect(post.data).toEqual({content: '<p>edited</p>', csrf: 'token-1', id: 42, lang: 'fr'});
		expect(Object.keys(post.data).slice(0, 2)).toEqual(['content', 'csrf']);
	});

	it('adds no business field when save-data is empty', async () => {
		const {instance, net, editor} = await started({saveUrl: '/api/article'});

		editor.setData('<p>edited</p>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(Object.keys(post.data)).toEqual(['content', 'csrf']);
	});

	it('strips empty paragraphs from the payload only', async () => {
		const {instance, net, editor} = await started({saveUrl: '/api/article'});

		editor.setData('<p>a</p><p>&nbsp;</p><p> </p><p><br></p><div></div><span>&nbsp;</span>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(post.data.content).toBe('<p>a</p><div></div><span>&nbsp;</span>');
		// The editor content is untouched: normalisation is payload only.
		expect(editor.getData()).toContain('<p>&nbsp;</p>');
	});

	it('keeps empty paragraphs when normalizeEmptyBlocks is false', async () => {
		const {instance, net, editor} = await started({
			saveUrl: '/api/article',
			normalizeEmptyBlocks: false,
		});

		editor.setData('<p>a</p><p>&nbsp;</p>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(post.data.content).toBe('<p>a</p><p>&nbsp;</p>');
	});

	it('sends the content a listener wrote into wysiwyg:save', async () => {
		const {instance, net, editor} = await started({saveUrl: '/api/article'});

		document.addEventListener('wysiwyg:save', (event) => {
			event.detail.content = 'REPLACED';
		}, {once: true});

		editor.setData('<p>edited</p>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(post.data.content).toBe('REPLACED');
	});

	it('never lets save-data shadow the reserved content and csrf keys', async () => {
		const {instance, net, editor} = await started({
			saveUrl: '/api/article',
			csrf: 'token-1',
			saveData: {content: 'hijacked', csrf: 'hijacked', id: 7},
		});

		editor.setData('<p>edited</p>');
		await instance.save();

		const post = net.calls.find((call) => call.method === 'POST');
		expect(post.data.content).toBe('<p>edited</p>');
		expect(post.data.csrf).toBe('token-1');
		expect(post.data.id).toBe(7);
	});

	it('prefers content over its html alias and warns when both are sent', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const element = mount('article-content', '<p>page</p>');
		const instance = createInstance(element, {saveUrl: '/api/article'}, {
			net: createNet({
				post: () => ({ok: true, status: 200, data: {status: 'ok', content: '<p>A</p>', html: '<p>B</p>'}}),
			}),
		});

		await instance.start();
		await flush();
		await instance.save();

		expect(instance.getLastSaved().content).toBe('<p>A</p>');
		expect(warn).toHaveBeenCalled();
	});
});

describe('error classification', () => {
	it('replays exactly once on status "ko" with a fresh csrf', async () => {
		let attempt = 0;
		const {instance, net, editor} = await started(
			{saveUrl: '/api/article', csrf: 'old'},
			{
				post() {
					attempt += 1;
					return attempt === 1
						? {ok: false, status: 400, data: {status: 'ko', message: 'Too slow', csrf: 'new'}}
						: {ok: true, status: 200, data: {status: 'ok', content: '<p>edited</p>'}};
				},
			},
		);

		editor.setData('<p>edited</p>');
		const result = await instance.save();

		const posts = net.calls.filter((call) => call.method === 'POST');
		expect(posts).toHaveLength(2);
		expect(posts[1].data.csrf).toBe('new');
		expect(result.ok).toBe(true);
	});

	it('keeps the editor open on a 5xx (retryable)', async () => {
		const {instance} = await started(
			{saveUrl: '/api/article'},
			{post: () => ({ok: false, status: 500, data: null})},
		);

		const result = await instance.save();

		expect(result.retryable).toBe(true);
		expect(instance.isStarted()).toBe(true);
	});

	it('destroys and restores the last saved content on 413', async () => {
		let attempt = 0;
		const {element, instance} = await started(
			{saveUrl: '/api/article'},
			{
				post() {
					attempt += 1;
					return attempt === 1
						? {ok: true, status: 200, data: {status: 'ok', content: '<p>server</p>'}}
						: {ok: false, status: 413, data: {status: 'ko', message: 'Content too large'}};
				},
			},
		);

		await instance.save();
		expect(instance.getLastSaved().content).toBe('<p>server</p>');

		await instance.save();

		expect(instance.isStarted()).toBe(false);
		expect(element.innerHTML).toBe('<p>server</p>');
	});
});
