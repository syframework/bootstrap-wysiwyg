<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentMeta;
use Sy\Test\Fixtures\Form\Contact;
use Sy\Test\Fixtures\Form\Options;
use Sy\Test\Fixtures\Form\Unsupported;
use Sy\Test\Fixtures\Test\InlineStyle;

class ComponentMetaTest extends TestCase {

	public function testLabelSlotAndParameters() {
		$meta = ComponentMeta::describe([
			' \\Sy\\Test\\Fixtures\\Form\\Contact ',
			Contact::class,
			'Missing\\ClassName',
		]);

		$this->assertArrayHasKey(Contact::class, $meta);
		$this->assertCount(1, $meta);

		$contact = $meta[Contact::class];
		$this->assertSame('Form Contact', $contact['label']);
		$this->assertSame('{CONTACT}', $contact['slot']);
		$this->assertCount(3, $contact['parameters']);

		$this->assertSame('email', $contact['parameters'][0]['name']);
		$this->assertSame('string', $contact['parameters'][0]['type']);
		$this->assertTrue($contact['parameters'][0]['required']);
		$this->assertFalse($contact['parameters'][0]['nullable']);
		$this->assertFalse($contact['parameters'][0]['hasDefault']);

		$this->assertSame('subject', $contact['parameters'][1]['name']);
		$this->assertSame('string', $contact['parameters'][1]['type']);
		$this->assertFalse($contact['parameters'][1]['required']);
		$this->assertTrue($contact['parameters'][1]['nullable']);
		$this->assertTrue($contact['parameters'][1]['hasDefault']);
		$this->assertNull($contact['parameters'][1]['default']);
	}

	public function testComponentWithoutConstructor() {
		$meta = ComponentMeta::describe([InlineStyle::class]);

		$this->assertSame('Test InlineStyle', $meta[InlineStyle::class]['label']);
		$this->assertSame('{INLINE_STYLE}', $meta[InlineStyle::class]['slot']);
		$this->assertSame([], $meta[InlineStyle::class]['parameters']);
	}

	public function testScalarAndArrayDefaults() {
		$meta = ComponentMeta::describe([Options::class]);
		$parameters = $meta[Options::class]['parameters'];

		$this->assertSame('array', $parameters[0]['type']);
		$this->assertSame([], $parameters[0]['default']);

		$this->assertSame('float', $parameters[1]['type']);
		$this->assertSame(1.5, $parameters[1]['default']);

		$this->assertSame('bool', $parameters[2]['type']);
		$this->assertTrue($parameters[2]['default']);
	}

	public function testClassTypedParameterFallsBackToJson() {
		$meta = ComponentMeta::describe([Unsupported::class]);
		$parameter = $meta[Unsupported::class]['parameters'][0];

		$this->assertSame('json', $parameter['type']);
		$this->assertTrue($parameter['required']);
	}

	public function testEmptyList() {
		$this->assertSame([], ComponentMeta::describe([]));
		$this->assertSame([], ComponentMeta::describe(['', 'Missing\\ClassName']));
	}

}
