# sy/bootstrap-wysiwyg

Shared WYSIWYG engine and CKEditor backend for the `sy/bootstrap-*` plugins.

The package owns the browser engine, the PHP component, the `/editor`
browse/upload backend, CKEditor asset locations, the upload extension policy
and the server-side component filter. It depends on `sy/bootstrap` for the
generic API, upload and image helpers; `sy/bootstrap` never depends on this
package.

## Requirements

- PHP >= 8.1
- `ext-dom`
- `ext-json`
- `masterminds/html5 ^2.8`
- `sy/bootstrap ^2.0`

CKEditor 4 itself is loaded from a CDN by default (`https://cdn.ckeditor.com`),
so the browser needs network access unless a project sets `CKEDITOR_JS`.

## Installation

```
composer require sy/bootstrap-wysiwyg
```

## Usage

```php
use Sy\Bootstrap\Wysiwyg\Editor;
use Sy\Bootstrap\Wysiwyg\Lib\EditorAssets;

$editor = new Editor([
    'element-id' => 'article-content',
    'mode'       => 'inline',
    'content'    => $sanitizedHtml,
    'load-url'   => Url::build('api', 'article'),
    'load-data'  => ['id' => $id, 'lang' => $lang],
    'save-url'   => Url::build('api', 'article'),
    'save-data'  => ['id' => $id, 'lang' => $lang],
    'csrf'       => $service->user->getCsrfToken(),
    'upload'     => [
        'image' => ['browse' => $browseUrl, 'upload' => $uploadUrl, 'mode' => 'ajax'],
        'file'  => ['browse' => $browseUrl, 'upload' => $uploadUrl, 'mode' => 'ajax'],
    ],
    'assets' => [
        'engine'        => EditorAssets::engine(),
        'ckeditor-js'   => EditorAssets::js(),
        'ckeditor-root' => EditorAssets::root(),
    ],
]);

echo $editor; // <div id="article-content">…</div>
```

The component renders the container, loads `assets.ckeditor-js` then
`assets.engine`, and emits a single inline call:

```js
SyWysiwyg.create(document.getElementById("article-content"), { … });
```

`EditorAssets` lives in this package: the engine never guesses a URL from
`WEB_ROOT`. The component still requires explicit `assets.*` options, so a
project can use a CDN or rename its build.

### Instance registry

`SyWysiwyg.get(elementId)` returns the instance created for that container, or
`null` after `destroy()`. Consumer adapters use it to drive their own
start/stop buttons without creating a second editor.

### Options

| Option | Type | Default | Role |
|---|---|---|---|
| `element-id` | string | — | required, `/^[A-Za-z][A-Za-z0-9_-]*$/` |
| `mode` | `inline\|classic` | `inline` | `CKEDITOR.inline()` or `CKEDITOR.replace()` |
| `container` | bool | `true` | render the element, or attach to an existing one |
| `editable` | bool | `true` | `false` renders the container with no scripts |
| `content` | string | `''` | initial HTML, already sanitized |
| `load-url` / `load-data` | string / array | `null` / `[]` | GET on start |
| `save-url` / `save-data` | string / array | `null` / `[]` | POST on save |
| `csrf` / `csrf-url` / `csrf-refresh` | string / string / int | `null` / `null` / `0` | token handling |
| `upload.{image,file}.{browse,upload,mode,window}` | — | `ajax`, 400×400 | upload dialog mapping |
| `config` | array | `[]` | raw CKEditor configuration |
| `allowed-content` | `null\|true\|array` | `null` | ACF; `['@dtd' => true]` resolves to `CKEDITOR.dtd` |
| `preserve-empty` | string[] | `['span','i']` | `CKEDITOR.dtd.$removeEmpty` |
| `normalize-empty-blocks` | bool | `true` | drop empty `<p>` from the payload |
| `templates` / `templates-files` | string / string[] | `null` / `[]` | `{LANG}` and `{CKEDITOR_ROOT}` are substituted by PHP |
| `extra-plugins` / `remove-plugins` | string[] | `[]` | union with `config` |
| `components.*` | — | disabled | component filtering (Place, CMS); `assets.plugins` required when enabled |
| `guard-unload` | bool | `true` | single global `beforeunload` listener |
| `autosave.{interval,on-blur,on-dialog-close}` | — | `0`, false, false | autosave |
| `assets.{engine,ckeditor-js,ckeditor-root,plugins}` | string | — | `engine` and `ckeditor-js` are required |

Unknown options are ignored; a mistyped option name never reaches the browser.
Invalid types, reserved `save-data` keys (`content`, `csrf`), a reserved
`load-data` key (`ts`) and non-scalar values throw `InvalidArgumentException`.

