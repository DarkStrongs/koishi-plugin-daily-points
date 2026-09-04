import { Context } from 'koishi';
/** 指令「连写」兼容：存款100、还款:500、彩票3 等没有空格的形式被拆成「存款 100」「还款 500」「彩票 3」再 dispatch。 */
export declare function registerGlueMiddleware(ctx: Context): void;
