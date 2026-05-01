import { contentScriptIdForPattern } from "../shared/permissions";
import {
  eventLogKey,
  extensionStateKey,
  lastOutputKey,
  mergeSettings,
  mergeState,
  type ExtensionSettings,
  type ExtensionState,
  type SiteGrant
} from "../shared/settings";
import type { AgentationEvent, RuntimeMessage, RuntimeResponse } from "../shared/messages";

const maxEventLogEntries = 100;
const contentScriptPrefix = "agentation_";

async function getState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(extensionStateKey);
  return mergeState(stored[extensionStateKey] as Partial<ExtensionState> | undefined);
}

async function setState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({
    [extensionStateKey]: state
  });
}

async function getSettings(): Promise<ExtensionSettings> {
  const state = await getState();
  return state.settings;
}

async function updateSettings(nextSettings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const state = await getState();
  const settings = mergeSettings({
    ...state.settings,
    ...nextSettings
  });

  await setState({
    ...state,
    settings
  });

  return settings;
}

async function injectAndOpen(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    files: ["content.js"],
    target: { tabId }
  });

  await chrome.tabs.sendMessage(tabId, {
    type: "agentation:open"
  } satisfies RuntimeMessage);
}

async function openCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }

  await injectAndOpen(tab.id);
}

async function registerSiteContentScript(site: SiteGrant): Promise<void> {
  const hasPermission = await chrome.permissions.contains({
    origins: [site.pattern]
  });

  if (!hasPermission) {
    return;
  }

  const id = contentScriptIdForPattern(site.pattern);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id,
      js: ["content.js"],
      matches: [site.pattern],
      persistAcrossSessions: true,
      runAt: "document_idle",
      world: "ISOLATED"
    }
  ]);
}

async function unregisterSiteContentScript(site: SiteGrant): Promise<void> {
  const id = contentScriptIdForPattern(site.pattern);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length === 0) {
    return;
  }

  await chrome.scripting.unregisterContentScripts({ ids: [id] });
}

async function syncRememberedContentScripts(): Promise<void> {
  const state = await getState();
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const ids = scripts.map((script) => script.id).filter((id) => id.startsWith(contentScriptPrefix));

  if (ids.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids });
  }

  await Promise.all(state.rememberedSites.map((site) => registerSiteContentScript(site)));
}

async function rememberSite(site: SiteGrant): Promise<SiteGrant[]> {
  const state = await getState();
  const rememberedSites = [
    ...state.rememberedSites.filter((remembered) => remembered.pattern !== site.pattern),
    site
  ];

  await setState({
    ...state,
    rememberedSites
  });
  await registerSiteContentScript(site);

  return rememberedSites;
}

async function forgetSite(site: SiteGrant): Promise<SiteGrant[]> {
  const state = await getState();
  const rememberedSites = state.rememberedSites.filter((remembered) => remembered.pattern !== site.pattern);

  await setState({
    ...state,
    rememberedSites
  });
  await unregisterSiteContentScript(site);

  return rememberedSites;
}

async function appendEvent(event: AgentationEvent): Promise<void> {
  const stored = await chrome.storage.local.get(eventLogKey);
  const events = Array.isArray(stored[eventLogKey]) ? (stored[eventLogKey] as AgentationEvent[]) : [];
  await chrome.storage.local.set({
    [eventLogKey]: [...events, event].slice(-maxEventLogEntries)
  });
}

function canSendWebhook(settings: ExtensionSettings): boolean {
  if (!settings.webhooksEnabled || !settings.webhookUrl) {
    return false;
  }

  try {
    const url = new URL(settings.webhookUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function sendWebhook(event: AgentationEvent): Promise<void> {
  const settings = await getSettings();

  if (!canSendWebhook(settings)) {
    return;
  }

  await fetch(settings.webhookUrl, {
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

async function handleEvent(event: AgentationEvent): Promise<void> {
  await appendEvent(event);

  if (event.kind === "copy") {
    await chrome.storage.local.set({
      [lastOutputKey]: {
        markdown: event.markdown,
        page: event.page,
        timestamp: event.timestamp
      }
    });
  }

  if (event.kind === "submit") {
    await chrome.storage.local.set({
      [lastOutputKey]: {
        annotations: event.annotations,
        output: event.output,
        page: event.page,
        timestamp: event.timestamp
      }
    });
  }

  await sendWebhook(event);
}

function toErrorResponse(error: unknown): RuntimeResponse {
  return {
    error: error instanceof Error ? error.message : "Unexpected Agentation extension error.",
    ok: false
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void syncRememberedContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void syncRememberedContentScripts();
});

chrome.permissions.onRemoved.addListener(() => {
  void syncRememberedContentScripts();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  const respond = async (): Promise<RuntimeResponse> => {
    switch (message.type) {
      case "agentation:open-current-tab":
        await openCurrentTab();
        return { ok: true };

      case "agentation:get-settings": {
        const state = await getState();
        return {
          ok: true,
          rememberedSites: state.rememberedSites,
          settings: state.settings
        };
      }

      case "agentation:set-settings": {
        const settings = await updateSettings(message.settings);
        return {
          ok: true,
          settings
        };
      }

      case "agentation:remember-site": {
        const rememberedSites = await rememberSite(message.site);
        return {
          ok: true,
          rememberedSites
        };
      }

      case "agentation:forget-site": {
        const rememberedSites = await forgetSite(message.site);
        return {
          ok: true,
          rememberedSites
        };
      }

      case "agentation:event":
        await handleEvent(message.event);
        return { ok: true };

      case "agentation:content-ready":
      case "agentation:open":
      case "agentation:get-eligibility":
        return { ok: true };

      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  };

  respond().then(sendResponse).catch((error: unknown) => {
    sendResponse(toErrorResponse(error));
  });

  return true;
});
