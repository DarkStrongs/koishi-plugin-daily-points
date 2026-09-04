import { CampaignCandidate, CampaignRoute, CampaignScenario } from './types';
export declare const BUILTIN_SCENARIOS: CampaignScenario[];
export declare function getBuiltinScenario(idOrYear: string | number): CampaignScenario | undefined;
export declare function getRoute(scenario: CampaignScenario, candidateId: string): CampaignRoute | undefined;
export declare function getCandidate(scenario: CampaignScenario, idOrAlias: string): CampaignCandidate | undefined;
