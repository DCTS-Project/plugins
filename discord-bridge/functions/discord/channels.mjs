import {ChannelType, Events, ActivityType} from "discord.js";
import {client, pluginSettings, UNCATEGORIZED_ID} from "../plugin_onLoad.mjs";
import {saveConfig, serverconfig} from "../../../../index.mjs";
import Logger from "@hackthedev/terminal-logger";
import {saveMemberToDB} from "../../../../modules/functions/mysql/helper.mjs";
import {getDCTSChannelPermissions, syncDiscordRoles} from "./roles.mjs";


function sortDiscordChannels(a, b) {
    const positionDifference = b.rawPosition - a.rawPosition;

    if (positionDifference !== 0) {
        return positionDifference;
    }

    return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
}

export async function initDiscordChannelSync() {
    if (!pluginSettings.discord.sync_channels) return;

    client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
        await syncDiscordPresences(newPresence);
    });

    client.once(Events.ClientReady, async readyClient => {
        for (const guild of readyClient.guilds.cache.values()) {
            if (!pluginSettings.discord.guilds.includes(guild.id)) continue;

            await syncDiscordRoles(guild);
            await syncGuild(guild);
        }

        await syncDiscordPresences();
    });

    client.on(Events.ChannelCreate, async channel => {
        if (!channel.guild) return;
        if (!pluginSettings.discord.guilds.includes(channel.guild.id)) return;

        await syncGuild(channel.guild);
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;
        if (!pluginSettings.discord.guilds.includes(newChannel.guild.id)) return;

        await syncGuild(newChannel.guild);
    });

    client.on(Events.ChannelDelete, async channel => {
        if (!channel.guild) return;
        if (!pluginSettings.discord.guilds.includes(channel.guild.id)) return;

        await syncGuild(channel.guild);
    });
}

export async function syncDiscordPresences() {
    for (const guild of client.guilds.cache.values()) {
        if (!pluginSettings.discord.guilds.includes(guild.id)) continue;

        const onlineMembers = guild.members.cache.filter(
            member => member.presence?.status &&
                member.presence.status !== "offline"
        );

        for (const discordMember of onlineMembers.values()) {
            const member = serverconfig.servermembers[discordMember.id];
            if (!member) continue;

            member.lastOnline = new Date().getTime();

            const customStatus = discordMember.presence.activities?.find(
                activity => activity.type === ActivityType.Custom
            );

            if (customStatus?.state) {
                member.status = customStatus.state;
            }

            await saveMemberToDB(member.id, member);
        }
    }
}

async function syncGuild(guild) {
    await checkDCTSGroupInit(guild);

    await guild.channels.fetch();

    const allChannels = [...guild.channels.cache.values()];

    const categories = allChannels
        .filter(channel => channel.type === ChannelType.GuildCategory)
        .sort(sortDiscordChannels);

    const normalChannels = allChannels
        .filter(channel => channel.type !== ChannelType.GuildCategory);

    const uncategorizedChannels = normalChannels
        .filter(channel => !channel.parentId)
        .sort(sortDiscordChannels);

    const syncedCategories = {};
    let categorySortId = 0;

    if (uncategorizedChannels.length > 0) {
        syncedCategories[UNCATEGORIZED_ID] = {
            info: {
                id: UNCATEGORIZED_ID,
                name: "Uncategorized",
                sortId: 99999
            },
            channel: {}
        };

        for (let channelSortId = 0; channelSortId < uncategorizedChannels.length; channelSortId++) {
            const channel = uncategorizedChannels[channelSortId];

            syncedCategories[UNCATEGORIZED_ID].channel[channel.id] =
                createDCTSChannelObject(channel, channelSortId);

            Logger.info(`Synced Discord channel ${channel.name} (${channel.id})`);
        }

        Logger.info(`Synced Discord category Uncategorized (${UNCATEGORIZED_ID})`);

        categorySortId++;
    }

    for (const category of categories) {
        const categoryChannels = normalChannels
            .filter(channel => channel.parentId === category.id)
            .sort(sortDiscordChannels);

        syncedCategories[category.id] = {
            info: {
                id: category.id,
                name: category.name,
                sortId: categorySortId
            },
            channel: {}
        };

        Logger.info(`Synced Discord category ${category.name} (${category.id})`);

        for (let channelSortId = 0; channelSortId < categoryChannels.length; channelSortId++) {
            const channel = categoryChannels[channelSortId];

            syncedCategories[category.id].channel[channel.id] =
                createDCTSChannelObject(channel, channelSortId);

            Logger.info(`Synced Discord channel ${channel.name} (${channel.id})`);
        }

        categorySortId++;
    }

    serverconfig.groups[guild.id].info.name = guild.name;
    serverconfig.groups[guild.id].info.icon =
        guild.iconURL({size: 1024}) ?? "/img/default_icon.png";
    serverconfig.groups[guild.id].info.banner =
        guild.bannerURL({size: 2048}) ?? "/img/default_banner.png";

    mergeDiscordChannels(guild, syncedCategories);

    saveConfig(serverconfig);
}

