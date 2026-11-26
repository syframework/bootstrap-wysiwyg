import {defineConfig} from 'vitest/config';

// The engine runs in the browser, against `window` and a loaded CKEditor. jsdom
// provides the first, `tests/js/stubs/ckeditor.js` the second.
export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['tests/js/**/*.test.js'],
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			reporter: ['text'],
			// Only the shipped engine is measured: `assets/ckeditor` and the
			// vendored libraries are third-party code copied by the installer.
			include: ['assets/js/wysiwyg.js', 'assets/js/plugins/sy*.js'],
			thresholds: {
				statements: 80,
				branches: 80,
				functions: 80,
				lines: 80,
			},
		},
	},
});
