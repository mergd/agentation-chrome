# Privacy Policy — Chromentation

_Last updated: May 1, 2026_

Chromentation is a Chrome extension that runs the [Agentation](https://agentation.dev) page agent on the current tab when the user explicitly invokes it.

## What we collect

**Locally, on your device:**
- Per-site access decisions (which origins you have granted Agentation permission to run on).
- Lightweight UI preferences.

These are stored via `chrome.storage` and never leave your machine via the extension itself.

**Sent to Agentation's backend (only on explicit invocation):**
- Page content (DOM / text) from the active tab.
- Your prompt or task input.

This is transmitted only when you click the extension and ask Agentation to do something on the current page. It is required to fulfill the task you requested.

## What we do not collect

- We do not collect personally identifiable information from the extension shell.
- We do not collect browsing history or activity outside of tabs you explicitly invoke the extension on.
- We do not sell or share data with third parties.
- We do not use your data for advertising, credit, or any purpose unrelated to running the agent task you requested.

## Permissions

- `activeTab` — access the current tab only when you click the toolbar button.
- `scripting` — inject the Agentation runtime into that tab.
- `storage` — remember per-site access decisions locally.
- `http://*/*`, `https://*/*` (optional) — granted per-origin only when you opt in from the popup.

## Remote code

The extension ships all JavaScript inside the package. No remote code is loaded at runtime.

## Contact

Questions or requests: open an issue at <https://github.com/mergd/agentation-chrome/issues>.
