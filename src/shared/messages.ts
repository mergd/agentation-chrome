import type { Annotation } from "agentation";
import type { ExtensionSettings, SiteGrant } from "./settings";

export type PageContext = {
  title: string;
  url: string;
};

export type PageEligibility = {
  eligible: boolean;
  reasons: string[];
  stats: {
    canvasCount: number;
    interactiveCount: number;
    textLength: number;
  };
};

export type AgentationEvent =
  | {
      kind: "annotation:add" | "annotation:delete" | "annotation:update";
      annotation: Annotation;
      page: PageContext;
      timestamp: number;
    }
  | {
      kind: "annotations:clear";
      annotations: Annotation[];
      page: PageContext;
      timestamp: number;
    }
  | {
      kind: "copy";
      markdown: string;
      page: PageContext;
      timestamp: number;
    }
  | {
      kind: "submit";
      output: string;
      annotations: Annotation[];
      page: PageContext;
      timestamp: number;
    }
  | {
      kind: "site-request";
      detail: unknown;
      page: PageContext;
      timestamp: number;
    };

export type RuntimeMessage =
  | {
      type: "agentation:open-current-tab";
    }
  | {
      type: "agentation:content-ready";
      eligibility: PageEligibility;
      page: PageContext;
    }
  | {
      type: "agentation:open";
    }
  | {
      type: "agentation:get-eligibility";
    }
  | {
      type: "agentation:get-settings";
    }
  | {
      type: "agentation:set-settings";
      settings: Partial<ExtensionSettings>;
    }
  | {
      type: "agentation:remember-site";
      site: SiteGrant;
    }
  | {
      type: "agentation:forget-site";
      site: SiteGrant;
    }
  | {
      type: "agentation:event";
      event: AgentationEvent;
    };

export type RuntimeResponse =
  | {
      ok: true;
      eligibility?: PageEligibility;
      settings?: ExtensionSettings;
      rememberedSites?: SiteGrant[];
    }
  | {
      ok: false;
      error: string;
    };
