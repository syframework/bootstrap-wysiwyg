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

### Assets

Two files must be reachable from the public directory, at the path
`Wysiwyg\Lib\EditorAssets::engine()` and `::plugins()` return (by default
`/assets/js/wysiwyg.js` and `/assets/js/plugins`):

```bash
cp vendor/sy/bootstrap-wysiwyg/assets/js/wysiwyg.js <public>/assets/js/wysiwyg.js
cp -r vendor/sy/bootstrap-wysiwyg/assets/js/plugins <public>/assets/js/
```

A `sy/project 7.0.0` application does this itself: its Composer hooks
(`Project\Composer\Installer::postPackages`) copy the assets of every installed
`sy/*` plugin on `composer install`/`update`. An existing application that
predates those hooks must copy them once, and again after every upgrade of this
package.

When the engine asset is missing, the browser console reports
`SyWysiwyg engine is not loaded: check assets.engine` and the editor stays
inactive — the page itself keeps working.

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
| `components.*` | — | disabled | component filtering, insertion-dialog metadata and optional `render-url` preview (Place, CMS); `assets.plugins` required when enabled |
| `translations` / `translate-url` / `translate-lang` / `translate-labels` | — | `{}` / null / null / `{}` | `sytranslate` widget: current values, POST endpoint, content language, dialog labels |
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
the `CkFile` trait from the same namespace. Browse deletes require the session
CSRF token (`csrf`) in addition to the same-origin check; `browseAction()`
rejects a missing or mismatched token before touching the file.

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
save. The renderer also passes the consumer translators to each component before
rendering, so form labels and component strings follow the page language; it
uses `addTranslators()` rather than `setVar()` to avoid source-slot collisions.

`assets/js/plugins/sycomponent.js` masks the rendered component while editing.
The engine passes the source slots through `config.syComponentSlots` and the
trusted rendered HTML through `config.syRenderedComponents`; the widget injects
the rendered HTML after CKEditor parsing (outside the ACF), so component inline
styles are preserved, then restores the source slot on downcast. A save stores
the source slot, not the rendered form.

`Sy\Bootstrap\Wysiwyg\Lib\ComponentMeta` describes the allowlisted classes for
the insertion dialog. `Config` exposes the result as `components.metadata`:
a human label (`Form Contact`, `Test InlineStyle`), a generated source slot
(`{CONTACT}`, `{INLINE_STYLE}`) and the constructor parameters. The dialog
renders typed fields (string, int, float, bool, array, JSON), validates required
parameters and sends named arguments. Components without a constructor hide the
arguments area; classes that cannot be inspected fall back to a JSON textarea.
The dialog reuses an existing source slot for the same component and arguments,
so inserting a second instance never rewrites the first one.

A consumer can set `components.render-url` to preview the final component before
a save. After an insertion or an edit, the plugin POSTs `component` and `args` to
that URL and replaces the widget content with the returned `html`. The source
slot is untouched, so the next save still serializes the slot. The endpoint must
check the same-origin request, the consumer allowlist and the user permissions;
the engine ships the endpoint as the `Sy\Bootstrap\Application\Editor\Render`
trait, so a consumer only declares its language and translator directories
(`renderLanguage()`, `renderTranslators()`); Article, CMS and any future plugin
share the same implementation. Without a render URL, the
widget keeps the `(save to render)` mask until the next page load.

An existing component is edited with a double-click or the **Edit component**
context-menu entry. The dialog is prefilled from the current
`data-sycomponent` / `data-sycomponent-args` attributes, and the widget is
re-rendered through the same endpoint. The dialog only edits components still
present in the allowlist; a widget whose component was removed shows a localized
notice and is left untouched. The toolbar icon is the cube SVG at
`assets/js/plugins/sycomponent.svg`, copied next to the plugin file.

