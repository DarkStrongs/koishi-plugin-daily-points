import { Context, Schema } from 'koishi'

export declare const name: string
export declare const inject: object
export declare const usage: string
export declare const Config: Schema<object>
export declare function apply(ctx: Context, config: any): void
