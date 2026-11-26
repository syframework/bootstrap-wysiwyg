<?php
namespace Sy\Test\Fixtures;

use Sy\Component\WebComponent;

class TranslatedComponent extends WebComponent {

	public function __construct() {
		parent::__construct();
		$this->setTemplateContent('<span>{"component.label"}</span>');
	}

}
