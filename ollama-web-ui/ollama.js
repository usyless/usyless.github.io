let api_address = window.localStorage.getItem('api_address');
if (!api_address) {
    api_address = 'http://localhost:11434';
}

const modelSelect = document.getElementById('modelSelect');
const input = document.querySelector('textarea');
const sendButton = document.getElementById('sendChatButton');
const newChatButton = document.getElementById('newChatButton');
const chatHistory = document.getElementById('chatHistory');

const chat = document.getElementById('chat');
let currentContext = [];

let responding = false;

let db;

if (!window.localStorage.getItem('firstEntry')) {
    alert(`Welcome!
Make sure to add OLLAMA_HOST=${window.location.hostname} to your environment variables and relaunch ollama for this website to work!`);
    window.localStorage.setItem('firstEntry', 'h');
}

document.addEventListener('DOMContentLoaded', () => {
    const dbOpen = window.indexedDB.open("chat_history", 1);
    dbOpen.addEventListener("error", () => console.error("Database failed to open"));
    dbOpen.addEventListener("success", () => {
        db = dbOpen.result;
        displayChatHistory();
    });
    dbOpen.addEventListener("upgradeneeded", (e) => {
        db = e.target.result;

        const chatHistoryStore = db.createObjectStore("chat_history", {
            keyPath: "id",
            autoIncrement: true,
        });

        chatHistoryStore.createIndex('name', 'name', { unique: false });
        chatHistoryStore.createIndex('context', 'context', { unique: false });
        chatHistoryStore.createIndex('messages', 'messages', { unique: false });
    });


    input.addEventListener('input', (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendButton.click();
        }
    });
    sendButton.addEventListener('click', () => {
        if (!responding) {
            createChatBubble(true);
            saveChat();
            postMessage();
        }
    });
    newChatButton.addEventListener('click', () => {
        if (responding) sendButton.click();
        chatHistory.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
        currentContext = [];
        chat.removeAttribute('data-id');
        responding = false;
        chat.innerHTML = '';
        input.value = '';
        sendButton.textContent = 'Send';
        input.focus();
    });
    document.getElementById('deleteChat').addEventListener('click', (e) => {
        const id = chat.getAttribute('data-id');
        if (id != null) {
            const transaction = db.transaction(['chat_history'], "readwrite");
            transaction.objectStore('chat_history').delete(Number(id));
            transaction.addEventListener('complete', () => {
                document.querySelector(`button[data-id="${id}"]`).remove();
                if (!chatHistory.firstElementChild) chatHistory.textContent = 'No chat history';
            });
            newChatButton.click();
        } else alert("No chat to delete!");
    });
    document.getElementById('settings').addEventListener('click', () => {
        document.getElementById('settingsPage').classList.remove('hidden');
        document.getElementById('main').classList.add('hidden');
    });
    document.querySelector('#settingsPage button').addEventListener('click', (e) => {
        document.getElementById('main').classList.remove('hidden');
        document.getElementById('settingsPage').classList.add('hidden');
    });
    document.getElementById('hostName').addEventListener('input', (e) => {
        api_address = e.target.value;
        window.localStorage.setItem('api_address', api_address);
    });
    document.getElementById('hostName').value = api_address;

    loadModels();
});

function loadModels(models) {
    getModels().then((models) => {
        for (const model of models) {
            const option = document.createElement('option');
            option.value = model['name'];
            option.textContent = model['name'];
            modelSelect.appendChild(option);

            const previous_model = window.localStorage.getItem('model');
            if (previous_model != null && models.map((m) => m.name).includes(previous_model)) modelSelect.value = previous_model;

            modelSelect.addEventListener('change', () => {
                window.localStorage.setItem('model', modelSelect.value);
            });
        }
    }).catch(() => {
        if (confirm(`Unable to find models, are you sure ollama is running and allowed for this domain? (add OLLAMA_HOST=${window.location.hostname} to your environment variables and relaunch ollama, then press OK)`)) {
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
            messages: Array.from(chat.children).map((el) => el.textContent)
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
        } else objectStore.add(chatInfo);
        transaction.addEventListener('complete', () => {
            if (!id) displayChatHistory(id);
        });
        transaction.addEventListener('error', () => alert("Unable to save chat"));
    } else alert("No chat to save!");
}

function createChatBubble(user) {
    const segment = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.classList.add('chatBubble', 'userBubble');
    if (user) {
        bubble.classList.add('userBubble');
        bubble.textContent = input.value;
    }
    else {
        bubble.classList.add('responseBubble');
        bubble.textContent = 'Generating response...';
    }
    segment.classList.add('chatSegment');
    segment.appendChild(bubble);
    chat.appendChild(segment);
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
        let i = 0;
        for (const message of result.messages) {
            const bubble = i % 2 === 0 ? createChatBubble(true) : createChatBubble(false);
            bubble.textContent = message;
            ++i;
        }
    });
}

function displayChatHistory(reselect_id) {
    chatHistory.innerHTML = '';
    const transaction = db.transaction('chat_history');
    transaction.objectStore('chat_history').openCursor().addEventListener('success', (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const button = createChatHistoryEntry(cursor.value.title, cursor.value.id);
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
    button.setAttribute('data-id', id);
    button.addEventListener('click', () => loadChat(button));
    chatHistory.appendChild(button);
    return button
}

async function getModels() {
    return (await (await fetch(`${api_address}/api/tags`)).json())['models'];
}

async function postMessage() {
    const prompt = input.value;
    if (prompt.length > 0) {
        const output = createChatBubble(false);
        input.value = '';
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

            const response = await fetch(`${api_address}/api/generate`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelSelect.value,
                    prompt: prompt,
                    context: currentContext
                    // TODO: add options, such as context size, default prompt
                }),
                signal: controller.signal
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            output.textContent = '';
            let chunk;

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                chunk = JSON.parse(decoder.decode(value, {stream: true}));
                output.textContent += chunk.response;
                output.scrollIntoView({behavior: 'smooth', block: 'end'});
            }
            if (chunk.context != null) currentContext = chunk.context;
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