<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\UploadPolicy;

class UploadPolicyTest extends TestCase {

	public function testDefaultImageExtensions() {
		$extensions = UploadPolicy::allowedExtensions('image');
		$this->assertContains('jpg', $extensions);
		$this->assertContains('webp', $extensions);
		$this->assertNotContains('svg', $extensions);
		$this->assertNotContains('php', $extensions);
	}

	public function testDefaultFileExtensions() {
		$extensions = UploadPolicy::allowedExtensions('file');
		$this->assertContains('pdf', $extensions);
		$this->assertContains('docx', $extensions);
		$this->assertNotContains('html', $extensions);
		$this->assertNotContains('js', $extensions);
	}

	public function testUnknownTypeIsEmpty() {
		$this->assertSame([], UploadPolicy::allowedExtensions('unknown'));
	}

	public function testGlobalOverride() {
		$this->assertSame(
			['jpg', 'avif'],
			$this->isolatedExtensions(
				'define("WYSIWYG_UPLOAD_EXTENSIONS", ["image" => ["jpg", "avif"]]);'
				. 'echo json_encode(\\Sy\\Bootstrap\\Wysiwyg\\Lib\\UploadPolicy::allowedExtensions("image"));'
			)
		);
	}

	public function testEditorOverrideWins() {
		$this->assertSame(
			['jpg', 'png'],
			$this->isolatedExtensions(
				'define("WYSIWYG_UPLOAD_EXTENSIONS", ['
				. '"image" => ["jpg", "webp"],'
				. '"article" => ["image" => ["jpg", "png"]]'
				. ']);'
				. 'echo json_encode(\\Sy\\Bootstrap\\Wysiwyg\\Lib\\UploadPolicy::allowedExtensions("image", "article"));'
			)
		);
	}

	public function testEditorFallsBackToGlobal() {
		$this->assertSame(
			['jpg', 'webp'],
			$this->isolatedExtensions(
				'define("WYSIWYG_UPLOAD_EXTENSIONS", ["image" => ["jpg", "webp"]]);'
				. 'echo json_encode(\\Sy\\Bootstrap\\Wysiwyg\\Lib\\UploadPolicy::allowedExtensions("image", "content"));'
			)
		);
	}

	public function testDeniedExtensionsAreAlwaysFiltered() {
		$this->assertSame(
			['jpg'],
			$this->isolatedExtensions(
				'define("WYSIWYG_UPLOAD_EXTENSIONS", ['
				. '"image" => ["jpg", "php", "svg", "js"]'
				. ']);'
				. 'echo json_encode(\\Sy\\Bootstrap\\Wysiwyg\\Lib\\UploadPolicy::allowedExtensions("image"));'
			)
		);
	}

	/**
	 * @param string $code
	 * @return array
	 */
	private function isolatedExtensions($code) {
		$autoload = var_export(__DIR__ . '/../../vendor/autoload.php', true);
		$command  = escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg('require ' . $autoload . ';' . $code) . ' 2>&1';
		exec($command, $output);
		$json = trim(implode("\n", $output));
		$decoded = json_decode($json, true);
		$this->assertIsArray($decoded, $json);
		return $decoded;
	}

}
