import {Client, GatewayIntentBits, Events, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} from "discord.js";
import {client} from "../plugin_onLoad.mjs";
import Logger from "../../../../modules/functions/logger.mjs";
import * as util from "node:util";

export async function sendDiscordEmbed(id, options = {}) {
    if (!client?.isReady()) return false;

    try {
        // find user or channel
        let target = await client.channels.fetch(id).catch(() => null);
        if (!target?.send) {
            target = await client.users.fetch(id).catch(() => null);
        }
        if (!target?.send) return false;

        let embeds = [];
        let embed = new EmbedBuilder();

        if (options?.title) embed.setTitle(options.title);
        if (options?.description) embed.setDescription(options.description);
        if (options?.color != null) embed.setColor(options.color);
        if (options?.image) embed.setImage(options.image);
        if (options?.thumbnail) embed.setThumbnail(options.thumbnail);

        embeds.push(embed);

        if (options?.banner) {
            embeds.push(new EmbedBuilder().setImage(options.banner));
        }

        let rows = [];
        let callbacks = new Map();

        if (options?.buttons?.length) {
            for (let i = 0; i < options.buttons.length; i += 5) {
                let row = new ActionRowBuilder();

                for (const button of options.buttons.slice(i, i + 5)) {
                    let customId = crypto.randomUUID();

                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(button.text)
                            .setStyle(ButtonStyle[button.color] ?? ButtonStyle.Secondary)
                    );

                    if (typeof button.callback === "function") {
                        callbacks.set(customId, button.callback);
                    }
                }

                rows.push(row);
            }
        }

        let message = await target.send({
            embeds,
            components: rows
        });

        if (callbacks.size) {
            let collector = message.createMessageComponentCollector({
                time: options.timeout ?? 300000
            });

            collector.on("collect", async interaction => {
                let callback = callbacks.get(interaction.customId);
                if (!callback) return;

                try {
                    await callback(interaction);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.deferUpdate();
                    }
                }
                catch (Err) {
                    Logger.error(`[discord-bridge] Button callback failed: ${Err}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: "An error occurred.",
                            ephemeral: true
                        }).catch(() => {});
                    }
                }
            });
        }

        return message;
    }
    catch (Err) {
        Logger.error(`[discord-bridge] Could not send embed: ${util.inspect(Err, {depth: 10, colors: false})}`);
        return false;
    }
}