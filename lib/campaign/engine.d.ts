import { CampaignDifficulty, CampaignEffect, CampaignFinalResult, CampaignProjection, CampaignQuestionVariant, CampaignScenario, CampaignSessionState, CampaignState, CampaignStateProjection } from './types';
export declare function createCampaignSession(scenario: CampaignScenario, candidateId: string, difficulty?: CampaignDifficulty, seed?: number, scenarioVersion?: number): CampaignSessionState;
export declare function currentQuestion(scenario: CampaignScenario, session: CampaignSessionState): CampaignQuestionVariant | undefined;
export declare function describeTrend(effect: CampaignEffect): string;
export declare function answerQuestion(scenario: CampaignScenario, session: CampaignSessionState, optionNumber: number): {
    question: CampaignQuestionVariant;
    selected: import("./types").CampaignOption;
    trend: string;
    keyStateTrends: {
        stateId: string;
        stateName: string;
        delta: number;
        electoralVotes: number;
    }[];
};
export declare function resolveState(scenario: CampaignScenario, input: string): CampaignState | undefined;
export declare function visitState(scenario: CampaignScenario, session: CampaignSessionState, stateInput: string): {
    state: CampaignState;
    gain: number;
    count: number;
    opponentState: CampaignState;
    opponentGain: number;
    completed: boolean;
};
export declare function projectCampaign(scenario: CampaignScenario, session: CampaignSessionState, polling?: boolean): CampaignProjection;
export declare function finalizeCampaign(scenario: CampaignScenario, session: CampaignSessionState): CampaignFinalResult;
export declare function resultEnding(scenario: CampaignScenario, session: CampaignSessionState, result: CampaignFinalResult): string;
export declare function keyStates(projection: CampaignProjection, limit?: number): CampaignStateProjection[];
