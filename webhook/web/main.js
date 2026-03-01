if (!window.webhookPluginLoaded) {
    window.webhookPluginLoaded = true;

    document.addEventListener("pagechange", (e) => {
        if (e.detail.page === "channel-info") {
            setTimeout(injectWebhookUI, 100);
        }
    });

    if (window.location.href.includes("page=channel-info")) {
        setTimeout(injectWebhookUI, 500);
    }

    function injectWebhookUI() {
        let channelSettings = document.getElementById("channel_settings");
        if (!channelSettings) return;

        if (document.getElementById("channel_webhooks")) return;

        let webhookHtml = `
            <br>
            <h3>Webhooks</h3>
            <div id="channel_webhooks"></div>
            <button id="createWebhookBtn" onclick="window.webhookPlugin.createWebhook()" style="padding: 8px; margin-top: 10px; background: hsl(from var(--main) h s calc(l * 6)); border: none; border-radius: 4px; color: white; cursor: pointer;">Create Webhook</button>
            <br><br>
        `;
        channelSettings.insertAdjacentHTML("afterend", webhookHtml);

        window.webhookPlugin.loadWebhooks();
    }

    window.webhookPlugin = {
        loadWebhooks: function () {
            let channelId = new URLSearchParams(window.location.search).get("id");
            if (!channelId) return;

            socket.emit("getWebhooks", { id: UserManager.getID(), token: UserManager.getToken(), channelId: channelId }, (response) => {
                if (response.type === "success") {
                    let container = document.getElementById("channel_webhooks");
                    if (!container) return;
                    container.innerHTML = "";
                    for (let wh of response.data) {
                        container.innerHTML += `
                            <div style="background: hsl(from var(--main) h s calc(l * 3)); padding: 10px; margin-top: 5px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${wh.name}</strong><br>
                                    <span style="font-size: 11px; color: gray; user-select: all;">${window.location.origin}/api/webhooks/${wh.token}</span>
                                </div>
                                <button onclick="window.webhookPlugin.deleteWebhook('${wh.id}')" style="background: indianred; border: none; padding: 5px 10px; border-radius: 4px; color: white; cursor: pointer;">Delete</button>
                            </div>
                        `;
                    }
                }
            });
        },
        createWebhook: function () {
            let name = prompt("Webhook Name:");
            if (!name) return;

            let channelId = new URLSearchParams(window.location.search).get("id");
            if (!channelId) return;

            getChannelTree().then(channels => {
                let channelConfigPath = getChannelPathFromGroupConfig(channels, channelId);
                if (!channelConfigPath) return alert("Channel not found in config");
                socket.emit("createWebhook", {
                    id: UserManager.getID(),
                    token: UserManager.getToken(),
                    group: channelConfigPath.groupId,
                    category: channelConfigPath.categoryId,
                    channelId: channelId,
                    name: name
                }, (response) => {
                    if (response.type === "success") {
                        window.webhookPlugin.loadWebhooks();
                    } else {
                        alert(response.error);
                    }
                });
            });
        },
        deleteWebhook: function (whId) {
            if (!confirm("Delete webhook?")) return;
            let channelId = new URLSearchParams(window.location.search).get("id");

            socket.emit("deleteWebhook", { id: UserManager.getID(), token: UserManager.getToken(), webhookId: whId, channelId: channelId }, (res) => {
                if (res.type === "success") window.webhookPlugin.loadWebhooks();
            });
        }
    };
}
