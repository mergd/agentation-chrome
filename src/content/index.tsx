import { Agentation, type Annotation } from "agentation";
import { createRoot, type Root } from "react-dom/client";
import type {
  AgentationEvent,
  PageContext,
  PageEligibility,
  RuntimeMessage,
  RuntimeResponse
} from "../shared/messages";
import { defaultSettings, type ExtensionSettings } from "../shared/settings";

const extensionRootId = "agentation-extension-root";
const launcherRootId = "agentation-extension-launcher";
const readyEventName = "agentation:extension-ready";
const openEventName = "agentation:open";

let agentationRoot: Root | null = null;
let launcherRoot: HTMLElement | null = null;
let isAgentationMounted = false;
const contentGlobal = globalThis as typeof globalThis & {
  __agentationContentBooted?: boolean;
  __agentationRuntimeListenerRegistered?: boolean;
};

const isolationStyleId = "agentation-page-isolation";
const portalSelectors = [
  '[class*="styles-module__popup___"]',
  '[class*="page-toolbar-css"]',
  '[class*="annotation-marker"]',
  '[class*="annotation-popup"]',
  '[class*="settings-panel"]',
  '[class*="help-tooltip"]',
  '[class*="design-mode"]'
];

function installIsolationStyles(): void {
  if (document.getElementById(isolationStyleId)) {
    return;
  }

  const wrapped = portalSelectors.flatMap((sel) => [sel, `${sel} *`]).join(",\n    ");

  const style = document.createElement("style");
  style.id = isolationStyleId;
  style.textContent = `
    ${wrapped} {
      all: revert;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  `;

  const head = document.head ?? document.documentElement;
  head.insertBefore(style, head.firstChild);
}

const domReady = new Promise<void>((resolve) => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    return;
  }

  resolve();
});

function getPageContext(): PageContext {
  return {
    title: document.title,
    url: window.location.href
  };
}

function assessPageEligibility(): PageEligibility {
  const body = document.body;

  if (!body) {
    return {
      eligible: false,
      reasons: ["Page body is not ready."],
      stats: {
        canvasCount: 0,
        interactiveCount: 0,
        textLength: 0
      }
    };
  }

  const canvasCount = document.querySelectorAll("canvas").length;
  const interactiveCount = document.querySelectorAll(
    [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "[role]",
      "[contenteditable='true']",
      "[data-testid]",
      "[class]",
      "[id]"
    ].join(",")
  ).length;
  const textLength = (body.innerText || body.textContent || "").trim().length;
  const reasons: string[] = [];

  if (canvasCount > 0 && interactiveCount < 3 && textLength < 80) {
    reasons.push("This looks like a canvas-heavy page with little inspectable DOM.");
  }

  if (interactiveCount === 0 && textLength < 40) {
    reasons.push("This page has too little DOM content to annotate usefully.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    stats: {
      canvasCount,
      interactiveCount,
      textLength
    }
  };
}

async function sendMessage(message: RuntimeMessage): Promise<RuntimeResponse | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as RuntimeResponse;
  } catch {
    return null;
  }
}

async function getSettings(): Promise<ExtensionSettings> {
  const response = await sendMessage({
    type: "agentation:get-settings"
  });

  if (response?.ok && response.settings) {
    return response.settings;
  }

  return defaultSettings;
}

function eventBase(): Pick<AgentationEvent, "page" | "timestamp"> {
  return {
    page: getPageContext(),
    timestamp: Date.now()
  };
}

function forwardEvent(event: AgentationEvent): void {
  void sendMessage({
    event,
    type: "agentation:event"
  });
}

async function writeToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function onAnnotationAdd(annotation: Annotation): void {
  forwardEvent({
    ...eventBase(),
    annotation,
    kind: "annotation:add"
  });
}

function onAnnotationDelete(annotation: Annotation): void {
  forwardEvent({
    ...eventBase(),
    annotation,
    kind: "annotation:delete"
  });
}

function onAnnotationUpdate(annotation: Annotation): void {
  forwardEvent({
    ...eventBase(),
    annotation,
    kind: "annotation:update"
  });
}

function onAnnotationsClear(annotations: Annotation[]): void {
  forwardEvent({
    ...eventBase(),
    annotations,
    kind: "annotations:clear"
  });
}

