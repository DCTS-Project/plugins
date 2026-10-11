import {Events, EmbedBuilder} from "discord.js";
import {saveChatMessage} from "../../../../modules/functions/io.mjs";
import {client, UNCATEGORIZED_ID} from "../plugin_onLoad.mjs";
import {deleteChatMessagesFromDb} from "../../../../modules/functions/mysql/helper.mjs";
import Logger from "../../../../modules/functions/logger.mjs";
import {serverconfig} from "../../../../index.mjs";
import {createMember} from "../../../../modules/functions/member.mjs";
import {resolveCategoryByChannelId, resolveGroupByChannelId} from "../../../../modules/functions/chat/main.mjs";
import {generateId, getCastingMemberObject} from "../../../../modules/functions/main.mjs";
import {emitDeletedMessage, emitEditedMessage, emitNewMessage} from "../../sockets/dcts/sendMessage.mjs";

export function initDiscordMessageSync() {
    if (!client) {
        throw new Error("Discord client is not initialized");
    }

    client.on(Events.MessageCreate, async discordMessage => {
        try {
            if (!discordMessage.inGuild()) return;
            if (discordMessage.author?.bot) return;

            let dctsMessage = await saveDiscordMessage(discordMessage);
            await emitNewMessage(dctsMessage)
        } catch (error) {
            Logger.error(error);
        }
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        try {
            if (newMessage.partial) {
                newMessage = await newMessage.fetch();
            }

            if (!newMessage.inGuild()) return;
            if (newMessage.author?.bot) return;

            let dctsMessage = await saveDiscordMessage(newMessage, newMessage.id);
            await emitEditedMessage(dctsMessage);
        } catch (error) {
            Logger.error(error);
        }
    });

    client.on(Events.MessageDelete, async discordMessage => {
        try {
            if (!discordMessage.id) return;

            await deleteChatMessagesFromDb(discordMessage.id);
            await emitDeletedMessage({
                messageId: discordMessage.id,
                channel: discordMessage.channel.id
            })
        } catch (error) {
            Logger.error(error);
        }
    });

    client.on(Events.MessageBulkDelete, async discordMessages => {
        try {
            for (const discordMessage of discordMessages.values()) {
                if (!discordMessage.id) continue;

                await deleteChatMessagesFromDb(discordMessage.id);
                await emitDeletedMessage({
                    messageId: discordMessage.id,
                    channel: discordMessage.channel.id
                })
            }
        } catch (error) {
            Logger.error(error);
        }
    });
}

function appendDiscordEmbedLinks(discordMessage, content = "") {
    const links = new Set();

    for (const embed of discordMessage.embeds ?? []) {
        if (embed.url) links.add(embed.url);
        if (embed.image?.url) links.add(embed.image.url);
        if (embed.thumbnail?.url) links.add(embed.thumbnail.url);
        if (embed.video?.url) links.add(embed.video.url);
    }

    if (links.size === 0) return content;

    return [
        content,
        ...links
    ].filter(Boolean).join("\n");
}

function appendDiscordMediaLinks(discordMessage, content = "") {
    const links = new Set();

    for (const attachment of discordMessage.attachments?.values() ?? []) {
        if (attachment.url) {
            links.add(attachment.url);
        }
    }

    for (const embed of discordMessage.embeds ?? []) {
        if (embed.image?.url) links.add(embed.image.url);
        if (embed.thumbnail?.url) links.add(embed.thumbnail.url);
        if (embed.video?.url) links.add(embed.video.url);
        if (embed.url) links.add(embed.url);
    }

    for (const link of [...links]) {
        if (content.includes(link)) {
            links.delete(link);
        }
    }

    return [
        content,
        ...links
    ].filter(Boolean).join("\n");
}


export async function syncDeletedDiscordMessages(channelId, messages) {
    Logger.info("Synching deleted discord messages...")
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased()) return;

    for (const message of messages) {
        const messageId = message?.messageId ?? message?.message?.messageId;

        if (!messageId) continue;

        try {
            await channel.messages.fetch(messageId);
        } catch (error) {
            if (error.code !== 10008) {
                Logger.error(error);
                continue;
            }

            Logger.warn(`Deleted discord message from DCTS ${messageId}`)
            await deleteChatMessagesFromDb(messageId);

            await emitDeletedMessage({
                messageId,
                channel: channelId
            });
        }
    }
}

export async function fetchDiscordChannelMessages(channelId, messageId = 0, limit = 50) {
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased?.()) {
        throw new Error("Discord channel is not text based");
    }

    const options = {
        limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
        cache: false
    };

    if (messageId) {
        options.before = String(messageId);
    }

    const fetchedMessages = await channel.messages.fetch(options);

    const messages = [...fetchedMessages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    for (const discordMessage of messages) {
        if (!discordMessage.inGuild()) continue;
        if (!discordMessage.author?.id) continue;
        if (discordMessage.author.bot && !discordMessage.webhookId) continue;

        try {
            await saveDiscordMessage(discordMessage);
        } catch (error) {
            Logger.error(
                `Could not save Discord message ${discordMessage.id}: ${error.message}`
            );
        }
    }

    return messages[0]?.id ?? null;
}

