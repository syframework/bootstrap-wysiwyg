<?php
namespace Sy\Bootstrap\Application\Editor;

use Sy\Bootstrap\Wysiwyg\Lib\ComponentRegistry;

/**
 * Shared `editor/<item>/metadata` endpoint.
 *
 * The `sycomponent` dialog needs to know which components the editor accepts
 * and how to describe them. Without this endpoint the map travels embedded in
 * every page (`components.metadata`); a consumer that declares
 * `components.metadata-url` stops shipping it and the plugin fetches it the
 * first time the dialog is opened, then revalidates with `If-None-Match`.
 *
 *   class Place extends \Sy\Bootstrap\Component\Api {
 *       use CkFile;
 *       use Render;
 *       use Metadata;
 *   }
 *
 * The allowlist resolution is shared with `Render` (`EditorAllowlist`): the two
 * endpoints always answer about the same classes. Authorization is unchanged —
 * this endpoint only *describes* what `ComponentFilter`, `ComponentRenderer`
 * and `editor/<item>/render` already allow, and it never reflects on a class
 * the project did not declare.
 *
 * The response carries an `ETag` derived from the catalogue itself (never from
 * `ts`), so a browser revalidating with `If-None-Match` gets a `304` and keeps
 * its copy instead of downloading the map again.
 *
 * The same-origin check is done by `Application\Editor::dispatch()` and the
 * business rule by the consumer's own `security()`.
 */
trait Metadata {

	use EditorAllowlist;

	/**
	 * Describe the components this editor accepts.
	 */
	public function metadataAction() {
		$payload = ComponentRegistry::describe($this->renderEditorKey(), $this->renderAllowlist());
		$etag    = $this->metadataEtag($payload);

		if ($this->metadataMatches($etag)) {
			$this->notModified($etag);
			return;
		}

		$this->setMetadataHeaders($etag);
		return $this->ok(['status' => 'ok'] + $payload);
	}

	/**
	 * Cache validator of the catalogue.
	 *
	 * It is derived from the description only, never from `ts`: a redeploy that
	 * merely touches mtimes (`rsync -a`, a rebuilt image) must not invalidate
	 * every client cache, and a deployment that *preserves* mtimes while
	 * changing a class must not leave clients on a stale catalogue. `ts` stays
	 * in the payload as information, out of the validator.
	 *
	 * @param array $payload
	 * @return string
	 */
	protected function metadataEtag(array $payload): string {
		$described = [
			'editor'     => $payload['editor'] ?? null,
			'components' => $payload['components'] ?? [],
		];
		return '"' . sha1((string) json_encode($described)) . '"';
	}

	/**
	 * Whether the client still holds the payload it asks for.
	 *
	 * A conditional request may list several tags; only an exact match answers
	 * `304`, because a stale tag must get the fresh catalogue.
	 *
	 * @param string $etag
	 * @return bool
	 */
	protected function metadataMatches(string $etag): bool {
		$header = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? $_SERVER['HTTP_IF_NONE_MATCH'] : null;
		return is_string($header) and trim($header) === $etag;
	}

	/**
	 * @param string $etag
	 */
	protected function setMetadataHeaders(string $etag): void {
		if (headers_sent()) return;
		header('ETag: ' . $etag);
		// Private: the payload depends on the project configuration, not on the
		// user, but it is not worth a shared cache either.
		header('Cache-Control: private, max-age=0, must-revalidate');
	}

	/**
	 * Answer `304` with no body: the client keeps its copy of the catalogue.
	 *
	 * @param string $etag
	 */
	protected function notModified(string $etag): void {
		$this->setMetadataHeaders($etag);
		http_response_code(304);
		$this->setVar('RESPONSE', '');
	}

}
