<?php
namespace Sy\Test\Fixture;

/**
 * Minimal component used by the `Editor\Render` tests: it echoes its argument
 * and records how many translators it received.
 */
class RenderableComponent extends \Sy\Component {

	/**
	 * @var int|null
	 */
	public static $lastTranslatorCount = null;

	/**
	 * @var string
	 */
	private $value;

	public function __construct($value = '') {
		$this->value = (string) $value;
	}

	public function __toString() {
		self::$lastTranslatorCount = count($this->getTranslators());
		return '<p>' . $this->value . '</p>';
	}

}
