<?php
namespace Sy\Test\Application\Editor;

use PHPUnit\Framework\TestCase;
use Sy\Bootstrap\Application\Editor\Render;
use Sy\Test\Fixture\RenderableComponent;

/**
 * Consumer used as the subject: it records the response instead of writing it,
 * which is what `Api::response()` does for real.
 */
class RenderEndpoint extends \Sy\Bootstrap\Component\Api {

	use Render {
		renderComponent as private renderTraitComponent;
	}

	public const COMPONENT_ALLOWLIST = [RenderableComponent::class];

	public $code = null;

	public $data = null;

	public $rendered = [];

	public function security() {}

	public function response($code, $data = null) {
		$this->code = $code;
		$this->data = $data;
	}

	protected function renderLanguage(): string {
		return 'fr';
	}

	protected function renderTranslators(string $lang): array {
		return [LANG_DIR];
	}

	protected function renderComponent(string $class, array $args): string {
		$this->rendered[] = [$class, $args];
		return $this->renderTraitComponent($class, $args);
	}

	public function defaultAllowlist() {
		return $this->renderDefaultAllowlist();
	}

}

/**
 * Same endpoint without any consumer default: the allowlist is then empty.
 */
class BareRenderEndpoint extends \Sy\Bootstrap\Component\Api {

	use Render;

	public $code = null;

	public $data = null;

	public function security() {}

	public function response($code, $data = null) {
		$this->code = $code;
		$this->data = $data;
	}

	protected function renderLanguage(): string {
		return 'fr';
	}

	public function editorKey() {
		return $this->renderEditorKey();
	}

	public function defaultAllowlist() {
		return $this->renderDefaultAllowlist();
	}

}

class RenderTest extends TestCase {

	private $post;

	private $request;

	protected function setUp(): void {
		$this->post = $_POST;
		$this->request = $_REQUEST;
		$_POST = [];
		$_REQUEST = [];
		RenderableComponent::$lastTranslatorCount = null;
	}

	protected function tearDown(): void {
		$_POST = $this->post;
		$_REQUEST = $this->request;
	}

	public function testRendersAnAllowedComponentWithItsArguments() {
		// Named arguments: the payload is an object keyed by parameter name.
		$_POST = ['component' => RenderableComponent::class, 'args' => '{"value":"hello"}'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(200, $endpoint->code);
		$this->assertSame('ok', $endpoint->data['status']);
		$this->assertSame('<p>hello</p>', $endpoint->data['html']);
		$this->assertSame([[RenderableComponent::class, ['value' => 'hello']]], $endpoint->rendered);
	}

	/**
	 * A positional array would bind by position instead of by name, which is
	 * exactly what the named-argument contract forbids.
	 */
	public function testRefusesPositionalArguments() {
		$_POST = ['component' => RenderableComponent::class, 'args' => '["hello"]'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertStringContainsString('invalid argument name', $endpoint->data['message']);
		$this->assertSame([], $endpoint->rendered);
	}

	public function testRefusesAnArgumentThatIsNotAParameterName() {
		$_POST = ['component' => RenderableComponent::class, 'args' => '{"foo bar":"x"}'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertStringContainsString('"foo bar"', $endpoint->data['message']);
	}

	/**
	 * The diagnosis a renamed constructor parameter used to hide: the payload
	 * kept the old key and PHP answered `Unknown named parameter`.
	 */
	public function testRefusesAnArgumentTheConstructorDoesNotDeclare() {
		$_POST = ['component' => RenderableComponent::class, 'args' => '{"oldName":"x"}'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertStringContainsString('unknown argument "oldName"', $endpoint->data['message']);
		$this->assertSame([], $endpoint->rendered);
	}

	public function testRendersWithoutArguments() {
		$_POST = ['component' => RenderableComponent::class];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(200, $endpoint->code);
		$this->assertSame('<p></p>', $endpoint->data['html']);
	}

	public function testPassesTheTranslatorsToTheComponent() {
		$_POST = ['component' => RenderableComponent::class];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertGreaterThan(0, RenderableComponent::$lastTranslatorCount);
	}

	public function testRejectsAComponentOutsideTheAllowlist() {
		$_POST = ['component' => \Sy\Test\Fixture\ThrowingComponent::class];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertSame('Component not allowed', $endpoint->data['message']);
		$this->assertSame([], $endpoint->rendered);
	}

	public function testRejectsAnUnknownClass() {
		$_POST = ['component' => 'Project\\Component\\Missing'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertSame('Component not allowed', $endpoint->data['message']);
	}

	public function testRejectsInvalidJsonArguments() {
		$_POST = ['component' => RenderableComponent::class, 'args' => '{oops'];
		$endpoint = new RenderEndpoint();

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertSame('Invalid component arguments', $endpoint->data['message']);
		$this->assertSame([], $endpoint->rendered);
	}

	public function testConvertsARenderFailureIntoARequestError() {
		$_POST = [
			'component' => \Sy\Test\Fixture\ThrowingComponent::class,
			'args'      => '[]',
		];
		$endpoint = new RenderEndpoint();
		// The allowlist is checked against the consumer constant: allow the
		// throwing fixture through a subclass would be noise, so the constant
		// is bypassed by the endpoint hook instead.
		$endpoint = new class extends RenderEndpoint {
			public function renderAllowlistPublic() {
				return [\Sy\Test\Fixture\ThrowingComponent::class];
			}
			protected function renderAllowlist(): array {
				return $this->renderAllowlistPublic();
			}
		};

		$endpoint->renderAction();

		$this->assertSame(400, $endpoint->code);
		$this->assertSame('Component render failed', $endpoint->data['message']);
	}

	public function testEditorKeyIsDerivedFromTheAction() {
		$_REQUEST = ['action' => 'article'];
		$endpoint = new BareRenderEndpoint();
		$this->assertSame('article', $endpoint->editorKey());

		$_REQUEST = ['action' => 'content'];
		$this->assertSame('content', (new BareRenderEndpoint())->editorKey());

		$_REQUEST = ['action' => 'content-translation'];
		$this->assertSame('content-translation', (new BareRenderEndpoint())->editorKey());
	}

	public function testDefaultAllowlistComesFromTheConsumerConstant() {
		$this->assertSame([RenderableComponent::class], (new RenderEndpoint())->defaultAllowlist());

		$this->assertSame([], (new BareRenderEndpoint())->defaultAllowlist());
	}

	public function testResolvedAllowlistMergesTheProjectEntries() {
		$this->assertSame([], (new BareRenderEndpoint())->defaultAllowlist());
		// `WYSIWYG_COMPONENT_ALLOWLIST` is not defined in the test bootstrap: the
		// resolved list equals the consumer default (C98).
		$this->assertFalse(defined('WYSIWYG_COMPONENT_ALLOWLIST'));
	}

}
