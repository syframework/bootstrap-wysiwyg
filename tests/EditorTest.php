<?php
namespace Sy\Test;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Editor;

/**
 * The component owns the container, the two script links and the single
 * create() call. These tests pin the rendered HTML and the load order, which
 * the browser cannot recover from if they are wrong.
 */
class EditorTest extends TestCase {

	/**
	 * @param array $overrides
	 * @return Editor
	 */
	private function editor(array $overrides = []) {
		return new Editor(array_merge([
			'element-id' => 'article-content',
			'assets'     => [
				'engine'      => '/assets/js/wysiwyg.js',
				'ckeditor-js' => '/assets/ckeditor/ckeditor.js',
			],
		], $overrides));
	}

	/**
	 * @param Editor $editor
	 * @return string
	 */
	private function jsCode(Editor $editor) {
		$blocks = [];
		foreach ($editor->getJsCode(Editor::JS_BOTTOM) as $byLoad) {
			foreach ($byLoad as $code) $blocks[] = $code;
		}
		return implode("\n", $blocks);
	}

	public function testInlineContainer() {
		$editor = $this->editor(['content' => '<p>Hello</p>']);

		$this->assertSame('<div id="article-content"><p>Hello</p></div>', $editor->render());
	}

	public function testClassicContainer() {
		$editor = $this->editor(['mode' => 'classic', 'content' => '<p>Hello</p>']);

		$this->assertSame('<textarea id="article-content"><p>Hello</p></textarea>', $editor->render());
	}

	/**
	 * container => false: the consumer rendered the element itself, the engine
	 * attaches to it. The component must still ship the assets and the call.
	 */
	public function testContainerFalseRendersNothingButKeepsTheScripts() {
		$editor = $this->editor(['container' => false]);

		$this->assertSame('', $editor->render());
		$this->assertCount(2, $editor->getJsLinks()[Editor::JS_BOTTOM]);
		$this->assertStringContainsString('getElementById("article-content")', $this->jsCode($editor));
	}

	/**
	 * A reader without the update right: sanitized HTML, no CKEditor download
	 * and no engine.
	 */
	public function testReadOnlyRendersTheContainerWithoutScripts() {
		$editor = $this->editor(['editable' => false, 'content' => '<p>Read only</p>']);

		$this->assertSame('<div id="article-content"><p>Read only</p></div>', $editor->render());
		$this->assertSame([], $editor->getJsLinks()[Editor::JS_TOP]);
		$this->assertSame([], $editor->getJsLinks()[Editor::JS_BOTTOM]);
		$this->assertSame([], $editor->getJsCode(Editor::JS_BOTTOM));
	}

	/**
	 * D19 bis: preserve-empty mutates CKEDITOR.dtd, so ckeditor.js must be
	 * loaded before the engine, and both before the inline call.
	 */
	public function testCkeditorIsLoadedBeforeTheEngine() {
		$links = $this->editor()->getJsLinks();

		$this->assertSame([], $links[Editor::JS_TOP]);
		$this->assertSame(
			['/assets/ckeditor/ckeditor.js', '/assets/js/wysiwyg.js'],
			array_map(function ($link) { return $link['url']; }, array_values($links[Editor::JS_BOTTOM]))
		);
	}

	public function testCreateCallCarriesTheIdAndTheOptions() {
		$code = $this->jsCode($this->editor(['save-data' => ['id' => 12, 'lang' => 'fr']]));

		$this->assertStringContainsString('SyWysiwyg.create(document.getElementById("article-content"), {', $code);
		$this->assertStringContainsString('"saveData":{"id":12,"lang":"fr"}', $code);
		$this->assertStringContainsString('"mode":"inline"', $code);
	}

	/**
	 * The content is sanitized by the consumer; escaping it here would show the
	 * HTML source inside the editor.
	 */
	public function testContentIsNotEscaped() {
		$editor = $this->editor(['content' => '<p class="lead">A &amp; B</p>']);

		$this->assertSame('<div id="article-content"><p class="lead">A &amp; B</p></div>', $editor->render());
	}

	public function testElementIdIsConfigurable() {
		$editor = $this->editor(['element-id' => 'place-content']);

		$this->assertSame('<div id="place-content"></div>', $editor->render());
		$this->assertStringContainsString('getElementById("place-content")', $this->jsCode($editor));
	}

}
