/** Models settings plugin configuration shared by the Host and Client faces; types only. */
import type { Volatile } from '@deepseek-ai/cordis'

/** Credential-onboarding choice; the browser receives it through its synced Config. */
export interface ModelsConfig {
  /** Mount Web onboarding steps when the Client activates; defaults to true. */
  onboarding?: Volatile<boolean>
  /** Offer the browser API-key step automatically when no native shell owns credential onboarding. */
  credentialOnboarding: Volatile<boolean>
}
