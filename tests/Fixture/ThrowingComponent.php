<?php
namespace Sy\Test\Fixture;

/**
 * Component whose constructor fails: the render endpoint must answer 400, not
 * leak a stack trace.
 */
class ThrowingComponent extends \Sy\Component {

	public function __construct() {
		throw new \RuntimeException('boom');
	}

	public function __toString() {
		return '';
	}

}