function onSubmit(output: string, annotations: Annotation[]): void {
  forwardEvent({
    ...eventBase(),
    annotations,
    kind: "submit",
    output
  });
}

function hideLauncher(): void {
  launcherRoot?.setAttribute("data-agentation-hidden", "true");
}

async function mountAgentation(): Promise<void> {
  await domReady;

  if (isAgentationMounted) {
    hideLauncher();
    return;
  }

  const settings = await getSettings();
  const host = document.getElementById(extensionRootId) ?? document.createElement("div");

  host.id = extensionRootId;
  host.setAttribute("data-agentation-extension-host", "");
  host.setAttribute("data-feedback-toolbar", "");

  if (!host.isConnected) {
    document.documentElement.appendChild(host);
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  let mount = shadow.querySelector<HTMLElement>("[data-agentation-react-root]");

  if (!mount) {
    mount = document.createElement("div");
    mount.setAttribute("data-agentation-react-root", "");
    shadow.appendChild(mount);
  }

  agentationRoot ??= createRoot(mount);
  agentationRoot.render(
    <Agentation
      copyToClipboard={false}
      endpoint={settings.endpoint || undefined}
      sessionId={settings.sessionId || undefined}
      webhookUrl={settings.webhooksEnabled ? settings.webhookUrl || undefined : undefined}
      onAnnotationAdd={onAnnotationAdd}
      onAnnotationDelete={onAnnotationDelete}
      onAnnotationUpdate={onAnnotationUpdate}
      onAnnotationsClear={onAnnotationsClear}
      onCopy={(markdown) => {
        void writeToClipboard(markdown);
        forwardEvent({
          ...eventBase(),
          kind: "copy",
          markdown
        });
      }}
      onSubmit={onSubmit}
    />
  );

  isAgentationMounted = true;
  hideLauncher();
}

function ensureLauncher(): void {
  if (!document.body) {
    return;
  }

  if (launcherRoot || !assessPageEligibility().eligible) {
    return;
  }

  const host = document.createElement("div");
  host.id = launcherRootId;
  host.setAttribute("data-feedback-toolbar", "");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color-scheme: light dark;
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483646;
    }

    button {
      align-items: center;
      appearance: none;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      color: #ededee;
      cursor: pointer;
      display: inline-flex;
      font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 6px 10px;
      transition: background 120ms ease;
    }

    button:hover {
      background: #27272a;
    }

    :host([data-agentation-hidden="true"]) {
      display: none;
    }
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.title = "Open Agentation";
  button.textContent = "Annotate";
  button.addEventListener("click", () => {
    void mountAgentation();
  });

  shadow.append(style, button);
  document.documentElement.appendChild(host);
  launcherRoot = host;
}

function announceReady(): void {
  document.documentElement.setAttribute("data-agentation-extension", chrome.runtime.id);
  window.dispatchEvent(
    new CustomEvent(readyEventName, {
      detail: {
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version
      }
    })
  );
}

function registerSiteBridge(): void {
  window.addEventListener(openEventName, (event) => {
    forwardEvent({
      ...eventBase(),
      detail: event instanceof CustomEvent ? event.detail : null,
      kind: "site-request"
    });
    void mountAgentation();
  });
}

function registerRuntimeMessages(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "agentation:open":
        mountAgentation()
          .then(() => sendResponse({ ok: true } satisfies RuntimeResponse))
          .catch((error: unknown) => {
            sendResponse({
              error: error instanceof Error ? error.message : "Unable to mount Agentation.",
              ok: false
            } satisfies RuntimeResponse);
          });

        return true;

      case "agentation:get-eligibility":
        sendResponse({
          eligibility: assessPageEligibility(),
          ok: true
        } satisfies RuntimeResponse);
        return false;

      default:
        return false;
    }
  });
}

function boot(): void {
  installIsolationStyles();
  const eligibility = assessPageEligibility();
  registerSiteBridge();
  announceReady();
  ensureLauncher();

  void sendMessage({
    eligibility,
    page: getPageContext(),
    type: "agentation:content-ready"
  });
}

if (!contentGlobal.__agentationContentBooted) {
  contentGlobal.__agentationContentBooted = true;

  if (!contentGlobal.__agentationRuntimeListenerRegistered) {
    contentGlobal.__agentationRuntimeListenerRegistered = true;
    registerRuntimeMessages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
