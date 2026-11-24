<?php
namespace Sy\Test\Application\Editor;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Application\Editor as WysiwygEditor;

class EditorAliasTest extends TestCase {

	public function testCompatibilityClassExists() {
		$this->assertTrue(class_exists('Sy\\Bootstrap\\Application\\Editor'));
	}

	public function testCompatibilityClassExtendsTheWysiwygController() {
		$this->assertTrue(is_subclass_of('Sy\\Bootstrap\\Application\\Editor', WysiwygEditor::class));
	}

}
