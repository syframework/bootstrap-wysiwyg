<?php
namespace Sy\Test;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\Config;

/**
 * Config is the only place that reads PHP option names. Every rejection here
 * is a bug caught before a page renders, instead of an undefined key in the
 * browser.
 */
class ConfigTest extends TestCase {

	/**
	 * @param array $overrides
	 * @return array
	 */
	private function options(array $overrides = []) {
		return array_merge([
			'element-id' => 'article-content',
			'assets'     => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => 'https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js',
			],
		], $overrides);
	}

	public function testDefaults() {
		$config = Config::resolve($this->options())->toArray();

		$this->assertSame('article-content', $config['id']);
		$this->assertSame('inline', $config['mode']);
		$this->assertTrue($config['container']);
		$this->assertTrue($config['editable']);
		$this->assertSame('', $config['content']);
		$this->assertNull($config['loadUrl']);
		$this->assertSame([], $config['loadData']);
		$this->assertSame([], $config['saveData']);
		$this->assertNull($config['csrf']);
		$this->assertSame(0, $config['csrfRefresh']);
		$this->assertSame([], $config['config']);
		$this->assertNull($config['allowedContent']);
		$this->assertSame(['span', 'i'], $config['preserveEmpty']);
		$this->assertTrue($config['normalizeEmptyBlocks']);
		$this->assertNull($config['templates']);
		$this->assertSame([], $config['templatesFiles']);
		$this->assertSame([], $config['extraPlugins']);
		$this->assertSame([], $config['removePlugins']);
		$this->assertTrue($config['guardUnload']);
		$this->assertFalse($config['components']['enabled']);
		$this->assertArrayNotHasKey('reportOnly', $config['components']);
		$this->assertSame(['interval' => 0, 'onBlur' => false, 'onDialogClose' => false], $config['autosave']);
		$this->assertSame('same-origin', $config['request']['credentials']);
	}

	public function testElementIdIsRequired() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('element-id');
		Config::resolve($this->options(['element-id' => '']));
	}

	/**
	 * The id ends up in an HTML attribute and in a getElementById() call.
	 */
	public function testElementIdMustMatchPattern() {
		foreach (['1-article', 'article content', 'article.content', 'article#content'] as $id) {
			try {
				Config::resolve($this->options(['element-id' => $id]));
				$this->fail("element-id \"$id\" should have been rejected");
			} catch (InvalidArgumentException $e) {
				$this->assertStringContainsString('element-id', $e->getMessage());
			}
		}
	}

	public function testEngineIsRequired() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('assets.engine');
		Config::resolve(['element-id' => 'article-content', 'assets' => ['ckeditor-js' => '/ckeditor.js']]);
	}

	public function testCkeditorJsIsRequired() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('assets.ckeditor-js');
		Config::resolve(['element-id' => 'article-content', 'assets' => ['engine' => '/wysiwyg.js']]);
	}

	/**
	 * A typo in an option name must not silently reach the browser.
	 */
	public function testUnknownOptionsAreIgnored() {
		$config = Config::resolve($this->options(['toolbar' => [['Bold']], 'load_url' => '/x']));

		$this->assertArrayNotHasKey('toolbar', $config->toArray());
		$this->assertArrayNotHasKey('load_url', $config->toArray());
	}

	public function testModeIsValidated() {
		$this->assertSame('classic', Config::resolve($this->options(['mode' => 'classic']))->mode());

		$this->expectException(InvalidArgumentException::class);
		Config::resolve($this->options(['mode' => 'dialog']));
	}

	public function testBooleansAreValidated() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('container');
		Config::resolve($this->options(['container' => 'yes']));
	}

	public function testSaveDataAcceptsScalars() {
		$config = Config::resolve($this->options([
			'save-data' => ['id' => 12, 'lang' => 'fr', 'published' => true, 'draft' => null, 'ratio' => 1.5],
			'load-data' => ['id' => 12, 'lang' => 'fr'],
		]));

		$this->assertSame(
			['id' => 12, 'lang' => 'fr', 'published' => true, 'draft' => null, 'ratio' => 1.5],
			$config->toArray()['saveData']
		);
		$this->assertSame(['id' => 12, 'lang' => 'fr'], $config->toArray()['loadData']);
	}

	public function testSaveDataRejectsArrays() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('scalars');
		Config::resolve($this->options(['save-data' => ['id' => ['12']]]));
	}

	/**
	 * The engine writes content and csrf itself; a consumer key with the same
	 * name would be silently overwritten in the POST body.
	 */
	public function testSaveDataRejectsReservedKeys() {
		foreach (Config::RESERVED_SAVE_KEYS as $key) {
			try {
				Config::resolve($this->options(['save-data' => [$key => 'x']]));
				$this->fail("save-data \"$key\" should have been rejected");
			} catch (InvalidArgumentException $e) {
				$this->assertStringContainsString('reserved', $e->getMessage());
			}
		}
	}

	public function testLoadDataRejectsReservedKey() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('reserved');
		Config::resolve($this->options(['load-data' => ['ts' => 1]]));
	}

	/**
	 * The JSON is inlined in a <script> block: a tag inside a tool label or the
	 * initial content must not close it.
	 */
	public function testJsonEscapesScriptTags() {
		$config = Config::resolve($this->options([
			'content' => '</script><p>ok</p>',
			'config'  => ['toolbar' => [['Bold']]],
		]));

		$this->assertStringNotContainsString('</script>', $config->json());
		$this->assertStringNotContainsString('<p>', $config->json());
		$this->assertStringContainsString('\u003C', $config->json());
	}

	public function testAllowedContent() {
		$this->assertNull(Config::resolve($this->options())->toArray()['allowedContent']);
		$this->assertTrue(Config::resolve($this->options(['allowed-content' => true]))->toArray()['allowedContent']);

		$acf = ['$1' => ['elements' => ['@dtd' => true], 'styles' => false, 'classes' => true]];
		$this->assertSame($acf, Config::resolve($this->options(['allowed-content' => $acf]))->toArray()['allowedContent']);

		$this->expectException(InvalidArgumentException::class);
		Config::resolve($this->options(['allowed-content' => 'true']));
	}

	public function testTemplatesFilesSubstitution() {
		$config = Config::resolve($this->options([
			'assets' => [
				'engine'        => '/assets/js/wysiwyg.js',
				'ckeditor-js'   => '/assets/ckeditor/ckeditor.js',
				'ckeditor-root' => '/sub/assets/ckeditor',
			],
			'templates'       => 'bootstrap-article',
			'templates-files' => ['{CKEDITOR_ROOT}/templates/article/js/{LANG}.js'],
		]));

		$this->assertSame(
			['/sub/assets/ckeditor/templates/article/js/fr.js'],
			$config->toArray()['templatesFiles']
		);
		$this->assertSame('bootstrap-article', $config->toArray()['templates']);
	}

	public function testCkeditorRootIsRequiredWithTemplates() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('assets.ckeditor-root');
		Config::resolve($this->options(['templates' => 'bootstrap-article']));
	}

	public function testPluginsIsRequiredWhenComponentsAreEnabled() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('assets.plugins');
		Config::resolve($this->options(['components' => ['enabled' => true, 'allowlist' => ['A\B']]]));
	}

	public function testNormalizeEmptyBlocksDefaultsToTrue() {
		$this->assertTrue(Config::resolve($this->options())->toArray()['normalizeEmptyBlocks']);
		$this->assertFalse(Config::resolve($this->options(['normalize-empty-blocks' => false]))->toArray()['normalizeEmptyBlocks']);
	}

	public function testEveryCkeditorOptionSurvivesTheMapping() {
		$options = [
			'removeButtons'          => 'Source,-,Bold',
			'extraAllowedContent'    => 'div[data-x]',
			'format_tags'            => 'p;h2;h3',
			'justifyClasses'         => ['text-left', 'text-right'],
			'disallowedContent'      => 'script; *[on*]',
			'title'                  => false,
			'entities'               => false,
			'startupFocus'           => true,
			'clipboard_handleImages' => false,
		];

		$config = Config::resolve($this->options(['config' => $options]))->toArray();

		$this->assertSame($options, $config['config']);
	}

	public function testComponentsMapping() {
		$config = Config::resolve($this->options([
			'assets'     => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/ckeditor.js',
				'plugins'     => '/assets/js/plugins',
			],
			'components' => [
				'enabled'     => true,
				'allowlist'   => ['Sy\Bootstrap\Component\Place\Map'],
			],
		]))->toArray();

		$this->assertTrue($config['components']['enabled']);
		$this->assertSame(['Sy\Bootstrap\Component\Place\Map'], $config['components']['allowlist']);
		$this->assertArrayNotHasKey('reportOnly', $config['components']);
		$this->assertNull($config['components']['renderUrl']);
	}

	public function testComponentsMetadataIsNotBuiltWhenDisabled() {
		$config = Config::resolve($this->options([
			'components' => [
				'allowlist' => ['Sy\Test\Fixtures\Form\Contact'],
			],
		]))->toArray();

		$this->assertFalse($config['components']['enabled']);
		$this->assertArrayNotHasKey('metadata', $config['components']);
	}

	public function testComponentsRenderUrl() {
		$config = Config::resolve($this->options([
			'assets'     => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/ckeditor.js',
				'plugins'     => '/assets/js/plugins',
			],
			'components' => [
				'enabled'    => true,
				'allowlist'  => ['A\B'],
				'render-url' => '/editor/render',
			],
		]))->toArray();

		$this->assertSame('/editor/render', $config['components']['renderUrl']);
	}

	public function testTranslationOptions() {
		$config = Config::resolve($this->options([
			'assets'          => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/ckeditor.js',
			],
			'translations'    => ['hello' => 'bonjour'],
			'translate-url'   => '/api/content-translation',
			'translate-lang'  => 'fr',
			'translate-labels' => ['language' => 'Langue', 'key' => 'Clé'],
		]))->toArray();

		$this->assertSame(['hello' => 'bonjour'], $config['translations']);
		$this->assertSame('/api/content-translation', $config['translateUrl']);
		$this->assertSame('fr', $config['translateLang']);
		$this->assertSame(['language' => 'Langue', 'key' => 'Clé'], $config['translateLabels']);
	}

	public function testTranslateLangDefaultsToNull() {
		$config = Config::resolve($this->options([
			'assets' => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/ckeditor.js',
			],
		]))->toArray();

		$this->assertNull($config['translateLang']);
	}

	public function testComponentsMetadata() {
		$config = Config::resolve($this->options([
			'assets'     => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/ckeditor.js',
				'plugins'     => '/assets/js/plugins',
			],
			'components' => [
				'enabled'   => true,
				'allowlist' => [' \\Sy\\Test\\Fixtures\\Form\\Contact ', '\\Sy\\Test\\Fixtures\\Form\\Contact'],
			],
		]))->toArray();

		$this->assertSame(['Sy\Test\Fixtures\Form\Contact'], $config['components']['allowlist']);
		$this->assertArrayHasKey('Sy\Test\Fixtures\Form\Contact', $config['components']['metadata']);
		$this->assertSame('Form Contact', $config['components']['metadata']['Sy\Test\Fixtures\Form\Contact']['label']);
		$this->assertSame('{CONTACT}', $config['components']['metadata']['Sy\Test\Fixtures\Form\Contact']['slot']);
	}

	public function testUploadMapping() {
		$config = Config::resolve($this->options([
			'upload' => ['image' => ['browse' => '/browse?type=image', 'window' => ['width' => 800]]],
		]))->toArray();

		$this->assertSame('/browse?type=image', $config['upload']['image']['browse']);
		$this->assertNull($config['upload']['image']['upload']);
		$this->assertSame('ajax', $config['upload']['image']['mode']);
		$this->assertSame(800, $config['upload']['image']['window']['width']);
		$this->assertSame(400, $config['upload']['image']['window']['height']);

		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('upload.image.window.width');
		Config::resolve($this->options(['upload' => ['image' => ['window' => ['width' => 0]]]]));
	}

	public function testAutosaveMapping() {
		$config = Config::resolve($this->options([
			'autosave' => ['interval' => 60000, 'on-blur' => true, 'on-dialog-close' => true],
		]))->toArray();

		$this->assertSame(['interval' => 60000, 'onBlur' => true, 'onDialogClose' => true], $config['autosave']);

		$this->expectException(InvalidArgumentException::class);
		Config::resolve($this->options(['autosave' => ['interval' => -1]]));
	}

	public function testConfigMustBeJsonSafe() {
		$this->expectException(InvalidArgumentException::class);
		$this->expectExceptionMessage('JSON-safe');
		Config::resolve($this->options(['config' => ['toolbar' => [new \stdClass()]]]));
	}

}
