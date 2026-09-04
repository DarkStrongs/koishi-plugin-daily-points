"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCampaign = applyCampaign;
const koishi_1 = require("koishi");
const engine_1 = require("./engine");
const render_1 = require("./render");
const scenarios_1 = require("./scenarios");
const validator_1 = require("./validator");
const DIFFICULTY_ALIASES = {
    easy: 'easy', 简单: 'easy', normal: 'normal', 普通: 'normal', hard: 'hard', 困难: 'hard',
};
function channelKey(session) {
    return `${session.platform}:${session.channelId || session.guildId || session.userId}`;
}
function userKey(session) {
    return `${session.platform}:${session.userId}`;
}
function customScenarioId(input) {
    const value = input.trim().toLowerCase();
    return value.startsWith('custom/') ? value : `custom/${value}`;
}
function applyCampaign(ctx, config) {
    if (!config.campaignEnabled)
        return;
    const logger = ctx.logger('daily-points:campaign');
    const locks = new Map();
    ctx.model.extend('daily_campaign_sessions', {
        userKey: 'string(160)',
        channelKey: 'string(200)',
        scenarioId: 'string(80)',
        scenarioVersion: 'unsigned',
        phase: 'string(16)',
        stateJson: 'text',
        revision: 'unsigned',
        createdAt: 'timestamp(3)',
        updatedAt: 'timestamp(3)',
    }, { primary: 'userKey' });
    ctx.model.extend('daily_campaign_records', {
        id: 'unsigned',
        sessionId: 'string(200)',
        userKey: 'string(160)',
        scenarioId: 'string(80)',
        year: 'unsigned',
        candidateId: 'string(80)',
        candidateName: 'string(80)',
        difficulty: 'string(16)',
        result: 'string(16)',
        playerEv: 'unsigned',
        opponentEv: 'unsigned',
        popularShare: 'double',
        summaryJson: 'text',
        createdAt: 'timestamp(3)',
    }, { primary: 'id', autoInc: true, unique: ['sessionId'], index: [['userKey'], ['year']] });
    ctx.model.extend('daily_campaign_scenarios', {
        id: 'unsigned',
        scenarioId: 'string(80)',
        version: 'unsigned',
        enabled: 'unsigned',
        deleted: 'unsigned',
        contentJson: 'text',
        createdBy: 'string(160)',
        createdAt: 'timestamp(3)',
        updatedAt: 'timestamp(3)',
    }, { primary: 'id', autoInc: true, unique: [['scenarioId', 'version']], index: [['scenarioId'], ['enabled']] });
    async function withUserLock(key, task) {
        const previous = locks.get(key) || Promise.resolve();
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const queued = previous.then(() => gate);
        locks.set(key, queued);
        await previous;
        try {
            return await task();
        }
        finally {
            release();
            if (locks.get(key) === queued)
                locks.delete(key);
        }
    }
    async function storedSession(key) {
        const [row] = await ctx.database.get('daily_campaign_sessions', { userKey: key });
        return row;
    }
    function parseSession(row) {
        const state = JSON.parse(row.stateJson);
        state.revision = row.revision;
        return state;
    }
    async function saveSession(row, state, previousRevision) {
        const data = {
            channelKey: row.channelKey,
            scenarioId: state.scenarioId,
            scenarioVersion: state.scenarioVersion,
            phase: state.phase,
            stateJson: JSON.stringify(state),
            revision: state.revision,
            updatedAt: new Date(),
        };
        if (previousRevision === undefined) {
            await ctx.database.upsert('daily_campaign_sessions', [{ ...row, ...data }]);
            return;
        }
        const write = await ctx.database.set('daily_campaign_sessions', { userKey: row.userKey, revision: previousRevision }, data);
        const current = await storedSession(row.userKey);
        if (write?.matched === 0 || !current || current.revision !== state.revision || current.stateJson !== data.stateJson) {
            throw new Error('竞选进度已被另一条消息更新，请发送“竞选继续”刷新状态。');
        }
    }
    async function getScenario(idOrYear, version) {
        const builtin = (0, scenarios_1.getBuiltinScenario)(idOrYear);
        if (builtin)
            return { scenario: builtin, version: 1 };
        const scenarioId = customScenarioId(idOrYear);
        const query = { scenarioId };
        if (version !== undefined)
            query.version = version;
        else
            Object.assign(query, { enabled: 1, deleted: 0 });
        const rows = await ctx.database.get('daily_campaign_scenarios', query, { sort: { version: 'desc' }, limit: 1 });
        if (!rows.length)
            return undefined;
        return { scenario: JSON.parse(rows[0].contentJson), version: rows[0].version };
    }
    async function scenarioForSession(state) {
        return getScenario(state.scenarioId, state.scenarioVersion);
    }
    function sessionRow(key, channel, state) {
        const now = new Date();
        return {
            userKey: key,
            channelKey: channel,
            scenarioId: state.scenarioId,
            scenarioVersion: state.scenarioVersion,
            phase: state.phase,
            stateJson: JSON.stringify(state),
            revision: state.revision,
            createdAt: now,
            updatedAt: now,
        };
    }
    async function recordResult(key, scenario, state, result, outcome) {
        await ctx.database.upsert('daily_campaign_records', [{
                sessionId: `${key}:${state.scenarioId}:${state.seed}`,
                userKey: key,
                scenarioId: state.scenarioId,
                year: scenario.year,
                candidateId: state.candidateId,
                candidateName: (0, scenarios_1.getCandidate)(scenario, state.candidateId)?.name || state.candidateId,
                difficulty: state.difficulty,
                result: outcome,
                playerEv: result.playerElectoralVotes,
                opponentEv: result.opponentElectoralVotes,
                popularShare: result.playerPopularShare,
                summaryJson: JSON.stringify({ answers: state.answers, visits: state.visits, thirdPartyEv: result.thirdPartyElectoralVotes }),
                createdAt: new Date(),
            }]);
    }
    async function renderMap(session, scenario, state, projection, heading) {
        if (!ctx.puppeteer)
            return undefined;
        try {
            return await ctx.puppeteer.render((0, render_1.buildMapHtml)(scenario, state, projection, heading));
        }
        catch (error) {
            logger.warn(`竞选地图渲染失败：${error?.message || error}`);
            return undefined;
        }
    }
    async function showPending(row, scenario, state) {
        if (state.phase === 'completed')
            return '竞选已经完成，正在恢复最终结算。';
        if (state.phase === 'visit')
            return `${(0, render_1.formatCampaignStatus)(scenario, state)}\n请发送“竞选访问 州名或缩写”完成本轮。`;
        const question = (0, engine_1.currentQuestion)(scenario, state);
        return question ? (0, render_1.formatQuestion)(scenario, state, question) : '竞选存档无法找到当前问题。';
    }
    async function completeSession(session, row, scenario, state, prefix = '') {
        const final = (0, engine_1.finalizeCampaign)(scenario, state);
        const ending = (0, engine_1.resultEnding)(scenario, state, final);
        await recordResult(row.userKey, scenario, state, final, final.outcome);
        await ctx.database.remove('daily_campaign_sessions', { userKey: row.userKey });
        const text = `${prefix ? `${prefix}\n\n` : ''}${(0, render_1.formatFinalText)(scenario, state, final, ending)}`;
        const image = await renderMap(session, scenario, state, final, '最终结果');
        if (image) {
            await session.send(text);
            return image;
        }
        return `${text}\n\n${(0, render_1.formatProjectionText)(scenario, state, final, undefined, 'final')}`;
    }
    async function handleAnswer(session, option) {
        const key = userKey(session);
        return withUserLock(key, async () => {
            const row = await storedSession(key);
            if (!row || row.channelKey !== channelKey(session))
                return undefined;
            const state = parseSession(row);
            if (state.phase !== 'question')
                return '本轮已经作答，请发送“竞选访问 州名或缩写”。';
            const loaded = await scenarioForSession(state);
            if (!loaded)
                return '这个竞选场景已不可用，请联系管理员。';
            const beforeRevision = state.revision;
            const outcome = (0, engine_1.answerQuestion)(loaded.scenario, state, option);
            await saveSession(row, state, beforeRevision);
            return [
                `🧭 顾问反馈：${outcome.selected.advisor}`,
                outcome.trend,
                `重点州趋势：${outcome.keyStateTrends.map((item) => `${item.stateName}${item.delta >= .35 ? '改善' : item.delta <= -.35 ? '转差' : '基本稳定'}`).join('、')}`,
                '',
                '现在请选择本轮造势州：发送“竞选访问 州名或缩写”。',
            ].join('\n');
        });
    }
    ctx.command('竞选', '美国总统竞选问答游戏')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const row = await storedSession(userKey(session));
        if (row) {
            const state = parseSession(row);
            const loaded = await scenarioForSession(state);
            if (loaded)
                return `${(0, render_1.formatCampaignStatus)(loaded.scenario, state)}\n发送“竞选继续”查看当前步骤。`;
        }
        return [
            '🗳️ 美国总统竞选',
            '可选年份：1960、1964、1968、2020',
            '开始：竞选开始 年份 候选人 [简单/普通/困难]',
            '示例：竞选开始 1960 肯尼迪 普通',
            '其他：竞选继续 / 竞选状态 / 竞选民调 / 竞选战绩 / 竞选放弃',
        ].join('\n');
    });
    ctx.command('竞选开始 [scenario:string] [candidate:string] [difficulty:string]', '开始一局美国总统竞选')
        .action(async ({ session }, scenarioInput, candidateInput, difficultyInput) => {
        if (!session.userId)
            return;
        if (!scenarioInput)
            return `可选内置场景：${scenarios_1.BUILTIN_SCENARIOS.map((item) => item.year).join('、')}。\n格式：竞选开始 年份 候选人 [难度]`;
        const loaded = await getScenario(scenarioInput);
        if (!loaded)
            return '没有找到这个已启用的竞选场景。';
        const playable = loaded.scenario.candidates.filter((item) => item.playable);
        if (!candidateInput)
            return `可选候选人：${playable.map((item) => `${item.name}（${item.aliases.slice(1).join('/')}）`).join('、')}`;
        const selected = (0, scenarios_1.getCandidate)(loaded.scenario, candidateInput);
        if (!selected || !selected.playable)
            return `候选人无效。可选：${playable.map((item) => item.name).join('、')}`;
        const difficulty = DIFFICULTY_ALIASES[(difficultyInput || '普通').toLowerCase()];
        if (!difficulty)
            return '难度请选择：简单、普通或困难。';
        const key = userKey(session);
        return withUserLock(key, async () => {
            if (await storedSession(key))
                return '你已有一局未完成的竞选。请发送“竞选继续”，或先发送“竞选放弃”。';
            const state = (0, engine_1.createCampaignSession)(loaded.scenario, selected.id, difficulty, undefined, loaded.version);
            await saveSession(sessionRow(key, channelKey(session), state), state);
            const question = (0, engine_1.currentQuestion)(loaded.scenario, state);
            return `${loaded.scenario.description}\n${loaded.scenario.sourceNote}\n\n${(0, scenarios_1.getCandidate)(loaded.scenario, selected.id).name} / ${selected.runningMate}\n${loaded.scenario.routes.find((item) => item.candidateId === selected.id).introduction}\n\n${(0, render_1.formatQuestion)(loaded.scenario, state, question)}`;
        });
    });
    ctx.command('竞选继续', '恢复竞选并绑定到当前频道')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = userKey(session);
        return withUserLock(key, async () => {
            const row = await storedSession(key);
            if (!row)
                return '没有未完成的竞选。发送“竞选开始”查看玩法。';
            const state = parseSession(row);
            const loaded = await scenarioForSession(state);
            if (!loaded)
                return '这个竞选场景已不可用，请联系管理员。';
            row.channelKey = channelKey(session);
            await ctx.database.set('daily_campaign_sessions', { userKey: key }, { channelKey: row.channelKey, updatedAt: new Date() });
            if (state.phase === 'completed')
                return completeSession(session, row, loaded.scenario, state);
            return showPending(row, loaded.scenario, state);
        });
    });
    ctx.command('竞选状态', '查看当前竞选状态')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const row = await storedSession(userKey(session));
        if (!row)
            return '没有未完成的竞选。';
        const state = parseSession(row);
        const loaded = await scenarioForSession(state);
        return loaded ? (0, render_1.formatCampaignStatus)(loaded.scenario, state) : '这个竞选场景已不可用。';
    });
    ctx.command('竞选访问 <state:string>', '选择本轮造势州')
        .action(async ({ session }, stateInput) => {
        if (!session.userId)
            return;
        if (!stateInput)
            return '请输入州名或缩写，例如“竞选访问 PA”。';
        const key = userKey(session);
        return withUserLock(key, async () => {
            const row = await storedSession(key);
            if (!row)
                return '没有未完成的竞选。';
            if (row.channelKey !== channelKey(session))
                return '这局竞选绑定在另一个频道；请先发送“竞选继续”转移到这里。';
            const state = parseSession(row);
            const loaded = await scenarioForSession(state);
            if (!loaded)
                return '这个竞选场景已不可用。';
            if (state.phase !== 'visit')
                return '当前应先回答问题，直接发送 1—4。';
            if (!(0, engine_1.resolveState)(loaded.scenario, stateInput))
                return '州名或缩写无效，例如：宾夕法尼亚、PA、加利福尼亚、CA。';
            const beforeRevision = state.revision;
            let outcome;
            try {
                outcome = (0, engine_1.visitState)(loaded.scenario, state, stateInput);
            }
            catch (error) {
                return error.message;
            }
            await saveSession(row, state, beforeRevision);
            const visitMessage = `📍 你访问了${outcome.state.name}（第 ${outcome.count} 次，重复访问收益会递减）；对手前往${outcome.opponentState.name}。`;
            if (!outcome.completed) {
                const question = (0, engine_1.currentQuestion)(loaded.scenario, state);
                return `${visitMessage}\n\n${(0, render_1.formatQuestion)(loaded.scenario, state, question)}`;
            }
            return completeSession(session, row, loaded.scenario, state, visitMessage);
        });
    });
    ctx.command('竞选民调 [state:string]', '查看当前全国或州级民调')
        .action(async ({ session }, stateInput) => {
        if (!session.userId)
            return;
        const key = userKey(session);
        const row = await storedSession(key);
        if (!row)
            return '没有未完成的竞选。';
        const state = parseSession(row);
        const loaded = await scenarioForSession(state);
        if (!loaded)
            return '这个竞选场景已不可用。';
        let stateId;
        if (stateInput) {
            const found = (0, engine_1.resolveState)(loaded.scenario, stateInput);
            if (!found)
                return '州名或缩写无效。';
            stateId = found.id;
        }
        const projection = (0, engine_1.projectCampaign)(loaded.scenario, state, true);
        const text = (0, render_1.formatProjectionText)(loaded.scenario, state, projection, stateId);
        if (stateId)
            return text;
        const image = await renderMap(session, loaded.scenario, state, projection, '当前民调');
        if (image) {
            await session.send(text);
            return image;
        }
        return text;
    });
    ctx.command('竞选放弃', '放弃当前竞选')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = userKey(session);
        return withUserLock(key, async () => {
            const row = await storedSession(key);
            if (!row)
                return '没有未完成的竞选。';
            const state = parseSession(row);
            const loaded = await scenarioForSession(state);
            if (loaded)
                await recordResult(key, loaded.scenario, state, (0, engine_1.projectCampaign)(loaded.scenario, state), 'abandoned');
            await ctx.database.remove('daily_campaign_sessions', { userKey: key });
            return '已放弃当前竞选，进度已清除并记入战绩。';
        });
    });
    ctx.command('竞选战绩 [year:number]', '查看个人竞选战绩')
        .action(async ({ session }, year) => {
        if (!session.userId)
            return;
        const query = { userKey: userKey(session) };
        if (year)
            query.year = year;
        const rows = await ctx.database.get('daily_campaign_records', query, { sort: { createdAt: 'desc' } });
        if (!rows.length)
            return '还没有符合条件的竞选战绩。';
        const completed = rows.filter((item) => item.result !== 'abandoned');
        const wins = completed.filter((item) => item.result === 'win').length;
        const losses = completed.filter((item) => item.result === 'loss').length;
        const ties = completed.filter((item) => item.result === 'tie').length;
        const best = completed.reduce((max, item) => Math.max(max, item.playerEv), 0);
        const difficultyNames = { easy: '简单', normal: '普通', hard: '困难' };
        const resultNames = { win: '胜', loss: '负', tie: '平', abandoned: '放弃' };
        return [
            `📚 竞选战绩${year ? `｜${year}` : ''}`,
            `完成 ${completed.length} 局：胜 ${wins} / 负 ${losses} / 平 ${ties}｜放弃 ${rows.length - completed.length}`,
            `最佳选举人票：${best}`,
            '最近记录：',
            ...rows.slice(0, 5).map((item) => `  ${item.year} ${item.candidateName || item.candidateId} ${difficultyNames[item.difficulty] || item.difficulty}｜${resultNames[item.result] || item.result}｜${item.playerEv}:${item.opponentEv}｜普选 ${Number(item.popularShare).toFixed(1)}%`),
        ].join('\n');
    });
    const adminCommand = { authority: config.campaignAdminAuthority };
    const scenarioRoot = ctx.command('竞选场景', '管理自定义竞选场景', adminCommand);
    scenarioRoot.subcommand('.导入 <json:text>', '粘贴并导入场景 JSON', adminCommand)
        .action(async ({ session }, json) => {
        if (!json)
            return `请在命令后粘贴 JSON（最大 ${validator_1.MAX_SCENARIO_BYTES / 1024} KiB）。`;
        const result = (0, validator_1.parseScenarioJson)(json);
        if (!result.valid || !result.scenario)
            return `导入失败：\n${result.errors.map((item) => `- ${item}`).join('\n')}`;
        const scenario = result.scenario;
        const oldRows = await ctx.database.get('daily_campaign_scenarios', { scenarioId: scenario.id }, { sort: { version: 'desc' } });
        const version = (oldRows[0]?.version || 0) + 1;
        if (oldRows.length)
            await ctx.database.set('daily_campaign_scenarios', { scenarioId: scenario.id }, { enabled: 0, updatedAt: new Date() });
        const now = new Date();
        await ctx.database.create('daily_campaign_scenarios', {
            scenarioId: scenario.id,
            version,
            enabled: 1,
            deleted: 0,
            contentJson: JSON.stringify(scenario),
            createdBy: userKey(session),
            createdAt: now,
            updatedAt: now,
        });
        return `已导入 ${scenario.title}（${scenario.id}）版本 ${version}，新开的竞选将使用此版本。`;
    });
    scenarioRoot.subcommand('.列表', '列出内置和自定义场景', adminCommand)
        .action(async () => {
        const rows = await ctx.database.get('daily_campaign_scenarios', {}, { sort: { scenarioId: 'asc', version: 'desc' } });
        const latest = new Map();
        rows.forEach((row) => { if (!latest.has(row.scenarioId))
            latest.set(row.scenarioId, row); });
        return [
            '内置场景（不可修改）：',
            ...scenarios_1.BUILTIN_SCENARIOS.map((item) => `  ${item.year}｜${item.title}`),
            '自定义场景：',
            ...([...latest.values()].map((item) => `  ${item.scenarioId} v${item.version}｜${item.deleted ? '已删除' : item.enabled ? '已启用' : '已禁用'}`)),
            ...(latest.size ? [] : ['  暂无']),
        ].join('\n');
    });
    async function setScenarioState(input, mode) {
        if (!input)
            return '请输入自定义场景ID。';
        if ((0, scenarios_1.getBuiltinScenario)(input) || /^builtin\//i.test(input) || /^\d{4}$/.test(input))
            return '内置场景不可修改。';
        const scenarioId = customScenarioId(input);
        const rows = await ctx.database.get('daily_campaign_scenarios', { scenarioId }, { sort: { version: 'desc' }, limit: 1 });
        if (!rows.length)
            return '没有找到这个自定义场景。';
        const data = mode === 'delete' ? { enabled: 0, deleted: 1, updatedAt: new Date() } : { enabled: mode === 'enable' ? 1 : 0, deleted: 0, updatedAt: new Date() };
        await ctx.database.set('daily_campaign_scenarios', { scenarioId, version: rows[0].version }, data);
        return `${scenarioId} 已${mode === 'enable' ? '启用' : mode === 'disable' ? '禁用' : '删除'}。已有存档仍可使用其原版本。`;
    }
    scenarioRoot.subcommand('.启用 <id:string>', '启用最新版本', adminCommand).action(async (_, id) => setScenarioState(id, 'enable'));
    scenarioRoot.subcommand('.禁用 <id:string>', '禁用最新版本', adminCommand).action(async (_, id) => setScenarioState(id, 'disable'));
    scenarioRoot.subcommand('.删除 <id:string>', '软删除最新版本', adminCommand).action(async (_, id) => setScenarioState(id, 'delete'));
    scenarioRoot.subcommand('.导出 <id:string>', '导出最新版本 JSON', adminCommand)
        .action(async (_, input) => {
        if (!input)
            return '请输入场景ID。';
        const builtin = (0, scenarios_1.getBuiltinScenario)(input);
        if (builtin) {
            const exported = JSON.parse(JSON.stringify(builtin));
            exported.id = `copy-${builtin.year}`;
            const content = JSON.stringify(exported, null, 2);
            return koishi_1.h.file(Buffer.from(content, 'utf8'), 'application/json', { title: `campaign-${builtin.year}-template.json` });
        }
        const scenarioId = customScenarioId(input);
        const rows = await ctx.database.get('daily_campaign_scenarios', { scenarioId }, { sort: { version: 'desc' }, limit: 1 });
        if (!rows.length)
            return '没有找到这个自定义场景。';
        const exported = JSON.parse(rows[0].contentJson);
        exported.id = scenarioId.slice(7);
        const content = JSON.stringify(exported, null, 2);
        return koishi_1.h.file(Buffer.from(content, 'utf8'), 'application/json', { title: `${scenarioId.slice(7)}-v${rows[0].version}.json` });
    });
    ctx.middleware(async (session, next) => {
        const match = session.content?.trim().match(/^[1-4]$/);
        if (!match || !session.userId)
            return next();
        const result = await handleAnswer(session, Number(match[0]));
        return result === undefined ? next() : result;
    }, true);
}
