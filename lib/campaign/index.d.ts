import { Context } from 'koishi';
export interface CampaignConfig {
    campaignEnabled: boolean;
    campaignAdminAuthority: number;
}
export declare function applyCampaign(ctx: Context, config: CampaignConfig): void;
