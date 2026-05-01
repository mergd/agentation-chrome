import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PageEligibility, RuntimeMessage, RuntimeResponse } from "../shared/messages";
import { getPageTarget, type PageTarget } from "../shared/permissions";
import { defaultSettings, type ExtensionSettings, type SiteGrant } from "../shared/settings";
import styles from "./popup.module.css";

type Status = {
  tone: "neutral" | "success" | "error";
  text: string;
};

function isOk(response: RuntimeResponse | null): response is RuntimeResponse & { ok: true } {
  return response?.ok === true;
}

async function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as RuntimeResponse;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to contact Chromentation.",
      ok: false
    };
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function hasOriginPermission(target: PageTarget | null): Promise<boolean> {
  if (!target) {
    return false;
  }

  return chrome.permissions.contains({
    origins: [target.pattern]
  });
}

function getSiteFromTarget(target: PageTarget): SiteGrant {
  return {
    grantedAt: Date.now(),
    origin: target.origin,
    pattern: target.pattern
  };
}

function describeEligibility(eligibility: PageEligibility): string {
  if (eligibility.eligible) {
    return "This page looks annotatable.";
  }

  return eligibility.reasons.join(" ");
}

function App() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [isRemembered, setIsRemembered] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<Status>({
    text: "Click once to run Chromentation on this tab.",
    tone: "neutral"
  });

  const target = useMemo(() => getPageTarget(tab?.url), [tab?.url]);

  const refresh = useCallback(async () => {
    const activeTab = await getActiveTab();
    const activeTarget = getPageTarget(activeTab?.url);
    const response = await sendRuntimeMessage({ type: "agentation:get-settings" });

    setTab(activeTab);

    if (isOk(response)) {
      setSettings(response.settings ?? defaultSettings);
    }

    setIsRemembered(await hasOriginPermission(activeTarget));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openAgentation = useCallback(async () => {
    setIsBusy(true);
    setStatus({ text: "Opening Chromentation on this tab...", tone: "neutral" });

    const response = await sendRuntimeMessage({ type: "agentation:open-current-tab" });

    if (isOk(response)) {
      setStatus({ text: "Chromentation is running on this page.", tone: "success" });
    } else {
      setStatus({
        text: response?.error ?? "Unable to open Chromentation on this page.",
        tone: "error"
      });
    }

    setIsBusy(false);
  }, []);

  const getEligibility = useCallback(async (): Promise<PageEligibility | null> => {
    if (!tab?.id) {
      return null;
    }

    await chrome.scripting.executeScript({
      files: ["content.js"],
      target: { tabId: tab.id }
    });

    let response: RuntimeResponse;

    try {
      response = (await chrome.tabs.sendMessage(tab.id, {
        type: "agentation:get-eligibility"
      } satisfies RuntimeMessage)) as RuntimeResponse;
    } catch {
      return null;
    }

    return isOk(response) ? response.eligibility ?? null : null;
  }, [tab?.id]);

  const rememberSite = useCallback(async () => {
    if (!target) {
      setStatus({ text: "Chromentation can only be remembered on http and https pages.", tone: "error" });
      return;
    }

    setIsBusy(true);
    setStatus({ text: "Checking whether this page is a good fit...", tone: "neutral" });

    const eligibility = await getEligibility();
    if (eligibility && !eligibility.eligible) {
      setStatus({ text: describeEligibility(eligibility), tone: "error" });
      setIsBusy(false);
      return;
    }

    const granted = await chrome.permissions.request({
      origins: [target.pattern]
    });

    if (!granted) {
      setStatus({ text: "Site access was not granted.", tone: "neutral" });
      setIsBusy(false);
      return;
    }

    const response = await sendRuntimeMessage({
      site: getSiteFromTarget(target),
      type: "agentation:remember-site"
    });

    if (isOk(response)) {
      setIsRemembered(true);
      setStatus({ text: "Chromentation launcher will appear on this site.", tone: "success" });
    } else {
      setStatus({
        text: response?.error ?? "Site access was granted, but the launcher could not be registered.",
        tone: "error"
      });
    }

    setIsBusy(false);
  }, [getEligibility, target]);

  const forgetSite = useCallback(async () => {
    if (!target) {
      return;
    }

    setIsBusy(true);

    await chrome.permissions.remove({
      origins: [target.pattern]
    });

    const response = await sendRuntimeMessage({
      site: getSiteFromTarget(target),
      type: "agentation:forget-site"
    });

    setIsRemembered(false);
    setIsBusy(false);
    setStatus({
      text: isOk(response) ? "Chromentation will no longer auto-show on this site." : "Removed browser permission.",
      tone: isOk(response) ? "success" : "neutral"
    });
  }, [target]);

  const saveSettings = useCallback(async () => {
    setIsBusy(true);

    const webhookTarget = settings.webhooksEnabled ? getPageTarget(settings.webhookUrl) : null;

    if (settings.webhooksEnabled && !webhookTarget) {
      setIsBusy(false);
      setStatus({ text: "Enter a valid http or https webhook URL.", tone: "error" });
      return;
    }

    if (webhookTarget) {
      const granted = await chrome.permissions.request({
        origins: [webhookTarget.pattern]
      });

      if (!granted) {
        setIsBusy(false);
        setStatus({ text: "Webhook host access was not granted.", tone: "error" });
        return;
      }
    }

    const response = await sendRuntimeMessage({
      settings,
      type: "agentation:set-settings"
    });

    setIsBusy(false);
    setStatus({
      text: isOk(response) ? "Settings saved." : response?.error ?? "Unable to save settings.",
      tone: isOk(response) ? "success" : "error"
    });
  }, [settings]);

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <h1>Chromentation</h1>
        <p className={styles.eyebrow}>Visual feedback</p>
      </section>

      <section className={styles.card}>
        <span className={styles.label}>Current site</span>
        <p className={styles.url}>{target?.origin ?? "Unsupported page"}</p>
        <p className={styles.hint}>
          {target
            ? "Run once with activeTab, or remember this site after Chrome asks for host access."
            : "Chrome does not allow extension injection on this page."}
        </p>
      </section>

      <div className={styles.actions}>
        <button className={styles.primaryButton} disabled={isBusy || !target} type="button" onClick={openAgentation}>
          Open Chromentation
        </button>
        {isRemembered ? (
          <button className={styles.secondaryButton} disabled={isBusy || !target} type="button" onClick={forgetSite}>
            Forget this site
          </button>
        ) : (
          <button className={styles.secondaryButton} disabled={isBusy || !target} type="button" onClick={rememberSite}>
            Remember this site
          </button>
        )}
      </div>

      <section className={styles.card}>
        <label className={styles.field}>
          <span>Sync endpoint</span>
          <input
            placeholder="http://localhost:4747"
            type="url"
            value={settings.endpoint}
            onChange={(event) => setSettings((current) => ({ ...current, endpoint: event.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>Session ID</span>
          <input
            placeholder="Optional existing session"
            value={settings.sessionId}
            onChange={(event) => setSettings((current) => ({ ...current, sessionId: event.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>Webhook URL</span>
          <input
            placeholder="https://example.com/agentation"
            type="url"
            value={settings.webhookUrl}
            onChange={(event) => setSettings((current) => ({ ...current, webhookUrl: event.target.value }))}
          />
        </label>

        <label className={styles.checkbox}>
          <input
            checked={settings.webhooksEnabled}
            type="checkbox"
            onChange={(event) => setSettings((current) => ({ ...current, webhooksEnabled: event.target.checked }))}
          />
          <span>Send annotation events to webhook</span>
        </label>

        <button className={styles.ghostButton} disabled={isBusy} type="button" onClick={saveSettings}>
          Save settings
        </button>
      </section>

      <p className={`${styles.status} ${styles[status.tone]}`}>{status.text}</p>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
