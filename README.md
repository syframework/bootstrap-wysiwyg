# sy/bootstrap-wysiwyg

Shared WYSIWYG engine for the `sy/bootstrap-*` plugins: a CKEditor 4 wrapper
with one PHP component, one JS module, and no application knowledge.

## Requirements

- PHP >= 8.1
- `ext-json`

CKEditor 4 itself is loaded from a CDN by default (`https://cdn.ckeditor.com`),
so the browser needs network access unless a project sets `CKEDITOR_JS`.

## Installation

```
composer require sy/bootstrap-wysiwyg
```

## Usage

```php
use Sy\Bootstrap\Lib\EditorAssets;
use Sy\Bootstrap\Wysiwyg\Editor;

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

`EditorAssets` lives in `sy/bootstrap`: the engine never guesses a URL from
`WEB_ROOT`.

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

## Tests

```
composer test    # PHP: option validation and component rendering
npm test         # JS: engine, on jsdom with a CKEditor stub (npm install first)
```

## License

MIT
