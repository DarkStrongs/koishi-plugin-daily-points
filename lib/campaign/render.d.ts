import { CampaignProjection, CampaignQuestionVariant, CampaignScenario, CampaignSessionState } from './types';
export declare function formatQuestion(scenario: CampaignScenario, session: CampaignSessionState, question: CampaignQuestionVariant): string;
export declare function formatCampaignStatus(scenario: CampaignScenario, session: CampaignSessionState): string;
export declare function formatProjectionText(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, stateId?: string, mode?: 'poll' | 'final'): string;
export declare function buildMapHtml(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, heading?: string): string;
export declare function formatFinalText(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, ending: string): string;
