export type SiteGrant = {
  origin: string;
  pattern: string;
  grantedAt: number;
};

export type ExtensionSettings = {
  endpoint: string;
  sessionId: string;
  webhookUrl: string;
  webhooksEnabled: boolean;
};

export type ExtensionState = {
  rememberedSites: SiteGrant[];
  settings: ExtensionSettings;
};

export const defaultSettings: ExtensionSettings = {
  endpoint: "",
  sessionId: "",
  webhookUrl: "",
  webhooksEnabled: false
};

export const extensionStateKey = "agentation:extension-state";
export const eventLogKey = "agentation:event-log";
export const lastOutputKey = "agentation:last-output";

export function mergeSettings(settings?: Partial<ExtensionSettings>): ExtensionSettings {
  return {
    ...defaultSettings,
    ...settings
  };
}

export function mergeState(state?: Partial<ExtensionState>): ExtensionState {
  return {
    rememberedSites: state?.rememberedSites ?? [],
    settings: mergeSettings(state?.settings)
  };
}