function createDCTSChannelObject(channel, sortId) {
    return {
        id: channel.id,
        name: channel.name,
        type: getDCTSChannelType(channel.type),
        description: channel.topic ?? "",
        sortId,
        permissions: getDCTSChannelPermissions(channel),
        discord: {
            guildId: channel.guild.id,
            synced: 1
        }
    };
}

async function checkDCTSGroupInit(guild) {
    if (!pluginSettings.discord.guilds.includes(guild.id)) return;
    if (serverconfig.groups[guild.id]) return;

    createDCTSGroup({
        groupName: guild.name,
        groupId: guild.id,
        groupIcon: guild.iconURL({size: 1024}),
        groupBanner: guild.bannerURL({size: 2048})
    });
}

function getDCTSChannelType(type) {
    switch (type) {
        case ChannelType.GuildVoice:
        case ChannelType.GuildStageVoice:
            return "discord_voice";
        default:
            return "discord_text";
    }
}

function createDCTSGroup({
                             groupId = null,
                             groupName = null,
                             groupBanner = null,
                             groupIcon = null
                         } = {}) {
    if (!groupId) throw new Error("Missing group id");
    if (!groupName) throw new Error("Missing group name");

    serverconfig.groups[groupId] = {
        info: {
            id: groupId,
            name: groupName,
            icon: groupIcon ?? "/img/default_icon.png",
            banner: groupBanner ?? "/img/default_banner.png",
            isDeletable: 1,
            sortId: 0,
            access: []
        },
        channels: {
            categories: {}
        },
        permissions: {
            0: {
                viewGroup: 1
            }
        }
    };

    Logger.info(`Created new group for Discord server ${groupName} (${groupId})`);
}

function mergeDiscordChannels(guild, syncedCategories) {
    const group = serverconfig.groups[guild.id];

    group.channels ??= {};
    group.channels.categories ??= {};

    const existingCategories = group.channels.categories;
    const syncedCategoryIds = new Set(Object.keys(syncedCategories));

    for (const [categoryId, syncedCategory] of Object.entries(syncedCategories)) {
        const existingCategory = existingCategories[categoryId];

        existingCategories[categoryId] = {
            ...existingCategory,
            info: {
                ...existingCategory?.info,
                ...syncedCategory.info,
                type: "discord_category",
                guildId: guild.id
            },
            channel: mergeDiscordCategoryChannels(
                guild,
                existingCategory?.channel ?? {},
                syncedCategory.channel
            )
        };
    }

    for (const [categoryId, category] of Object.entries(existingCategories)) {
        if (category?.info?.type !== "discord_category") continue;
        if (String(category?.info?.guildId) !== String(guild.id)) continue;
        if (syncedCategoryIds.has(categoryId)) continue;

        delete existingCategories[categoryId];
    }
}
function mergeDiscordCategoryChannels(guild, existingChannels, syncedChannels) {
    const result = {
        ...existingChannels
    };

    const syncedChannelIds = new Set(Object.keys(syncedChannels));

    for (const [channelId, syncedChannel] of Object.entries(syncedChannels)) {
        const existingChannel = existingChannels[channelId];

        result[channelId] = {
            ...existingChannel,
            ...syncedChannel,

            permissions: mergeChannelPermissions(
                existingChannel?.permissions,
                syncedChannel.permissions
            ),

            discord: {
                guildId: guild.id,
                synced: 1
            }
        };
    }

    for (const [channelId, channel] of Object.entries(result)) {
        if (channel?.discord?.synced !== 1) continue;
        if (String(channel?.discord?.guildId) !== String(guild.id)) continue;
        if (syncedChannelIds.has(channelId)) continue;

        delete result[channelId];
    }

    return result;
}

function mergeChannelPermissions(existingPermissions = {}, discordPermissions = {}) {
    const result = {
        ...existingPermissions
    };

    for (const [roleId, permissions] of Object.entries(discordPermissions)) {
        result[roleId] = {
            ...permissions,
            ...(existingPermissions[roleId] ?? {})
        };
    }

    return result;
}