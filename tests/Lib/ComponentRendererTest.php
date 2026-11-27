<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentRenderer;
use Sy\Component\WebComponent;
use Sy\Test\Fixtures\AssetComponent;
use Sy\Test\Fixtures\RenderedComponent;
use Sy\Test\Fixtures\TranslatedComponent;

class ComponentRendererTest extends TestCase {

	private $logFile;

	protected function setUp(): void {
		$this->logFile = tempnam(sys_get_temp_dir(), 'sy-cr-');
		ini_set('error_log', $this->logFile);
	}

	protected function tearDown(): void {
		ini_set('error_log', '');
		if (is_file($this->logFile)) unlink($this->logFile);
	}

	public function testRendersAnAllowedComponentAndKeepsTheMarker() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent" data-sycomponent-args="{&quot;text&quot;:&quot;Hello&quot;}">{SLOT}</div>';
		$out  = ComponentRenderer::render($html, [RenderedComponent::class]);

		$this->assertStringContainsString('<span class="fixture">Hello</span>', $out);
		$this->assertStringContainsString('data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent"', $out);
		$this->assertStringNotContainsString('{SLOT}', $out);
	}

	public function testEmptySlotIsRenderedToo() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent" data-sycomponent-args="{&quot;text&quot;:&quot;Hello&quot;}"></div>';
		$out  = ComponentRenderer::render($html, [RenderedComponent::class]);

		$this->assertStringContainsString('<span class="fixture">Hello</span>', $out);
		$this->assertStringContainsString('data-sycomponent=', $out);
	}

	public function testLeadingBackslashInMarkerIsAccepted() {
		$html = '<div data-sycomponent="\\Sy\\Test\\Fixtures\\RenderedComponent">{SLOT}</div>';
		$out  = ComponentRenderer::render($html, [RenderedComponent::class]);

		$this->assertStringContainsString('<span class="fixture">component</span>', $out);
	}

	public function testDisallowedComponentIsLeftUntouched() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent">{SLOT}</div>';

		$this->assertSame($html, ComponentRenderer::render($html, []));
	}

	public function testInvalidArgumentsLeaveThePlaceholderInPlace() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent" data-sycomponent-args="{invalid}">{SLOT}</div>';

		$this->assertSame($html, ComponentRenderer::render($html, [RenderedComponent::class]));
		$this->assertStringContainsString('invalid arguments', (string) file_get_contents($this->logFile));
	}

	/**
	 * A renamed constructor parameter used to disappear behind `Unknown named
	 * parameter`: the log now names the argument and the wrapper stays.
	 */
	public function testUnknownArgumentIsLoggedAndLeavesThePlaceholderInPlace() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent" data-sycomponent-args="{&quot;oldName&quot;:&quot;x&quot;}">{SLOT}</div>';

		$this->assertSame($html, ComponentRenderer::render($html, [RenderedComponent::class]));
		$this->assertStringContainsString('unknown argument', (string) file_get_contents($this->logFile));
	}

	public function testPositionalArgumentsAreRefused() {
		$html = '<div data-sycomponent="Sy\\Test\\Fixtures\\RenderedComponent" data-sycomponent-args="[&quot;x&quot;]">{SLOT}</div>';

		$this->assertSame($html, ComponentRenderer::render($html, [RenderedComponent::class]));
		$this->assertStringContainsString('invalid argument name', (string) file_get_contents($this->logFile));
	}

	public function testContainerTranslatorsAreAvailableToComponents() {
		$html      = '<div data-sycomponent="Sy\\Test\\Fixtures\\TranslatedComponent">{SLOT}</div>';
		$container = new WebComponent();
		$container->addTranslator(__DIR__ . '/../Fixtures/lang', 'php', 'fr');
		$out = ComponentRenderer::render($html, [TranslatedComponent::class], $container);

		$this->assertStringContainsString('Composant traduit', $out);
		$this->assertStringNotContainsString('component.label', $out);
	}

	public function testComponentAssetsAreMerged() {
		$html      = '<div data-sycomponent="Sy\\Test\\Fixtures\\AssetComponent">{SLOT}</div>';
		$container = new WebComponent();
		$out       = ComponentRenderer::render($html, [AssetComponent::class], $container);

		$js = '';
		foreach ($container->getJsCode(WebComponent::JS_BOTTOM) as $byLoad) {
			foreach ($byLoad as $code) $js .= "\n" . $code;
		}

		$this->assertStringContainsString('<span class="asset">asset</span>', $out);
		$this->assertStringContainsString('.asset { color: red; }', $container->getCssCode());
		$this->assertStringContainsString('console.log("asset");', $js);
	}

}
