# Chromentation

Chrome extension host for the existing [`agentation`](https://www.agentation.com/) package.

## Development

```bash
bun install
bun run build
```

Load `dist/` as an unpacked extension in Chrome.

## Permission Model

- Clicking the extension uses `activeTab` to inject Agentation into the current page once.
- “Remember this site” requests optional host access for the current host, then registers a lightweight launcher content script for future visits.
- The full Agentation UI is still mounted only when the user opens it. A cooperating site can also dispatch `agentation:open`, but only after the extension has already injected a content script through a user click or remembered site access.

## Site Bridge

Sites do not need to cooperate for the core extension flow. The bridge is only for first-party or partner sites that want their own feedback entry point or richer context.

Cooperating sites can listen for the extension:

```ts
window.addEventListener("agentation:extension-ready", () => {
  // Show your own feedback entry point.
});
```

Then open the extension-hosted Agentation UI:

```ts
window.dispatchEvent(
  new CustomEvent("agentation:open", {
    detail: { source: "feedback-button" }
  })
);
```
