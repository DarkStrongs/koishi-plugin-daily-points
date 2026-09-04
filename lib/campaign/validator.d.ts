import { ScenarioValidationResult } from './types';
export declare const MAX_SCENARIO_BYTES: number;
export declare function stripJsonFence(input: string): string;
export declare function parseScenarioJson(input: string): ScenarioValidationResult;
export declare function validateScenario(value: unknown, custom?: boolean): ScenarioValidationResult;
