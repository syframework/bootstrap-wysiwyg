<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentMeta;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentRegistry;
use Sy\Test\Fixtures\Form\Contact;
use Sy\Test\Fixtures\Test\InlineStyle;

class ComponentRegistryTest extends TestCase {

	public function testDescribesTheAllowlistedComponentsOfAnEditor() {
		$payload = ComponentRegistry::describe('article', [Contact::class, InlineStyle::class]);

		$this->assertSame('article', $payload['editor']);
		$this->assertSame(['editor', 'ts', 'components'], array_keys($payload));
		$this->assertSame([Contact::class, InlineStyle::class], array_keys($payload['components']));

		// The catalogue reuses ComponentMeta: one description, two transports.
		$this->assertSame(ComponentMeta::describe([Contact::class, InlineStyle::class]), $payload['components']);
		$this->assertSame('Form Contact', $payload['components'][Contact::class]['label']);
		$this->assertSame('{INLINE_STYLE}', $payload['components'][InlineStyle::class]['slot']);
	}

	public function testTimestampIsAPositiveInteger() {
		$payload = ComponentRegistry::describe('place', [Contact::class]);

		$this->assertIsInt($payload['ts']);
		$this->assertGreaterThan(0, $payload['ts']);
	}

	/**
	 * The payload feeds an ETag: two identical calls must be identical, in the
	 * same order, otherwise the browser would refetch for nothing.
	 */
	public function testPayloadIsStableAndOrderedByTheAllowlist() {
		$first  = ComponentRegistry::describe('content', [InlineStyle::class, Contact::class]);
		$second = ComponentRegistry::describe('content', [InlineStyle::class, Contact::class]);

		$this->assertSame($first, $second);
		$this->assertSame([InlineStyle::class, Contact::class], array_keys($first['components']));
	}

	public function testTimestampFollowsTheDescribedClass() {
		$ts = ComponentRegistry::describe('place', [Contact::class])['ts'];

		// The class file is part of what the timestamp covers, so a redeploy of
		// the component invalidates the cache.
		$file = (new \ReflectionClass(Contact::class))->getFileName();
		clearstatcache(true, $file);
		$this->assertGreaterThanOrEqual((int) filemtime($file), $ts);
	}

	public function testUnknownClassesAreSkipped() {
		$payload = ComponentRegistry::describe('article', ['', 'Missing\\ClassName', Contact::class]);

		$this->assertSame([Contact::class], array_keys($payload['components']));
	}

	public function testEmptyAllowlistKeepsAValidShape() {
		$payload = ComponentRegistry::describe('content', []);

		$this->assertSame('content', $payload['editor']);
		$this->assertSame([], $payload['components']);
		// Still dated: an empty catalogue must not produce a 0 ETag.
		$this->assertSame(ComponentRegistry::describe('content', [])['ts'], $payload['ts']);
		$this->assertGreaterThan(0, $payload['ts']);
	}

	public function testPayloadIsJsonEncodable() {
		$payload = ComponentRegistry::describe('article', [Contact::class]);
		$json    = json_encode($payload);

		$this->assertIsString($json);
		$this->assertSame($payload['editor'], json_decode($json, true)['editor']);
	}

}
