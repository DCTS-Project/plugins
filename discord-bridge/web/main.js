injectCss("/plugins/discord-bridge/messages.css")

// on message SEND event
EventDispatcher.on("messageSend", async(payload) => {
    let {message, channelType} = payload;

    if(channelType === "discord_text"){
        let sendingResult = await sendDiscordMessage(message)
    }
})

EventDispatcher.on("getChatLog", async(data) => {
    let {container, index, appendTop, channelId, channelType} = data;

    let firstElement = getFirstMessage(getContentMainContainer())?.element;
    let messageId = firstElement?.getAttribute("data-message-id")

    if(channelType === "discord_text"){
        if(!appendTop) messageId = null;
        let dataResult = await fetchDiscordChannelMessages(channelId, messageId)
        if(!dataResult?.error){
            if(!appendTop){
                await getChatlog(container, null, null, true);
            }
            else{
                await getChatlog(container, index, appendTop, true);
            }
        }
    }
})

EventDispatcher.on("getChatLog_finish", async(data) => {
    let {container, index, appendTop, channelId, channelType} = data;

    if(channelType === "discord_text"){
        checkMessageContainerBadges()
    }
})


EventDispatcher.on("getChannelTree_finish", async(data) => {
    checkChannelTreeIcons();
})

EventDispatcher.on("messageCreate", async(message) => {
    let channelType = await getCurrentChannelType();

    if(channelType === "discord_text"){
        checkMessageContainerBadges()
    }
})

function checkChannelTreeIcons(){
    let channelIcons = [
        ...document.querySelectorAll("#channeltree .channellist-icon.discord_text"),
        ...document.querySelectorAll("#channeltree .channellist-icon.discord_voice")
    ]

    if(channelIcons.length === 0) return;

    channelIcons.forEach(icon => {
        let channelType = icon.closest("li")?.getAttribute("data-channel-type");

        if(channelType === "discord_text"){
            icon.src = `${emojiCodeToImg("⌨", null, true)}`;
        }
        else if(channelType === "discord_voice"){
            icon.src = `${emojiCodeToImg("🎙", null, true)}`;
        }
    })
}
function checkMessageContainerBadges(){
    let messages = getContentMainContainer().querySelectorAll(".message-container");
    if(messages.length === 0) return;

    messages.forEach(message => {
        let messageBadge = message.querySelector(".badge-discord_message");
        if(messageBadge && messageBadge?.textContent?.length === 0) messageBadge.textContent = "Discord";
    })
}

async function fetchDiscordChannelMessages(channelId, messageId = null){
    if(!channelId) throw new Error("No channel id found")

    return new Promise(resolve => {
        socket.emit("getChannelMessages", {id: UserManager.getID(), token: UserManager.getToken(), channelId, messageId }, function (response) {
            resolve(response);
        })
    })
}

async function sendDiscordMessage(message){
    if(!message) throw new Error("No message found")
    if(!message?.message) throw new Error("No message content found")
    if(!message?.room) throw new Error("No message room found")

    message.message = htmlToDiscordText(message.message)

    return new Promise(resolve => {
        socket.emit("sendDiscordMessage", {id: UserManager.getID(), token: UserManager.getToken(), message }, function (response) {
            resolve(response);
        })
    })
}

function htmlToDiscordText(html = "") {
    const documentObject = new DOMParser().parseFromString(html, "text/html");

    documentObject.querySelectorAll("a").forEach(link => {
        const text = link.textContent.trim();
        const url = link.getAttribute("href");

        link.replaceWith(
            url && text !== url
                ? `${text} (${url})`
                : url ?? text
        );
    });

    documentObject.querySelectorAll("br").forEach(element => {
        element.replaceWith("\n");
    });

    documentObject.querySelectorAll("p, div").forEach(element => {
        element.append("\n");
    });

    documentObject.querySelectorAll("strong, b").forEach(element => {
        element.replaceWith(`**${element.textContent}**`);
    });

    documentObject.querySelectorAll("em, i").forEach(element => {
        element.replaceWith(`*${element.textContent}*`);
    });

    documentObject.querySelectorAll("u").forEach(element => {
        element.replaceWith(`__${element.textContent}__`);
    });

    documentObject.querySelectorAll("s, strike").forEach(element => {
        element.replaceWith(`~~${element.textContent}~~`);
    });

    return documentObject.body.textContent
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}