import {Events, PermissionFlagsBits} from "discord.js";
import {saveConfig, serverconfig} from "../../../../index.mjs";
import {client, pluginSettings} from "../plugin_onLoad.mjs";

export function initRoleSync() {
    client.on(Events.GuildRoleCreate, async role => {
        if (!pluginSettings.discord.guilds.includes(role.guild.id)) return;

        await syncDiscordRoles(role.guild);
    });

    client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
        if (!pluginSettings.discord.guilds.includes(newRole.guild.id)) return;

        await syncDiscordRoles(newRole.guild);
    });

    client.on(Events.GuildRoleDelete, async role => {
        if (!pluginSettings.discord.guilds.includes(role.guild.id)) return;

        delete serverconfig.serverroles[role.id];
        saveConfig(serverconfig);
    });

    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        if (!pluginSettings.discord.guilds.includes(newMember.guild.id)) return;

        await syncDiscordMemberRoles(newMember);
    });
}

async function syncDiscordMemberRoles(member) {
    const memberId = String(member.id);

    for (const role of member.guild.roles.cache.values()) {
        if (role.id === member.guild.id) continue;

        const roleId = String(role.id);
        const dctsRole = serverconfig.serverroles?.[roleId];

        if (!dctsRole) continue;

        dctsRole.members ??= [];

        const hasDiscordRole = member.roles.cache.has(roleId);
        const hasDCTSRole = dctsRole.members.some(
            id => String(id) === memberId
        );

        if (hasDiscordRole && !hasDCTSRole) {
            dctsRole.members.push(memberId);
        }
    }

    await saveConfig(serverconfig);
}

const DISCORD_PERMISSION_MAP = new Map([
    [PermissionFlagsBits.Administrator, ["administrator"]],
    [PermissionFlagsBits.ViewChannel, ["viewChannel"]],
    [PermissionFlagsBits.SendMessages, ["sendMessages"]],
    [PermissionFlagsBits.ReadMessageHistory, ["readMessages", "viewChannelHistory"]],
    [PermissionFlagsBits.ManageChannels, ["manageChannels", "createCategory"]],
    [PermissionFlagsBits.ManageRoles, ["manageRoles", "manageMembers"]],
    [PermissionFlagsBits.ManageMessages, ["manageMessages"]],
    [PermissionFlagsBits.ManageGuild, ["manageServer", "manageServerInfo"]],
    [PermissionFlagsBits.KickMembers, ["kickUsers"]],
    [PermissionFlagsBits.BanMembers, ["banMember", "manageBans"]],
    [PermissionFlagsBits.ManageGuildExpressions, ["manageEmojis"]],
    [PermissionFlagsBits.ManageWebhooks, ["manageUploads"]],
    [PermissionFlagsBits.AttachFiles, ["sendFiles", "uploadFiles"]],
    [PermissionFlagsBits.EmbedLinks, ["sendURL"]],
    [PermissionFlagsBits.MentionEveryone, ["pingEveryone"]],
    [PermissionFlagsBits.Connect, ["useVOIP"]],
    [PermissionFlagsBits.ModerateMembers, ["muteUsers", "generalModeration"]]
]);

function convertDiscordPermissions(permissionBitField, roleId) {
    const discordPermissions = {};

    for (const [discordPermission, dctsPermissions] of DISCORD_PERMISSION_MAP) {
        if (!permissionBitField.has(discordPermission)) continue;

        for (const permission of dctsPermissions) {
            discordPermissions[permission] = 1;
        }
    }

    // super fucking important lol
    const dctsPermissions =
        serverconfig.serverroles?.[roleId]?.permissions ?? {};

    return {
        ...discordPermissions,
        ...dctsPermissions
    };
}

function getDiscordRoleMembers(guild, roleId) {
    const discordMembers = guild.members.cache
        .filter(member => member.roles.cache.has(roleId))
        .map(member => String(member.id));

    // very very important cauz otherwise we overwrite shit
    const dctsMembers =
        serverconfig.serverroles?.[roleId]?.members ?? [];

    return [...new Set([
        ...dctsMembers.map(String),
        ...discordMembers
    ])];
}

export function getDCTSChannelPermissions(channel) {
    const permissions = {};

    for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.type !== 0) continue;

        const roleId = overwrite.id === channel.guild.id
            ? "0"
            : String(overwrite.id);

        const rolePermissions = {};

        for (const [discordPermission, dctsPermissions] of DISCORD_PERMISSION_MAP) {
            let value = null;

            if (overwrite.allow.has(discordPermission)) {
                value = 1;
            } else if (overwrite.deny.has(discordPermission)) {
                value = -1;
            }

            if (value === null) continue;

            for (const permission of dctsPermissions) {
                rolePermissions[permission] = value;
            }
        }

        if (Object.keys(rolePermissions).length > 0) {
            permissions[roleId] = rolePermissions;
        }
    }

    return permissions;
}

export async function syncDiscordRoles(guild) {
    if (!pluginSettings.discord.guilds.includes(guild.id)) return;

    const roles = await guild.roles.fetch();
    const syncedRoleIds = new Set();

    const everyoneRole = roles.get(guild.id);

    if (everyoneRole) {
        serverconfig.serverroles["0"].permissions =
            convertDiscordPermissions(
                everyoneRole.permissions,
                "0"
            );

        serverconfig.serverroles["0"].members = [
            ...new Set([
                ...(serverconfig.serverroles["0"].members ?? []).map(String),
                ...guild.members.cache.keys()
            ])
        ];
    }

    for (const role of roles.values()) {
        if (role.id === guild.id) continue;

        const roleId = String(role.id);
        const existingRole = serverconfig.serverroles?.[roleId];

        syncedRoleIds.add(roleId);

        serverconfig.serverroles[roleId] = {
            info: {
                ...existingRole?.info,
                id: roleId,
                name: role.name,
                icon: role.iconURL() ?? null,
                color: role.hexColor ?? role.color ?? "white",
                deletable: 0,
                sortId: role.position,
                displaySeperate: role.hoist ? 1 : 0,
                hasRole: 0,
                type: "discord_role",
                guildId: String(guild.id),
                discordManaged: role.managed ? 1 : 0
            },
            permissions: convertDiscordPermissions(
                role.permissions,
                roleId
            ),
            members: getDiscordRoleMembers(
                guild,
                roleId
            ),
            token: existingRole?.token ?? []
        };
    }

    for (const [roleId, role] of Object.entries(serverconfig.serverroles)) {
        if (role?.info?.type !== "discord_role") continue;
        if (String(role?.info?.guildId) !== String(guild.id)) continue;
        if (syncedRoleIds.has(String(roleId))) continue;

        delete serverconfig.serverroles[roleId];
    }

    await saveConfig(serverconfig);
}