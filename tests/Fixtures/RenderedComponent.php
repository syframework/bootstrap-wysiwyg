<?php
namespace Sy\Test\Fixtures;

class RenderedComponent {

	/** @var string */
	private $text;

	public function __construct($text = 'component') {
		$this->text = $text;
	}

	public function __toString(): string {
		return '<span class="fixture">' . htmlspecialchars($this->text, ENT_QUOTES, 'UTF-8') . '</span>';
	}

}
