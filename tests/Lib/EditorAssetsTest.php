<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\EditorAssets;

class EditorAssetsTest extends TestCase {

	public function testEngineDefaultsToWebRoot() {
		$this->assertSame('/webroot/assets/js/wysiwyg.js', EditorAssets::engine());
	}

	public function testVersionIsAStamp() {
		$version = EditorAssets::version();

		// Released installs stamp the tag, dev installs the file mtime: either
		// way it moves when the assets move, which is what busts the cache.
		$this->assertNotSame('', $version);
		$this->assertMatchesRegularExpression('/^[0-9A-Za-z._-]+$/', $version);
	}

	public function testVersionConstantWins() {
		$output = $this->runIsolated(
			'define("WYSIWYG_VERSION", "2026.11");'
			. 'echo \\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::version();'
		);

		$this->assertSame('2026.11', $output);
	}

	public function testJsFallsBackToCdn() {
		$this->assertStringContainsString('cdn.ckeditor.com', EditorAssets::js());
		$this->assertStringEndsWith('/ckeditor.js', EditorAssets::js());
	}

	public function testRootDefaultsToWebRoot() {
		$this->assertSame('/webroot/assets/ckeditor', EditorAssets::root());
	}

	public function testPluginsDefaultsToWebRoot() {
		$this->assertSame('/webroot/assets/js/plugins', EditorAssets::plugins());
	}

	/**
	 * Constants are global and tests/conf.php defines WEB_ROOT: both cases are
	 * exercised in a child process that only loads the autoloader.
	 *
	 * @dataProvider missingWebRootProvider
	 */
	public function testMissingWebRootThrows($method) {
		$this->assertSame('WEB_ROOT is not defined', $this->runIsolated(
			'try { \\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::' . $method . '(); echo "NO-EXCEPTION"; }'
			. 'catch (\\RuntimeException $e) { echo $e->getMessage(); }'
		));
	}

	public static function missingWebRootProvider() {
		return [
			'engine'  => ['engine'],
			'root'    => ['root'],
			'plugins' => ['plugins'],
		];
	}

	public function testConstantsWin() {
		$output = $this->runIsolated(
			'define("WYSIWYG_ENGINE", "https://cdn.example/wysiwyg.js");'
			. 'define("WYSIWYG_PLUGINS", "https://cdn.example/plugins");'
			. 'define("CKEDITOR_JS", "https://cdn.example/ckeditor.js");'
			. 'define("CKEDITOR_ROOT", "https://cdn.example/ckeditor");'
			. 'echo \\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::engine(), "|",'
			. '\\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::plugins(), "|",'
			. '\\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::js(), "|",'
			. '\\Sy\\Bootstrap\\Wysiwyg\\Lib\\EditorAssets::root();'
		);

		$this->assertSame(
			'https://cdn.example/wysiwyg.js|https://cdn.example/plugins|https://cdn.example/ckeditor.js|https://cdn.example/ckeditor',
			$output
		);
	}

	/**
	 * Run PHP code in a fresh process, with the autoloader only.
	 *
	 * @param string $code
	 * @return string
	 */
	private function runIsolated($code) {
		$autoload = var_export(__DIR__ . '/../../vendor/autoload.php', true);
		$command  = escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg('require ' . $autoload . ';' . $code) . ' 2>&1';

		exec($command, $output);

		return trim(implode("\n", $output));
	}

}
