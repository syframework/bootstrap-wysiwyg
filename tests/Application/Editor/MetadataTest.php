<?php
namespace Sy\Test\Application\Editor;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Application\Editor\Metadata;
use Sy\Test\Fixtures\Form\Contact;
use Sy\Test\Fixtures\Test\InlineStyle;

/**
 * Consumer used as the subject: it records the response and the cache headers
 * instead of writing them.
 */
class MetadataEndpoint extends \Sy\Bootstrap\Component\Api {

	use Metadata;

	public const COMPONENT_ALLOWLIST = [Contact::class, InlineStyle::class];

	public $code = null;

	public $data = null;

	public $etags = [];

	public $notModified = false;

	public function security() {}

	public function response($code, $data = null) {
		$this->code = $code;
		$this->data = $data;
	}

	protected function setMetadataHeaders(string $etag): void {
		$this->etags[] = $etag;
	}

	protected function notModified(string $etag): void {
		$this->notModified = true;
		$this->code = 304;
	}

	public function etag(array $payload): string {
		return $this->metadataEtag($payload);
	}

}

/**
 * Same endpoint without a consumer default: the catalogue is then empty.
 */
class BareMetadataEndpoint extends \Sy\Bootstrap\Component\Api {

	use Metadata;

	public $code = null;

	public $data = null;

	public function security() {}

	public function response($code, $data = null) {
		$this->code = $code;
		$this->data = $data;
	}

	public function etag(array $payload): string {
		return $this->metadataEtag($payload);
	}

}

/**
 * What a real consumer looks like: one class, three traits, one allowlist.
 */
class CombinedEndpoint extends \Sy\Bootstrap\Component\Api {

	use \Sy\Bootstrap\Application\Editor\CkFile;
	use \Sy\Bootstrap\Application\Editor\Render;
	use Metadata;

	public const COMPONENT_ALLOWLIST = [Contact::class];

	public function security() {}

	public function editorKey(): string {
		return $this->renderEditorKey();
	}

	public function allowlist(): array {
		return $this->renderAllowlist();
	}

}

class MetadataTest extends TestCase {

	private $request;

	private $server;

	protected function setUp(): void {
		$this->request = $_REQUEST;
		$this->server  = $_SERVER;
		$_REQUEST = ['action' => 'article'];
		unset($_SERVER['HTTP_IF_NONE_MATCH']);
	}

	protected function tearDown(): void {
		$_REQUEST = $this->request;
		$_SERVER  = $this->server;
	}

	public function testDescribesTheComponentsOfTheConsumer() {
		$endpoint = new MetadataEndpoint();
		$endpoint->metadataAction();

		$this->assertSame(200, $endpoint->code);
		$this->assertSame('ok', $endpoint->data['status']);
		$this->assertSame('article', $endpoint->data['editor']);
		$this->assertIsInt($endpoint->data['ts']);
		$this->assertSame([Contact::class, InlineStyle::class], array_keys($endpoint->data['components']));
		$this->assertSame('Form Contact', $endpoint->data['components'][Contact::class]['label']);
	}

	public function testEditorKeyIsDerivedFromTheAction() {
		foreach (['article' => 'article', 'content' => 'content', 'place' => 'place'] as $action => $key) {
			$_REQUEST = ['action' => $action];
			$endpoint = new MetadataEndpoint();
			$endpoint->metadataAction();
			$this->assertSame($key, $endpoint->data['editor'], "action $action");
		}
	}

	public function testRenderAndMetadataShareOneAllowlist() {
		$_REQUEST = ['action' => 'place'];
		$endpoint = new CombinedEndpoint();

		// The route is generic: editor/<item>/<action> reaches the consumer class,
		// which must serve browse, upload, render and metadata.
		$this->assertTrue(method_exists($endpoint, 'browseAction'));
		$this->assertTrue(method_exists($endpoint, 'renderAction'));
		$this->assertTrue(method_exists($endpoint, 'metadataAction'));

		// One allowlist for both endpoints, no trait conflict.
		$this->assertSame('place', $endpoint->editorKey());
		$this->assertSame([Contact::class], $endpoint->allowlist());
	}

	public function testConsumerWithoutAllowlistDescribesNothing() {
		$endpoint = new BareMetadataEndpoint();
		$endpoint->metadataAction();

		$this->assertSame(200, $endpoint->code);
		$this->assertSame([], $endpoint->data['components']);
	}

	/**
	 * The endpoint describes the declared allowlist and nothing else: a query
	 * parameter cannot add a class to the catalogue.
	 */
	public function testTheCatalogueCannotBeWidenedByTheRequest() {
		$_REQUEST = [
			'action'     => 'article',
			'component'  => 'Sy\\Test\\Fixture\\ThrowingComponent',
			'allowlist'  => ['Sy\\Test\\Fixture\\ThrowingComponent'],
		];

		$endpoint = new MetadataEndpoint();
		$endpoint->metadataAction();

		$this->assertSame([Contact::class, InlineStyle::class], array_keys($endpoint->data['components']));
	}

	public function testEtagIsStableForTheSamePayloadAndMovesWithIt() {
		$endpoint = new MetadataEndpoint();
		$endpoint->metadataAction();
		$first = $endpoint->etags[0];

		$other = new MetadataEndpoint();
		$other->metadataAction();
		$this->assertSame($first, $other->etags[0], 'the same catalogue must produce the same tag');

		// A different catalogue gets a different tag, so a client never keeps a
		// payload it did not ask for.
		$empty = new BareMetadataEndpoint();
		$empty->metadataAction();
		$bare = $empty->data;
		unset($bare['status']);
		$this->assertNotSame($first, $empty->etag($bare));
	}

	public function testConditionalRequestAnswers304() {
		$endpoint = new MetadataEndpoint();
		$endpoint->metadataAction();
		$etag = $endpoint->etags[0];

		$_SERVER['HTTP_IF_NONE_MATCH'] = $etag;

		$conditional = new MetadataEndpoint();
		$conditional->metadataAction();

		$this->assertTrue($conditional->notModified);
		$this->assertSame(304, $conditional->code);
		$this->assertNull($conditional->data, 'a 304 carries no payload');
	}

	public function testStaleConditionalRequestGetsTheCatalogue() {
		$_SERVER['HTTP_IF_NONE_MATCH'] = '"stale-tag"';

		$endpoint = new MetadataEndpoint();
		$endpoint->metadataAction();

		$this->assertFalse($endpoint->notModified);
		$this->assertSame(200, $endpoint->code);
		$this->assertNotSame([], $endpoint->data['components']);
	}

}
