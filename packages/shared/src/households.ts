export interface HouseholdMember {
  id: string;
  name: string;
  relation: string;
  aliases: string[];
  passkeyCredentialIds: string[];
}

export interface HouseholdDoc {
  name: string;
  seniorName: string;
  members: HouseholdMember[];
}

// The single demo household used tonight; no real senior data per CLAUDE.md.
export const DEMO_HOUSEHOLD_ID = 'demo';
