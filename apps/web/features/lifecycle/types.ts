import type {
  LifecycleEnrollmentStatus,
  LifecycleJourneyStatus,
  LifecycleMessageStatus,
  LifecycleStepCondition,
  LifecycleTrigger,
} from "@lucams/db";

export type LifecycleJourneyStepInput = {
  id?: string;
  position: number;
  delayMinutes: number;
  subject: string;
  heading: string;
  preheader: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  commercial: boolean;
  condition: LifecycleStepCondition;
};

export type LifecycleJourneyInput = {
  key: string;
  name: string;
  description: string;
  trigger: LifecycleTrigger;
  status: LifecycleJourneyStatus;
  requireOptIn: boolean;
  inactivityDays: number;
  entryLookbackDays: number;
  cooldownDays: number;
  maxMessagesPerDay: number;
  quietStartHour: number;
  quietEndHour: number;
  steps: LifecycleJourneyStepInput[];
};

export type LifecycleAudienceMember = {
  contactId: string;
  email: string;
  displayName: string | null;
  triggerRef: string | null;
};

export type LifecycleAudiencePreview = {
  eligible: number;
  excludedNoOptIn: number;
  sample: LifecycleAudienceMember[];
};

export type LifecycleRunScope = {
  journeyId?: string;
  contactIds?: string[];
};

export type LifecycleRunSummary = {
  journeys: number;
  enrollmentsCreated: number;
  messagesSent: number;
  messagesSuppressed: number;
  messagesFailed: number;
  enrollmentsCompleted: number;
  enrollmentsExited: number;
  errors: number;
};

export type LifecycleJourneyMetrics = {
  enrollments: number;
  active: number;
  completed: number;
  exited: number;
  suppressed: number;
  messagesSent: number;
  messagesClicked: number;
  conversions: number;
  revenueCents: number;
  clickRate: number;
  conversionRate: number;
};

export type LifecycleMessageWithContact = {
  id: string;
  subject: string;
  ctaUrl: string;
  status: LifecycleMessageStatus;
  scheduledFor: Date;
  sentAt: Date | null;
  clickedAt: Date | null;
  convertedAt: Date | null;
  revenueCents: number;
  contact: {
    primaryEmail: string | null;
    displayName: string | null;
  };
  enrollment: {
    cycle: number;
    status: LifecycleEnrollmentStatus;
    journey: {
      key: string;
      name: string;
    };
  };
};
