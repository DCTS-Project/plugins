
import {
    fetchDiscordChannelMessages,
    sendDiscordMessage,
    syncDeletedDiscordMessages
} from "../../functions/discord/server-chat.mjs";
import {autoAnonymizeMessage, validateMemberId} from "../../../../modules/functions/main.mjs";
import {Clock} from "../../../../modules/functions/clock.mjs";
import {hasPermission, resolveChannelById} from "../../../../modules/functions/chat/main.mjs";
import {getSavedChatMessage} from "../../../../modules/functions/io.mjs";
import {sendDiscordEmbed} from "../../functions/discord/account.mjs";
import DCTS from "../../../../sdk/v1/backend/dcts_sdk.mjs";
import {serverconfig} from "../../../../modules/functions/init/config.mjs";
import {getFixedUrl} from "../../../../modules/functions/chat/helper.mjs";
import {getDefaultGroupIcon} from "../../../../modules/sockets/getServerInfo.mjs";


export let emitNewMessage = () => {
    throw new Error("Socket.IO is not initialized");
};

export let emitEditedMessage = () => {
    throw new Error("Socket.IO is not initialized");
};

export let emitDeletedMessage = () => {
    throw new Error("Socket.IO is not initialized");
};


export default (io, socket) => {

    emitNewMessage = async message => {
        const room = String(message.channel);
        io.emit("messageCreate", message);
    };

    emitEditedMessage = async message => {
        io.in(message.channel).emit("messageEdited", message);
    };

    emitDeletedMessage = async message => {
        const room = String(message.channel);
        io.emit("receiveDeleteMessage", message.messageId);
    };

    socket.on('getChatlog', async function (member, response) {
        if (await validateMemberId(member?.id, socket,  member?.token) === true) {

            if(!member?.channelId) return response({ error: "Missing channel id"})

            let channel = resolveChannelById(member?.channelId);
            if(channel.type !== "discord_text") return;

            let messages  = await getSavedChatMessage(member.channelId, member?.index);
            messages.filter(message => message?.type === "discord_message");
            await syncDeletedDiscordMessages(member.channelId, messages)
        }
    });

    socket.on('sendDiscordMessage', async (member, response) => {
        if (await validateMemberId(member?.id, socket, member?.token) === true) {

            if(!member?.message) return response({ error: "No message set" })

            await sendDiscordMessage(member?.message);

            // some cool code here ;)
            response({ error: null });
        }
    });

    socket.on('getChannelMessages', async (member, response) => {
        if (await validateMemberId(member?.id, socket, member?.token) === true) {

            if(!member?.channelId) return response({ error: "No channel id set" })

            let messageResult = await fetchDiscordChannelMessages(member.channelId, member?.messageId ?? null);
            if(messageResult !== null){
                return response({ error: null });
            }

            // some cool code here ;)
            response({ error: "Error fetching discord channel messages" });
        }
    })

    socket.on('linkDiscordAccount', async (member, response) => {
        if (await validateMemberId(member?.id, socket, member?.token) === true) {
            if(!member?.target) return response({ error: "No discord member id set" })
            let memberObj = (await DCTS.Members.load(member.id)).toJSON();

            let serverBanner = serverconfig.serverinfo.home.banner_url;
            let serverName = serverconfig.serverinfo.home.title;
            let serverIcon = getDefaultGroupIcon()

            let result = await sendDiscordEmbed("372043115152015362", {
                title: `${serverName}`,
                description: `
                __**Link your DCTS account**__\n
                ${memberObj.name} _(${memberObj.id})_ wants to link with your discord account.\n
                If this is not you ignore this message.`,
                color: 0xFFFFFF,
                image: `${getFixedUrl(serverBanner)}`,
                thumbnail: `${getFixedUrl(serverIcon)}`,
                buttons: [
                    {
                        text: "Link",
                        color: "Success",
                        callback: async (interaction) => {
                            await interaction.reply({
                                content: "Verified!",
                                ephemeral: true
                            });
                        }
                    },
                    {
                        text: "Cancel",
                        color: "Danger",
                        callback: async (interaction) => {
                            await interaction.reply({
                                content: "Cancelled.",
                                ephemeral: true
                            });
                        }
                    }
                ]
            });

            if(!result){
                response({ error: "Cant send embed! Are your DMs on?" });
            }

            // some cool code here ;)
            response({ error: "Error fetching discord channel messages" });
        }
    });
};