The plugins ship `lang/en.js` and `lang/fr.js` (`sycomponent` and `sytranslate`
namespaces); CKEditor loads the file that matches `config.language`, so the
consumer can align the dialog with the user's interface language. A plugin must
declare `lang` for CKEditor to fetch the file. `sycomponent` only masks its own
widget instances: `widgets.instanceCreated` fires for every widget of the
editor, so the handler filters on `widget.name`. The Article consumer uses the connected user's `language`
when available and falls back to the display language for guests.

### Translation and locked-widget plugins

Two consumer plugins ship with the engine and are activated by listing them in
`extra-plugins`; `assets.plugins` must point to the copied plugin directory:

- `assets/js/plugins/sytranslate.js` — inline translation widget for the CMS. It
  keeps the `{"key"}` placeholder in the saved source and displays the current
  value while editing. The toolbar button opens the dialog with no widget
  binding, which inserts a new slot at the selection (the placeholder text is
  what the data filter wraps into a widget, so the downcast is unchanged); a
  double-click on an existing slot edits it instead. `config.translations`
  holds the key → value map, `config.translateUrl` receives the POST (`key`,
  `value`, and `lang` when
  `config.translate-lang` is set, otherwise the server derives the language from
  the request), and `config.translateLabels` overrides the dialog labels
  (`language`, `key`, `value`, `add`). Labels resolve consumer config first,
  then the plugin language pack (`lang/en.js`, `lang/fr.js`, selected by
  `config.language`), then the built-in English defaults, so a consumer that
  passes no labels still gets a localised dialog. A failed POST is reported
  (`alert` + `console.error`) with the HTTP status and the `{message}` the
  endpoint returned: the slot would otherwise look saved while the table stayed
  empty. A consumer without `translate-url` warns once that the typed value is
  display-only (the server translator resolves `{"key"}` at render time). The toolbar icon is the systemuicons
  **translate** glyph (`https://www.systemuicons.com/images/icons/translate.svg`),
  shipped locally as `sytranslate.svg` and normalised to 16×16 with the same
  1.5 px stroke as the other plugin icons; `config.syTranslateIcon` overrides the
  URL when a project must point at its own copy.
- `assets/js/plugins/sywidget.js` — preserves `data-sylock` markup. With
  `data-sylock="attributes"` the widget snapshots the element attributes into
  `data-sylock-attributes` while editing and restores them on downcast, so the
  editor cannot rewrite attributes the consumer owns (links, form actions). The
  engine never interprets `data-sylock` itself.

`translations`, `translate-url`, `translate-lang` and `translate-labels` are
copied into `editor.config` by `buildConfig()` (a value the consumer already set
in `config` wins): the plugin reads them from there, so an option that is not
forwarded leaves the endpoint undefined and the POST never runs.

Both plugins are registered through `CKEDITOR.plugins.addExternal` before the
editor is created, whether or not the component feature is enabled: the guard is
`assets.plugins`, and `extra-plugins` decides which files are requested.

A loaded plugin must expose its button, so the engine appends `Sycomponent` and
`Sytranslate` to the `insert` group when the consumer toolbar omits the item
(`buildConfig`). An item already listed — in any group — is never duplicated, and
a flat toolbar (`configType: 'array'`, e.g. `[['Bold']]`) is left untouched
because it cannot host a group object. The consumer toolbar stays authoritative
for placement; this only prevents an unreachable dialog when `extra-plugins`
enables a plugin the toolbar forgot.

### Adapter-loaded source (CMS)

When the consumer loads the source itself (CMS iframe adapter, no `load-url`),
it replaces the DOM with the source and passes the rendering captured before
that replacement:

```js
instance.setRenderedComponents({ 'Sy\\Bootstrap\\Component\\Place\\Map': '<div>...</div>' });
instance.start();
```

The keys are `data-sycomponent` + `data-sycomponent-args` (newline separated),
the same key the `sycomponent` widget uses. The values win over the ones the
engine could collect from the DOM, because the DOM now contains the `{SLOT}`
source instead of the rendered component. Without that call the components are
masked until the next page load.

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
