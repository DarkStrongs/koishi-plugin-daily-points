export type CampaignParty = 'democratic' | 'republican' | 'independent';
export type CampaignDifficulty = 'easy' | 'normal' | 'hard';
export type CampaignPhase = 'question' | 'visit' | 'completed';
export type CampaignResult = 'win' | 'loss' | 'tie' | 'abandoned';
export interface CampaignCandidate {
    id: string;
    name: string;
    aliases: string[];
    party: CampaignParty;
    runningMate: string;
    playable: boolean;
    color: string;
}
export interface CampaignDistrict {
    id: string;
    name: string;
    electoralVotes: number;
    baselineMargin: number;
}
export interface CampaignState {
    id: string;
    name: string;
    aliases: string[];
    region: string;
    electoralVotes: number;
    baselineMargin: number;
    turnout: number;
    thirdPartyShare?: number;
    districts?: CampaignDistrict[];
    tileX: number;
    tileY: number;
}
export interface CampaignEffect {
    national?: number;
    regions?: Record<string, number>;
    states?: Record<string, number>;
    issues?: Record<string, number>;
    thirdParty?: number;
}
export interface CampaignOption {
    text: string;
    advisor: string;
    effect: CampaignEffect;
    setFlags?: Record<string, string>;
}
export interface CampaignQuestionVariant {
    id: string;
    prompt: string;
    when?: Record<string, string>;
    options: CampaignOption[];
}
export interface CampaignQuestionSlot {
    id: string;
    variants: CampaignQuestionVariant[];
}
export interface CampaignRoute {
    candidateId: string;
    introduction: string;
    slots: CampaignQuestionSlot[];
    endings: {
        landslideWin: string;
        win: string;
        tie: string;
        loss: string;
        landslideLoss: string;
    };
}
export interface CampaignScenario {
    schemaVersion: 1;
    id: string;
    title: string;
    year: number;
    description: string;
    sourceNote: string;
    totalElectoralVotes: number;
    majority: number;
    candidates: CampaignCandidate[];
    states: CampaignState[];
    routes: CampaignRoute[];
    issueWeights?: Record<string, Record<string, number>>;
}
export interface CampaignSessionState {
    scenarioId: string;
    scenarioVersion: number;
    candidateId: string;
    opponentId: string;
    difficulty: CampaignDifficulty;
    phase: CampaignPhase;
    turn: number;
    stateMargins: Record<string, number>;
    thirdPartyShift: Record<string, number>;
    visitCounts: Record<string, number>;
    opponentVisitCounts: Record<string, number>;
    flags: Record<string, string>;
    answers: Array<{
        turn: number;
        questionId: string;
        option: number;
    }>;
    visits: string[];
    seed: number;
    revision: number;
    cachedPollTurn?: number;
    cachedPoll?: CampaignProjection;
}
export interface CampaignStateProjection {
    stateId: string;
    stateName: string;
    electoralVotes: number;
    playerShare: number;
    opponentShare: number;
    thirdPartyShare: number;
    margin: number;
    winnerId: string;
}
export interface CampaignProjection {
    turn: number;
    playerElectoralVotes: number;
    opponentElectoralVotes: number;
    thirdPartyElectoralVotes: number;
    playerPopularShare: number;
    opponentPopularShare: number;
    thirdPartyPopularShare: number;
    states: CampaignStateProjection[];
}
export interface CampaignFinalResult extends CampaignProjection {
    outcome: Exclude<CampaignResult, 'abandoned'>;
    contingentElection: boolean;
}
export interface ScenarioValidationResult {
    valid: boolean;
    errors: string[];
    scenario?: CampaignScenario;
}