async function saveDiscordMessage(discordMessage, editedMessageId = null) {
    const authorId = discordMessage.author?.id;

    if (!authorId) {
        throw new Error(`Discord message ${discordMessage.id} has no author id`);
    }

    await ensureDiscordMember(discordMessage);

    const dctsMessage = createDCTSMessage(discordMessage);

    if (!dctsMessage.author?.id) {
        throw new Error(`DCTS message ${discordMessage.id} has no author id`);
    }

    await saveChatMessage(dctsMessage, editedMessageId);

    return dctsMessage;
}

function discordTextToHTML(text = "") {
    return text;
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function createDCTSMessage(discordMessage) {
    const message = {
        messageId: discordMessage.id,
        group: discordMessage.guildId,
        category: discordMessage.channel?.parentId ?? UNCATEGORIZED_ID,
        channel: discordMessage.channelId,
        room: discordMessage.channelId,
        message: discordTextToHTML(discordMessage.content) ?? "",
        type: "discord_message",
        timestamp: discordMessage.createdTimestamp,
        createdAt: discordMessage.createdTimestamp,
        editedAt: discordMessage.editedTimestamp ?? null,
        author: {
            id: discordMessage.author?.id ?? null,
            username:
                discordMessage.member?.displayName ??
                discordMessage.author?.globalName ??
                discordMessage.author?.username ??
                "Unknown",
            avatar: discordMessage.author?.displayAvatarURL?.({
                size: 256
            }) ?? null
        }
    };

    // some embed shit
    message.message = appendDiscordEmbedLinks(
        discordMessage,
        discordMessage.content ?? ""
    );

    // and some media shit for uploads etc
    message.message = appendDiscordMediaLinks(
        discordMessage,
        discordMessage.content ?? ""
    );

    if (discordMessage.reference?.messageId) {
        message.reply = {
            messageId: discordMessage.reference.messageId
        };
    }

    if (discordMessage.attachments?.size > 0) {
        message.attachments = [...discordMessage.attachments.values()].map(attachment => ({
            id: attachment.id,
            name: attachment.name ?? null,
            url: attachment.url ?? null,
            contentType: attachment.contentType ?? null,
            size: attachment.size ?? 0
        }));
    }

    return message;
}

export async function ensureDiscordMember(discordMessage) {
    const memberId = discordMessage.author?.id;

    if (!memberId) {
        throw new Error(`Discord message ${discordMessage.id} has no member id`);
    }

    if (serverconfig.servermembers[memberId]) return;

    await createMember({
        id: memberId,
        token: `discord_${memberId}`,
        password: `discord_${memberId}`,
        loginName: `discord_${memberId}`,
        name:
            discordMessage.member?.displayName ??
            discordMessage.author?.globalName ??
            discordMessage.author?.username ??
            "Unknown",
        icon: discordMessage.author?.displayAvatarURL?.({
            size: 256
        }) ?? null,
        banner: discordMessage.author?.bannerURL?.({
            size: 1024
        }) ?? null,
        joined: discordMessage.member?.joinedTimestamp ?? Date.now(),
        lastOnline: Date.now(),
        onboarding: 1,
        type: "discord_user"
    });
}

export async function sendDiscordMessage(message) {
    const authorId = message.author?.id;

    if (!authorId) throw new Error("DCTS message author id is missing");

    const channel = await client.channels.fetch(message.room);
    if (!channel?.isTextBased()) {
        throw new Error("Discord channel is not text based");
    }

    const member = await getCastingMemberObject(serverconfig.servermembers[authorId]);
    if (!member) {
        throw new Error(`Could not resolve DCTS member ${authorId}`);
    }

    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(webhook =>
        webhook.name === "DCTS Bridge" &&
        webhook.owner?.id === client.user.id
    );

    if (!webhook) {
        webhook = await channel.createWebhook({
            name: "DCTS Bridge"
        });
    }

    const options = {
        content: message.message ?? "",
        username: member.name ?? "Unknown",
        avatarURL: member.icon ?? undefined,
        allowedMentions: {
            parse: []
        }
    };

    if (message.editedMsgId) {
        const originalMessage = await webhook.fetchMessage(message.editedMsgId);

        const editedDiscordMessage = await webhook.editMessage(
            message.editedMsgId,
            options
        );

        await saveChatMessage({
            ...message,
            messageId: message.editedMsgId,
            group: message.group ?? resolveGroupByChannelId(message.room),
            category: message.category ?? resolveCategoryByChannelId(message.room),
            channel: message.channel ?? message.room,
            room: message.room,
            timestamp: originalMessage.createdTimestamp,
            createdAt: originalMessage.createdTimestamp,
            editedAt: editedDiscordMessage.editedTimestamp ?? null,
            type: "discord_message",
            author: {
                id: authorId
            }
        }, message.editedMsgId);

        return editedDiscordMessage;
    }

    const discordMessage = await webhook.send(options);
    const createdAt = discordMessage.createdTimestamp ?? Date.now();

    const dctsMessage = {
        ...message,
        messageId: discordMessage.id,
        group: message.group ?? resolveGroupByChannelId(message.room),
        category: message.category ?? resolveCategoryByChannelId(message.room),
        channel: message.channel ?? message.room,
        room: message.room,
        timestamp: createdAt,
        createdAt,
        editedAt: null,
        type: "discord_message",
        author: {
            id: authorId
        }
    };

    await saveChatMessage(dctsMessage);
    await emitNewMessage(dctsMessage);

    return discordMessage;
}