<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentArgs;
use Sy\Test\Fixture\RenderableComponent;

/**
 * The argument payload is spread as named arguments (`new $class(...$args)`):
 * these tests pin what may reach a constructor, and the reason given when it
 * may not.
 */
class ComponentArgsTest extends TestCase {

	public function testAcceptsADeclaredParameterName() {
		$this->assertNull(ComponentArgs::validate(RenderableComponent::class, ['value' => 'hello']));
	}

	public function testAcceptsAnEmptyPayload() {
		$this->assertNull(ComponentArgs::validate(RenderableComponent::class, []));
	}

	/**
	 * The diagnosis a renamed constructor parameter used to hide: PHP answered
	 * `Unknown named parameter` and the component silently left the page.
	 */
	public function testRefusesAnUndeclaredParameter() {
		$this->assertSame(
			'unknown argument "oldName" for ' . RenderableComponent::class,
			ComponentArgs::validate(RenderableComponent::class, ['oldName' => 'x'])
		);
	}

	public function testRefusesAKeyThatIsNotAParameterName() {
		$this->assertSame(
			'invalid argument name "foo bar"',
			ComponentArgs::validate(RenderableComponent::class, ['foo bar' => 'x'])
		);
	}

	/**
	 * A positional array would bind by position: refusing it is what keeps the
	 * stored payload tied to parameter *names*.
	 */
	public function testRefusesAPositionalArray() {
		$this->assertSame(
			'invalid argument name "0"',
			ComponentArgs::validate(RenderableComponent::class, ['x'])
		);
	}

	/**
	 * A class the metadata cannot describe is not refused here: PHP stays the
	 * judge, and the dialog already falls back to the JSON textarea.
	 */
	public function testDoesNotDecideForAClassItCannotDescribe() {
		$this->assertNull(ComponentArgs::validate('Sy\Test\Fixture\MissingComponent', ['anything' => 'x']));
	}

	public function testAcceptsANullableParameterSetToAnEmptyString() {
		// The `present` half of the dialog: an explicit empty string is a value.
		$this->assertNull(ComponentArgs::validate(RenderableComponent::class, ['value' => '']));
	}

}
