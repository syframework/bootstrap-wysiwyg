<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentFilter;

class ComponentFilterTest extends TestCase {

	private $logFile;

	protected function setUp(): void {
		$this->logFile = tempnam(sys_get_temp_dir(), 'sy-cf-');
		ini_set('error_log', $this->logFile);
	}

	protected function tearDown(): void {
		ini_set('error_log', '');
		if (is_file($this->logFile)) unlink($this->logFile);
	}

	#[RunInSeparateProcess]
	public function testArticleAllowlistIsEmptyWithoutProjectConfiguration() {
		$this->assertSame([], ComponentFilter::allowlist('article'));
	}

	public function testProjectAllowlistIsMergedWithDefaults() {
		if (!defined('WYSIWYG_COMPONENT_ALLOWLIST')) {
			define('WYSIWYG_COMPONENT_ALLOWLIST', [
				'article' => [' \\Project\\Component\\Foo ', '', '\\Project\\Component\\Foo'],
				'invalid' => 'not-an-array',
			]);
		}

		$this->assertSame(
			['A\\B', 'Project\\Component\\Foo'],
			ComponentFilter::allowlist('article', ['\\A\\B'])
		);
		$this->assertSame(['C\\D'], ComponentFilter::allowlist('missing', ['C\\D']));
		$this->assertSame([], ComponentFilter::allowlist('invalid', []));
	}

	public function testEmptyInput() {
		$this->assertSame('', ComponentFilter::sanitize('', []));
		$this->assertSame('', ComponentFilter::sanitize(null, []));
	}

	public function testAllowedComponentIsKept() {
		$html = '<div data-sycomponent="A\\B" data-sycomponent-args="{}" class="my-3">carte</div>';
		$out  = ComponentFilter::sanitize($html, ['A\\B']);

		$this->assertSame($html, $out);
	}

	public function testLeadingBackslashInMarkerMatchesAllowlist() {
		$html = '<div data-sycomponent="\\A\\B">carte</div>';

		$this->assertSame($html, ComponentFilter::sanitize($html, ['A\\B']));
	}

	public function testLeadingBackslashInAllowlistMatchesMarker() {
		$html = '<div data-sycomponent="A\\B">carte</div>';

		$this->assertSame($html, ComponentFilter::sanitize($html, ['\\A\\B']));
	}

	public function testUnknownComponentKeepsRealText() {
		$out = ComponentFilter::sanitize(
			'<div data-sycomponent="Unknown"><b>texte</b> réel</div>',
			['A\\B']
		);

		$this->assertSame('texte réel', $out);
		$this->assertStringNotContainsString('data-sycomponent', $out);
	}

	public function testUnknownComponentWithoutTextIsRemoved() {
		$this->assertSame('', ComponentFilter::sanitize('<div data-sycomponent="Unknown"></div>', []));
		$this->assertSame('', ComponentFilter::sanitize('<div data-sycomponent="Unknown">   </div>', []));
	}

	public function testUnknownComponentWithSlotPlaceholderIsRemoved() {
		$this->assertSame('', ComponentFilter::sanitize('<div data-sycomponent="Unknown">{SLOT}</div>', []));
		$this->assertSame('', ComponentFilter::sanitize('<div data-sycomponent="Unknown"> {SLOT} </div>', []));
	}

	public function testClassAttributeDoesNotConfuseTheFilter() {
		$html = '<p class="text-center">x</p>';
		$this->assertSame($html, ComponentFilter::sanitize($html, []));
	}

	public function testInvalidHtmlDoesNotBreakTheFilter() {
		$html = '<div data-sycomponent="Unknown\\Class"><p>unclosed';
		$out  = ComponentFilter::sanitize($html, ['Allowed\\One']);

		$this->assertStringContainsString('unclosed', $out);
		$this->assertStringNotContainsString('data-sycomponent', $out);
	}

	public function testEmptyAllowlistDeniesEveryComponent() {
		// Article has no server-side component: everything must be neutralized
		$this->assertSame('texte', ComponentFilter::sanitize('<div data-sycomponent="A">texte</div>', []));
	}

	public function testSlotAttributeIsNeverAdded() {
		$out = ComponentFilter::sanitize('<div data-sycomponent="A\\B">x</div>', ['A\\B']);

		$this->assertStringNotContainsString('data-sycomponent-slot', $out);
	}

	public function testNestedComponentsAreBothProcessed() {
		$html = '<div data-sycomponent="A"><div data-sycomponent="B">inner</div></div>';
		$out  = ComponentFilter::sanitize($html, []);

		$this->assertStringNotContainsString('data-sycomponent', $out);
		$this->assertStringContainsString('inner', $out);
	}

	public function testNeutralizationIsLogged() {
		ComponentFilter::sanitize('<div data-sycomponent="Unknown">x</div>', []);

		$this->assertStringContainsString('ComponentFilter', (string) file_get_contents($this->logFile));
		$this->assertStringContainsString('Unknown', (string) file_get_contents($this->logFile));
	}

	public function testAllowedComponentIsNotLogged() {
		ComponentFilter::sanitize('<div data-sycomponent="A\\B">x</div>', ['A\\B']);

		$this->assertSame('', (string) file_get_contents($this->logFile));
	}

	public function testUnchangedHtmlIsReturnedVerbatim() {
		$html = '<p>a</p><p>b</p>';

		$this->assertSame($html, ComponentFilter::sanitize($html, []));
	}

}
