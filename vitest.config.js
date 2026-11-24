import {defineConfig} from 'vitest/config';

// The engine runs in the browser, against `window` and a loaded CKEditor. jsdom
// provides the first, `tests/js/stubs/ckeditor.js` the second.
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['tests/js/**/*.test.js'],
		restoreMocks: true,
	},
});