### Events

All events are dispatched on `document`, with `elementId` in the detail (never
`id`, which is the business identity carried by `save-data`):

`wysiwyg:ready`, `wysiwyg:start`, `wysiwyg:change`, `wysiwyg:save`,
`wysiwyg:saved`, `wysiwyg:error`, `wysiwyg:stopped`, `wysiwyg:destroyed`.

`wysiwyg:ready` is the only extension point for CKEditor customisation
(`dataProcessor.writer`, `insertElement`, dialogs): listeners must filter on
`detail.elementId`, because several editors can live on the same page.
`wysiwyg:save` carries a mutable `detail.content`: a listener may replace it
before the POST.

## Engine lifecycle

```text
start()   GET load-url (optional) -> CKEDITOR.inline|replace -> ready -> start
save()    POST save-url {content, csrf, ...save-data} -> saved | error
stop()    save when dirty, then restore and destroy -> stopped
destroy() clears timers and listeners -> destroyed (idempotent)
```

- the body is always `content`, `csrf`, then `save-data`: the engine adds no
  `id`, business identity travels through `save-data`;
- `lastSaved` is an object `{content: string}` or `null`, never a string, and
  `stop()` restores `lastSaved.content`, then the pre-load HTML, then
  `editor.getData()` — in that order, never `undefined`;
- a `status: "ko"` response carrying a fresh `csrf` is replayed exactly once;
  4xx (400/403/404/413) are fatal (restore + destroy), network errors, 429 and
  5xx stay retryable;
- `wysiwyg:stopped` is an end-of-editing event, not a re-render: a consumer
  whose stored HTML differs from its rendered HTML reloads the page.

## CKEditor backend

`Sy\Bootstrap\Application\Editor` serves the `/editor` browse and upload
actions. The class lives in this package, so bootstrap's
`Application::controllerClass()` resolves the route without knowing where the
backend is implemented. Plugin classes stay in the consuming packages
(`Sy\Bootstrap\Application\Editor\Article`, `...\Content`, `...\Place`) and use
the `CkFile` trait from the same namespace.

## Component filtering

`Sy\Bootstrap\Wysiwyg\Lib\ComponentFilter` neutralizes the server-side
components (`data-sycomponent`) that are not in the consumer allowlist. It is
not an HTML sanitizer: run `Sy\Bootstrap\Lib\HtmlSanitizer` first on untrusted
input. An empty allowlist denies every component; Article's default is empty,
so a project must opt in explicitly.

A project adds its own components with `WYSIWYG_COMPONENT_ALLOWLIST`, keyed by
editor type:

```php
define('WYSIWYG_COMPONENT_ALLOWLIST', [
    'article' => ['Project\\Component\\Article\\Map'],
    'content' => ['Project\\Component\\Cms\\Widget'],
    'place'   => ['MAP'],
]);
```

`ComponentFilter::allowlist($editor, $default)` merges these entries with the
consumer default; an absent or invalid entry keeps the default. The package
default is never removed, so the security baseline remains.

`ComponentRenderer::render($html, $allowlist, $container)` instantiates the
allowlisted components, replaces the placeholder by their output and merges
their CSS/JS assets. The `data-sycomponent` wrapper is kept, so the component is
rebuilt on the next render even if `HtmlSanitizer` removed its form controls on
save.

`assets/js/plugins/sycomponent.js` masks the rendered component while editing.
The engine passes the source slots through `config.syComponentSlots`; the widget
restores them on downcast, so a save stores `{SLOT}`, not the rendered form.

## Upload extensions

`Sy\Bootstrap\Wysiwyg\Lib\UploadPolicy` owns the server-side whitelist. The
package defaults live in `UploadPolicy::DEFAULT`; a project can override them
with `WYSIWYG_UPLOAD_EXTENSIONS`, globally or per editor:

```php
define('WYSIWYG_UPLOAD_EXTENSIONS', [
    'image' => ['jpg', 'jpeg', 'png', 'webp'],
    'article' => ['image' => ['jpg', 'jpeg', 'png', 'webp', 'avif']],
    'content' => ['image' => ['jpg', 'png']],
    'place' => ['image' => ['jpg', 'jpeg', 'png'], 'file' => ['pdf']],
]);
```

The `article`, `content` and `place` keys are editor types, not record ids.
Executable extensions (`php`, `html`, `svg`, `js`, ...) are always rejected.
Validation is server-side; CKEditor is not trusted.

## Tests

```
composer test    # PHP: engine, backend, upload policy and component rendering
npm test         # JS: engine, on jsdom with a CKEditor stub (npm install first)
```

## License

MIT
