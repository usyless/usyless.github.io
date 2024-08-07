(() => {
    let api_address = {
            value: null,
            default_value: 'http://localhost:11434',
            id: 'api_address'
        },
        context_length = {
            value: null,
            default_value: null,
            id: 'context_length',
        },
        system_prompt = {
            value: null,
            default_value: null,
            id: 'system_prompt',
        },
        temperature = {
            value: null,
            default_value: null,
            id: 'temperature',
        },
        enable_markdown = {
            value: null,
            default_value: true,
            id: 'enable_markdown',
        };

    for (let setting of [api_address, context_length, system_prompt, temperature, enable_markdown]) {
        const elem = document.getElementById(setting.id);
        setting.value = window.localStorage.getItem(setting.id) || setting.default_value;
        if (setting.value !== setting.default_value) elem.value = setting.value;

        if (elem.type === 'checkbox') {
            setting.value = setting.value !== 'false'
            elem.checked = setting.value;
            elem.addEventListener('change', (e) => {
                setting.value = e.target.checked;
                window.localStorage.setItem(setting.id, e.target.checked);
                const s = document.querySelector('.selected');
                if (s != null) document.querySelector('#settingsPage button').addEventListener('click', () => loadChat(s), { once: true });
            });
        } else {
            elem.addEventListener('input', (e) => {
                const newValue = e.target.value;
                if (newValue !== setting.default_value && newValue.length > 0) {
                    window.localStorage.setItem(setting.id, newValue);
                    setting.value = newValue;
                } else {
                    window.localStorage.removeItem(setting.id);
                    setting.value = setting.default_value;
                }
            });
        }
    }

    const modelSelect = document.getElementById('modelSelect');
    const input = document.getElementById('input');
    const sendButton = document.getElementById('sendChatButton');
    const newChatButton = document.getElementById('newChatButton');
    const chatHistory = document.getElementById('chatHistory').firstElementChild;
    const chatWith = document.getElementById('chatWith').querySelector('b');

    const chat = document.getElementById('chat');
    let currentContext = [];
    let currentModel = null;

    let responding = false;

    let db;

    input.setValue = (t) => {
        input.value = t;
        input.dispatchEvent(new Event('input'));
    }

    chat.clear = () => {
        chat.innerHTML = '';
        chat.removeAttribute('data-id');
    }

    {
        let init = Promise.resolve(true);
        if (!window.localStorage.getItem('firstEntry')) {
            init = Popups.createPopup(`Welcome!\nMake sure to add the following to your environment variables:\n\nOLLAMA_ORIGINS=${window.location.origin}\n\nThen refresh this site and/or relaunch ollama!\n\nIf you have ollama hosted elsewhere to the default, check out Settings!\n(also check them out if you want to change context length, temperature, system prompt or enabling response markdown)`);
            window.localStorage.setItem('firstEntry', 'h');
        }
        init.then(() => {
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
            else start();
        });
    }

    function getMissingOllamaPopup() {
        return Popups.createPopup(`Unable to find models.\nAre you sure ollama is running and allowed for this domain?\nMake sure to add the following to your environment variables:\n\nOLLAMA_ORIGINS=${window.location.origin}\n\nIf you have ollama hosted elsewhere than the default, go to the Settings.\n\nPress "Ok" To try to load again, or press "Cancel" to not see this popup again`, true);
    }

    function start() {
        const dbOpen = window.indexedDB.open("chat_history", 2);
        dbOpen.addEventListener("error", () => console.error("Database failed to open"));
        dbOpen.addEventListener("success", () => {
            db = dbOpen.result;
            displayChatHistory();
        });
        dbOpen.addEventListener("upgradeneeded", (e) => {
            db = e.target.result;

            if (e.oldVersion <= 0) {
                const chatHistoryStore = db.createObjectStore("chat_history", {
                    keyPath: "id",
                    autoIncrement: true,
                });

                chatHistoryStore.createIndex('name', 'name', { unique: false });
                chatHistoryStore.createIndex('context', 'context', { unique: false });
                chatHistoryStore.createIndex('messages', 'messages', { unique: false });
                console.log('Successfully created version 1 of the database: name, context, messages');
            }
            if (e.oldVersion <= 1) {
                const transaction = e.target.transaction;
                const objectStore = transaction.objectStore('chat_history');
                objectStore.createIndex('model', 'model', { unique: false });
                transaction.addEventListener('complete', ()=> {
                    console.log("Successfully created version 2 of the database: name, context, messages, model");
                });
            }
        });

        input.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
        });
        let holding_shift = false;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') holding_shift = true;
            else if (e.key === 'Enter' && !holding_shift) {
                e.preventDefault();
                sendButton.click();
            }
        });
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') holding_shift = false
        });
        input.addEventListener('focusout', () => holding_shift = false);
        document.addEventListener('visibilitychange', () => holding_shift = false);
        sendButton.addEventListener('click', () => {
            if (!responding && input.value.length > 0) {
                createChatBubble(true);
                saveChat();
                postMessage();
            }
        });
        newChatButton.addEventListener('click', () => {
            if (responding) sendButton.click();
            chatHistory.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
            currentContext = [];
            currentModel = null;
            chatWith.textContent = modelSelect.value;
            responding = false;
            chat.clear();
            input.setValue('');
            sendButton.textContent = 'Send';
            input.focus();
        });
        document.getElementById('deleteChat').addEventListener('click', () => {
            const id = chat.getAttribute('data-id');
            if (id != null) {
                const transaction = db.transaction(['chat_history'], "readwrite");
                transaction.objectStore('chat_history').delete(Number(id));
                transaction.addEventListener('complete', () => {
                    document.querySelector(`button[data-id="${id}"]`).remove();
                    if (!chatHistory.firstElementChild) chatHistory.textContent = 'No chat history';
                });
                newChatButton.click();
            } else Popups.createPopup("No chat to delete!");
        });
        document.getElementById('settings').addEventListener('click', () => {
            document.getElementById('settingsPage').removeAttribute('style');
            document.getElementById('main').style.display = 'none';
        });
        document.querySelector('#settingsPage button').addEventListener('click', () => {
            document.getElementById('main').removeAttribute('style');
            document.getElementById('settingsPage').style.display = 'none';
        });

        loadModels();
    }

    function loadModels() {
        getModels().then((models) => {
            for (const model of models) {
                const option = document.createElement('option');
                option.value = model['name'];
                option.textContent = model['name'];
                modelSelect.appendChild(option);

                const previous_model = window.localStorage.getItem('model');
                if (previous_model != null && model.name === previous_model) modelSelect.value = previous_model;
            }
            modelSelect.addEventListener('change', () => {
                window.localStorage.setItem('model', modelSelect.value);
                if (currentModel == null) chatWith.textContent = modelSelect.value;
            });
            modelSelect.dispatchEvent(new Event('change'));
        }).catch(async () => {
            if (await getMissingOllamaPopup()) {
                loadModels();
            }
        });
    }

    function saveChat() {
        const messages = chat.children;
        if (messages.length > 0) {
            const chatInfo = {
                title: messages[0].textContent,
                context: currentContext,
                messages: Array.from(chat.children).map((el) => el.firstElementChild.getUnformattedText())
            }
            let id = chat.getAttribute('data-id');
            const transaction = db.transaction(['chat_history'], "readwrite");
            const objectStore = transaction.objectStore('chat_history');
            if (id) {
                id = Number(id);
                objectStore.get(id).addEventListener('success', (e) => {
                    const result = e.target.result;
                    result.context = currentContext;
                    result.messages = chatInfo.messages;
                    objectStore.put(result);
                });
            } else {
                chatInfo.model = modelSelect.value;
                currentModel = modelSelect.value;
                objectStore.add(chatInfo);
            }
            transaction.addEventListener('complete', () => {
                if (!id) displayChatHistory(id);
            });
            transaction.addEventListener('error', () => Popups.createPopup("Unable to save chat"));
        }
    }

    function createChatBubble(user, no_default_text) {
        const segment = document.createElement('div');
        const bubble = document.createElement('div');
        bubble.classList.add('chatBubble');
        segment.classList.add('chatSegment');
        segment.appendChild(bubble);
        chat.appendChild(segment);
        bubble.setUnformattedText = (t) => bubble.setAttribute('original', t);
        bubble.setVisibleText = (t) => {
            bubble.textContent = t;
            bubble.setUnformattedText(t);
        }
        bubble.getUnformattedText = () => bubble.getAttribute('original');
        bubble.format = (t) => {
            if (t == null) t = bubble.getUnformattedText();
            else bubble.setUnformattedText(t);
            bubble.innerHTML = '';
            if (enable_markdown.value) bubble.append(...TextFormatter.getFormatted(t));
            else bubble.textContent = t;
            segment.scrollIntoView({behavior: 'smooth', block: 'end'});
        }
        if (user) {
            bubble.classList.add('userBubble');
            if (!no_default_text) bubble.setVisibleText(input.value);
        } else {
            bubble.classList.add('responseBubble');
            if (!no_default_text) bubble.setVisibleText('Generating response...');
        }
        segment.scrollIntoView({behavior: 'smooth', block: 'end'});
        return bubble;
    }

    function loadChat(button) {
        newChatButton.click();
        const id = Number(button.getAttribute('data-id'));
        chat.setAttribute('data-id', id.toString());
        button.classList.add('selected');
        const objectStore = db.transaction(['chat_history'], "readonly").objectStore('chat_history');
        objectStore.get(id).addEventListener('success', (e) => {
            const result = e.target.result;
            currentContext = result.context;
            currentModel = result.model || modelSelect.value; // to ensure compatibility with old chats, falls back tog modelSelect value
            chatWith.textContent = currentModel;
            let i = 0;
            for (const message of result.messages) {
                if (i % 2 === 0) {
                    const bubble = createChatBubble(true);
                    bubble.setVisibleText(message);
                } else {
                    const bubble = createChatBubble(false, true);
                    bubble.format(message);
                }
                ++i;
            }
            chat.lastElementChild.scrollIntoView({behavior: 'instant', block: 'end'});
        });
    }

    function displayChatHistory(reselect_id) {
        const transaction = db.transaction('chat_history');
        transaction.objectStore('chat_history').openCursor().addEventListener('success', (e) => {
            const cursor = e.target.result;
            if (chatHistory.firstChild.nodeName === '#text') chatHistory.firstChild.remove();
            if (cursor) {
                let button = document.querySelector(`button[data-id="${cursor.value.id}"]`);
                if (button == null) button = createChatHistoryEntry(cursor.value.title, cursor.value.id);
                if (cursor.value.id === reselect_id) button.classList.add('selected');
                cursor.continue();
            } else {
                if (!chatHistory.firstElementChild) chatHistory.textContent = 'No chat history';
            }
        });
        transaction.addEventListener('complete', () => {
            if (!reselect_id && chat.children.length > 0) {
                chatHistory.lastElementChild.classList.add('selected');
                chat.setAttribute('data-id', chatHistory.lastElementChild.getAttribute('data-id'));
            }
        });
    }

    function createChatHistoryEntry(title, id) {
        const button = document.createElement('button');
        button.textContent = title;
        button.classList.add('standardButton');
        button.setAttribute('data-id', id);
        button.addEventListener('click', () => loadChat(button));
        chatHistory.appendChild(button);
        return button
    }

    async function getModels() {
        return (await (await fetch(`${api_address.value}/api/tags`)).json())['models'];
    }

    async function postMessage() {
        const prompt = input.value;
        if (prompt.length > 0) {
            const output = createChatBubble(false);
            input.setValue('');
            input.disabled = true;
            sendButton.textContent = 'Stop Responding';
            const controller = new AbortController();
            const cancelButtonCallback = (e) => {
                e.preventDefault();
                controller.abort();
            }

            try {
                responding = true;
                sendButton.addEventListener('click', cancelButtonCallback, {once: true});

                const body = {
                    prompt: prompt,
                    context: currentContext,
                    options: {}
                }
                body.model = currentModel || modelSelect.value;
                if (context_length.value != null) body.options.num_ctx = parseInt(context_length.value);
                if (temperature.value != null) body.options.temperature = parseInt(temperature.value);
                if (system_prompt.value != null) body.system = system_prompt.value;

                const response = await fetch(`${api_address.value}/api/generate`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let chunk;
                output.setVisibleText('');
                while (true) {
                    const {value, done} = await reader.read();
                    if (done) break;
                    chunk = decoder.decode(value, {stream: true}).split('\n');
                    for (let line of chunk) {
                        line = line.trim();
                        if (line.length > 0) {
                            line = JSON.parse(line);
                            output.format(output.getUnformattedText() + line.response);
                            if (line.context != null) currentContext = line.context;
                        }
                    }
                }
            } catch (e) {
                if (e.message.includes('NetworkError') && await getMissingOllamaPopup()) loadModels();
                else loadModels();
            } finally {
                input.disabled = false;
                sendButton.textContent = 'Send';
                sendButton.removeEventListener('click', cancelButtonCallback);
                responding = false;
                saveChat();
                input.focus();
            }
        }
    }
})();