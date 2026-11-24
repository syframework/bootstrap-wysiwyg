<?php
namespace Sy\Test\Lib;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Wysiwyg\Lib\SlotMarker;

class SlotMarkerTest extends TestCase {

	public function testMarkAddsIncrementalIndexes() {
		$out = SlotMarker::mark(
			'<div data-sycomponent="A">a</div><div data-sycomponent="B">b</div>'
		);

		$this->assertStringContainsString('data-sycomponent-slot="slot-1"', $out);
		$this->assertStringContainsString('data-sycomponent-slot="slot-2"', $out);
	}

	public function testIdenticalComponentsGetDistinctIndexes() {
		$out = SlotMarker::mark(
			'<div data-sycomponent="A">x</div><div data-sycomponent="A">x</div>'
		);

		$this->assertStringContainsString('slot-1', $out);
		$this->assertStringContainsString('slot-2', $out);
	}

	public function testMarkIgnoresHtmlWithoutComponent() {
		$html = '<p>a</p><div class="x">b</div>';

		$this->assertSame($html, SlotMarker::mark($html));
	}

	public function testStripRemovesSlotAttribute() {
		$html = '<div data-sycomponent="A" data-sycomponent-slot="slot-1">a</div>';
		$out  = SlotMarker::strip($html);

		$this->assertStringNotContainsString('data-sycomponent-slot', $out);
		$this->assertStringContainsString('data-sycomponent="A"', $out);
	}

	public function testStripIsIdempotent() {
		$html = '<div data-sycomponent="A" data-sycomponent-slot="slot-1">a</div>';
		$once = SlotMarker::strip($html);

		$this->assertSame($once, SlotMarker::strip($once));
	}

	public function testStripWithoutSlotIsVerbatim() {
		$html = '<p>a</p>';

		$this->assertSame($html, SlotMarker::strip($html));
	}

	public function testMarkThenStripRoundTrip() {
		$html = '<p>x</p><div data-sycomponent="A">a</div>';
		$marked = SlotMarker::mark($html);

		$this->assertNotSame($html, $marked);
		$this->assertSame($html, SlotMarker::strip($marked));
	}

	public function testEmptyInput() {
		$this->assertSame('', SlotMarker::mark(''));
		$this->assertSame('', SlotMarker::strip(''));
	}

}
