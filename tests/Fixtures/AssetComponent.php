<?php
namespace Sy\Test\Fixtures;

use Sy\Component\WebComponent;

class AssetComponent extends WebComponent {

	public function __construct() {
		parent::__construct();
		$this->setTemplateContent('<span class="asset">asset</span>');
		$this->addCssCode('.asset { color: red; }');
		$this->addJsCode('console.log("asset");');
	}

}
