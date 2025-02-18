'use strict';

import { createPopup, clearPopups} from "./popups.js";

// Defaults
const defaults = {
    "FRHigher": 20000,
    "FRLower": 20,

    "colourTolerance": 67,

    "PPO": 48,
    "delimitation": "tab",
    "lowFRExport": 20,
    "highFRExport": 20000,

    "SPLHigher": "",
    "SPLLower": "",
}
const MAGNIFICATION = 3;
document.getElementById('restoreDefault').addEventListener('click', () => {
    resetToDefault();
    createPopup("Restored settings to default");
});
function resetToDefault() {
    for (const val in defaults) document.getElementById(val).value = defaults[val];
}

// Global Variables
let sizeRatio, width, height, lineWidth, CURRENT_MODE = null, MODE_RESET_CB = null;

const glass = document.getElementById('glass');
glass.img = glass.querySelector('img');
glass.setColour = (colour) => {
    glass.style.borderColor = `rgb(${colour})`;
}
glass.updateImage = () => {
    if (image.isValid()) {
        glass.img.src = image.src;
        glass.img.width = image.clientWidth * MAGNIFICATION;
        glass.img.height = image.clientHeight * MAGNIFICATION;
    }
}

const waitingOverlay = {
    createOverlay: () => document.querySelector('.waiting-overlay[data-for="trace"]').classList.add('enabled'),
    removeOverlays: () => document.querySelector('.waiting-overlay[data-for="trace"]').classList.remove('enabled')
}

const lines = {
    parent: document.getElementById('lines'),
    lines: {
        xHigh: document.getElementById('xHigh'),
        xLow: document.getElementById('xLow'),
        yHigh: document.getElementById('yHigh'),
        yLow: document.getElementById('yLow'),
    },
    updateLinePosition: (line, position) => {
        const attr = line.dataset.direction;
        line.nextElementSibling.setAttribute(attr, position);
        line.setAttribute(`${attr}1`, position);
        line.setAttribute(`${attr}2`, position);
    },
    updateLineWidth: () => {
        for (const line of lines.parent.querySelectorAll('line')) line.setAttribute('stroke-width', sizeRatio);
        for (const text of lines.parent.querySelectorAll('text')) text.setAttribute('font-size', `${1.3 * sizeRatio}em`);
    },
    getPosition: (line) => parseFloat(line.getAttribute(`${line.dataset.direction}1`)),
    setPosition: (line, position) => {
        const ls = lines.lines, otherLinePos = lines.getPosition(ls[line.dataset.other]), sizeAttr = line.dataset.direction === 'x' ? width : height;
        if (line === ls.xHigh || line === ls.yLow) lines.updateLinePosition(line, Math.max(otherLinePos + 1, Math.min(sizeAttr - 1, position)));
        else lines.updateLinePosition(line, Math.max(1, Math.min(otherLinePos - 1, position)));
    },
    showLines: () => lines.parent.classList.remove('hidden'),
    hideLines: () => lines.parent.classList.add('hidden'),
    initialiseTextPosition: () => {
        lines.lines.xHigh.nextElementSibling.setAttribute('y', height / 2);
        lines.lines.xLow.nextElementSibling.setAttribute('y', height / 2);
        lines.lines.yHigh.nextElementSibling.setAttribute('x', width / 2);
        lines.lines.yLow.nextElementSibling.setAttribute('x', width / 2);
    },
    initialise: () => {
        for (const name in lines.lines) {
            const line = lines.lines[name], [otherDir, sizeAttr] = line.dataset.direction === 'x' ? ['y', height] : ['x', width];
            line.setAttribute(`${otherDir}1`, 0);
            line.setAttribute(`${otherDir}2`, sizeAttr);
        }
        lines.initialiseTextPosition();
    }
}
lines.lineArray = [lines.lines.xHigh, lines.lines.xLow, lines.lines.yHigh, lines.lines.yLow];

const erasing = {
    show: () => {
        erasing.elem.classList.remove('hidden');
        erasing.svg.setAttributeNS(null, 'width', '0');
    },
    hide: () => {
        document.getElementById('erasing').classList.add('hidden');
    },
    begin: (x) => {
        erasing.show();
        erasing.x = Math.max(Math.min(+x, width), 0);
        erasing.svg.setAttributeNS(null, 'x', x);
    },
    move: (x) => {
        x = +x;
        if (x < erasing.x) {
            erasing.svg.setAttributeNS(null, 'width', `${erasing.x - x}px`);
            erasing.svg.setAttributeNS(null, 'x', x);
        } else {
            erasing.svg.setAttributeNS(null, 'width', `${x - erasing.x}px`);
            erasing.svg.setAttributeNS(null, 'x', erasing.x);
        }
    },
    finish: (x) => {
        x = Math.max(Math.min(+x, width), 0);
        worker.eraseRegion(...(erasing.x < x) ? [erasing.x, x] : [x, erasing.x]);
        erasing.svg.setAttributeNS(null, 'width', '0');
    },
    init: () => {
        erasing.elem = document.getElementById('erasing');
        erasing.svg = erasing.elem.firstElementChild;
    }
}
erasing.init();

const image = document.getElementById('uploadedImage');
image.getMouseCoords = (e) => {
    const r = image.getBoundingClientRect(), x = e.clientX, y = e.clientY;
    return {
        x: x,
        y: y,
        xRel: x - r.left,
        yRel: y - r.top
    }
}
image.isValid = () => image.src.startsWith('blob:');
image.saveLines = () => {
    const imageData = imageMap.get(image.src), lineData = {};
    if (imageData) {
        for (const name in lines.lines) lineData[name] = lines.getPosition(lines.lines[name]);
        imageData.lines = lineData;
    }
}
image.loadLines = () => {
    const prev = imageMap.get(image.src).lines;
    for (const name in lines.lines) lines.setPosition(lines.lines[name], prev[name]);
    lines.initialise();
    lines.showLines();
}

const preferences = {
    SPLHigher: () => document.getElementById('SPLHigher').value,
    SPLLower: () => document.getElementById('SPLLower').value,
    FRHigher: () => document.getElementById('FRHigher').value,
    FRLower: () => document.getElementById('FRLower').value,

    snapToLines: () => document.getElementById('snapToLines').checked,

    colourTolerance: () => document.getElementById('colourTolerance').value || defaults.colourTolerance,

    PPO: () => document.getElementById('PPO').value || defaults.ppo,
    delimitation: () => document.getElementById('delimitation').value || defaults.delimitation,
    lowFRExport: () => document.getElementById('lowFRExport').value || defaults.lowFRExport,
    highFRExport: () => document.getElementById('highFRExport').value || defaults.highFRExport,
}

const indefinitePopup = (message) => {
    createPopup(message).then(_ => indefinitePopup(message)).catch(_ => indefinitePopup(message));
}

const buttons = {
    resetButtons: () => {
        document.querySelectorAll('#sidebar [data-default]').forEach((e) => {e.textContent = e.dataset.default;});
        CURRENT_MODE = null;
        MODE_RESET_CB?.();
    },
    enableButtons: () => {
        document.querySelectorAll('[data-disabled]').forEach((e) => {e.disabled = false;});
    },
    disableButtons: () => {
        document.querySelectorAll('[data-disabled]').forEach((e) => {e.disabled = true;});
    },
    toggleHistory: ({undo, redo}) => {
        document.getElementById('undo').disabled = !undo;
        document.getElementById('redo').disabled = !redo;
    }
}
{ // Handling modes with buttons
    const MODE_BUTTON_IDS = ['selectPath', 'selectPoint', 'eraseRegion'];
    const ENABLE_CALLBACK = {
        'path': lines.hideLines,
        'point': lines.hideLines,
        'erase': () => {
            lines.hideLines();
            erasing.show();
        }
    }
    const DISABLE_CALLBACK = {
        'path': lines.showLines,
        'point': lines.showLines,
        'erase': () => {
            erasing.hide();
            lines.showLines();
        }
    }
    const cb = (e) => {
        const button = e.target, mode = button.dataset.mode, previousMode = JSON.parse(JSON.stringify(CURRENT_MODE));
        buttons.resetButtons();
        if (previousMode === mode) {
            MODE_RESET_CB?.();
            CURRENT_MODE = null;
        } else {
            button.textContent = button.dataset.active;
            MODE_RESET_CB?.();
            MODE_RESET_CB = DISABLE_CALLBACK[mode];
            CURRENT_MODE = mode;
            ENABLE_CALLBACK[mode]();
        }
    }

    for (const button of MODE_BUTTON_IDS) document.getElementById(button).addEventListener('click', cb);
}

const worker = {
    worker: (() => {
        const w = new Worker("./worker.js");
        w.onmessage = (e) => {
            const data = e.data, type = data.type;

            switch (type) {
                case 'exportTrace': {
                    const a = document.createElement("a"),
                        url = URL.createObjectURL(new Blob([data.export], {type: "text/plain;charset=utf-8"}));
                    a.href = url;
                    a.download = "trace.txt";
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 0);
                    break;
                }
                case 'error': {
                    waitingOverlay.removeOverlays();
                    indefinitePopup(data.message);
                    break;
                }
                case 'getHistoryStatus': {
                    buttons.toggleHistory(data);
                    break;
                }
                case 'setData': {
                    console.timeEnd("Initialise image");
                    break;
                }
                default: {
                    if (image.src === data.src) {
                        if (type === 'getPixelColour') glass.setColour(data.pixelColour);
                        else if (type === 'snapLine') lines.setPosition(lines.lines[data.line.name], data.line.position);
                        else {
                            graphs.setTracePath(data.svg);
                            waitingOverlay.removeOverlays();
                            worker.postMessage({type: 'getHistoryStatus'});
                        }
                        break;
                    }
                }
            }
        }
        return w;
    })(),
    postMessage: (data) => image.isValid() && worker.worker.postMessage({src: image.src, ...data}),
    setCurrent: () => worker.postMessage({type: 'setCurrent'}),
    removeImage: (src) => worker.postMessage({type: 'removeImage', src: src}),
    addImage: (width, height) => {
        const processing_canvas = document.createElement("canvas"),
            processing_context = processing_canvas.getContext('2d');
        processing_canvas.width = width;
        processing_canvas.height = height;
        processing_context.drawImage(image, 0, 0);
        const imageData = processing_context.getImageData(0, 0, width, height);
        worker.postMessage({
            type: 'setData', data: imageData.data, width, height
        }, [imageData.data.buffer]);
    },
    clearTrace: () => worker.postMessage({type: 'clearTrace'}),
    undoTrace: () => worker.postMessage({type: 'undoTrace'}),
    redoTrace: () => worker.postMessage({type: 'redoTrace'}),
    eraseRegion: (begin, end) => worker.postMessage({type: 'eraseRegion', begin, end}),
    smoothTrace: () => worker.postMessage({type: 'smoothTrace'}),
    exportTrace: () => {
        const hasNullOrEmpty = (obj) => {
            return Object.values(obj).some(value => {
                if (value && typeof value === 'object') {
                    return hasNullOrEmpty(value);
                }
                return value === null || value === '';
            });
        };
        const data = {
            type: 'exportTrace',
            PPO: preferences.PPO(),
            delim: preferences.delimitation(),
            lowFR: preferences.lowFRExport(),
            highFR: preferences.highFRExport(),
            SPL: {
                top: preferences.SPLHigher(),
                topPixel: lines.getPosition(lines.lines.yHigh),
                bottom: preferences.SPLLower(),
                bottomPixel: lines.getPosition(lines.lines.yLow)
            },
            FR: {
                top: preferences.FRHigher(),
                topPixel: lines.getPosition(lines.lines.xHigh),
                bottom: preferences.FRLower(),
                bottomPixel: lines.getPosition(lines.lines.xLow),
            }
        }
        if (hasNullOrEmpty(data)) createPopup("Please fill in all required values to export (SPL and FR values)");
        else worker.postMessage(data);
    },
    addPoint: (x, y) => worker.postMessage({type: 'addPoint', x: x, y: y}),
    autoTrace: () => {
        worker.postMessage({type: 'autoTrace', colourTolerance: preferences.colourTolerance()});
    },
    trace: (x, y) => {
        worker.postMessage({type: 'trace', x: x, y: y, colourTolerance: preferences.colourTolerance()});
    },
    snapLine: (line, direction) => {
        worker.postMessage({
            type: 'snapLine',
            line: {name: line.id, position: lines.getPosition(line), direction: line.dataset.direction},
            direction
        });
    },
    getPixelColour: (x, y) => worker.postMessage({type: 'getPixelColour', x, y}),
    getCurrentPath: () => worker.postMessage({type: 'getCurrentPath'})
}

const graphs = {
    updateSize: () => {
        for (const e of document.querySelectorAll('svg')) {
            e.setAttribute("width", width);
            e.setAttribute("height", height);
            e.setAttribute("viewBox", `0 0 ${width} ${height}`);
        }
    },
    setTracePath: (d) => {
        const trace = document.getElementById('trace'), path = trace.lastElementChild, path2 = trace.firstElementChild;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#ff0000');
        path.setAttribute('stroke-width', lineWidth);
        path2.setAttribute('d', d);
        path2.setAttribute('stroke-width', lineWidth * 1.5);
    },
    clearTracePath: () => {
        graphs.setTracePath('');
    }
}

document.getElementById('autoPath').addEventListener('click', worker.autoTrace);
document.getElementById('undo').addEventListener('click', worker.undoTrace);
document.getElementById('redo').addEventListener('click', worker.redoTrace);
document.getElementById('clearPath').addEventListener('click', worker.clearTrace);
document.getElementById('export').addEventListener('click', worker.exportTrace);
document.getElementById('smoothTrace').addEventListener('click', worker.smoothTrace);

const imageMap = new Map();
const fileInput = document.getElementById('fileInput');

const imageQueue = {
    elem: document.getElementById('imageQueueInner'),
    removeSelectedImage: () => {
        for (const i of imageQueue.elem.querySelectorAll('img[class="selectedImage"]')) i.classList.remove('selectedImage');
    },
    deleteImage: (img) => {
        imageMap.delete(img.src);
        worker.removeImage(img.src);
        URL.revokeObjectURL(img.src);
        img.remove();
    },
    scrollToSelected: () => {
        imageQueue.elem.querySelector('img[class="selectedImage"]').scrollIntoView({inline: 'center', behavior: 'smooth'});
    },
    addImage: (src, display=false) => {
        const img = document.createElement('img'),
            a = document.getElementById('imageQueueInner');
        img.src = src;
        imageMap.set(img.src, {
            initial: true
        });
        img.addEventListener('dragstart', (e) => e.preventDefault());
        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            image.saveLines();
            image.src = src;
            imageQueue.removeSelectedImage();
            img.classList.add('selectedImage');
            imageQueue.scrollToSelected();
        });
        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (img.classList.contains('selectedImage')) {
                let newImage = img.nextElementSibling;
                if (!newImage) newImage = img.previousElementSibling;
                if (!newImage) initAll();
                else newImage.click();
            }
            imageQueue.deleteImage(img);
        })
        a.appendChild(img);
        if (display) {
            img.click();
            setTimeout(() => imageQueue.scrollToSelected(), 50);
        }
        return img;
    },
    toggle: (e) => {
        const button = e.target;
        document.getElementById('imageContainer').addEventListener('transitionend', () => window.dispatchEvent(new Event('resize')), {once: true});
        if (button.textContent === button.dataset.active) {
            button.textContent = button.dataset.default;
            button.removeAttribute('active');
        } else {
            button.textContent = button.dataset.active;
            button.setAttribute('active', '');
        }
    }
}
document.getElementById('removeImage').addEventListener('click', () => document.querySelector('img[class="selectedImage"]')?.dispatchEvent(new Event('contextmenu')));
document.getElementById('toggleImageQueue').addEventListener('click', imageQueue.toggle);

// Initialise the page
resetToDefault();
initAll();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/")), lastId = validFiles.length - 1;
    if (validFiles.length > 0) {
        clearPopups();
        validFiles.forEach((file, index) => {
            file = URL.createObjectURL(file);
            imageQueue.addImage(file, index === lastId);
        });
    }
    else createPopup("Invalid image/file(s) added!");
}
fileInput.addEventListener('change', (e) => {
    fileInput.loadFiles(e.target.files);
});

image.addEventListener('dragstart',(e) => e.preventDefault());

document.getElementById('fileInputButton').addEventListener('click', () => fileInput.click());

{ // Pasting file stuff
    document.addEventListener('paste', (e) => {
        e.preventDefault();
        const d = new DataTransfer();
        for (const item of (e.clipboardData || window?.clipboardData).items) {
            if (item.kind === 'file') d.items.add(item.getAsFile());
        }
        if (d.files.length > 0) fileInput.loadFiles(d.files);
    });
}

{ // Drag and drop stuff
    multiEventListener('dragover', document.body, (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('lowOpacity');
    });
    multiEventListener(['dragleave', 'dragend'], document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
    });
    multiEventListener('drop', document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
        fileInput.loadFiles(e.dataTransfer.files);
    });
}

{ // magnifying glass stuff
    image.addEventListener('pointermove', (e) => {
        if (CURRENT_MODE !== 'erase') {
            e.preventDefault();
            const parentElement = image.parentElement,
                parentRect = parentElement.getBoundingClientRect(), m = image.getMouseCoords(e);
            glass.style.left = `${Math.min(m.x - parentRect.left, parentElement.clientWidth - glass.clientWidth)}px`;
            glass.style.top = `${Math.min(m.y - parentRect.top, parentElement.clientHeight - glass.clientHeight)}px`;
            glass.img.style.left = `${(m.xRel * MAGNIFICATION - (glass.clientWidth / 2)) * -1}px`;
            glass.img.style.top = `${(m.yRel * MAGNIFICATION - (glass.clientHeight / 2)) * -1}px`;
            worker.getPixelColour(m.xRel * sizeRatio, m.yRel * sizeRatio);
            glass.classList.remove('hidden');
        }
    });
    multiEventListener(['pointerup', 'pointerleave', 'pointerout', 'pointercancel'], image, () => glass.classList.add('hidden'));
}

{ // Move canvas lines
    let selectedLine = null, getCoords = image.getMouseCoords;

    lines.parent.addEventListener('pointerdown', (e) => {
        const m = getCoords(e);
        const sizes = {
            x: width * 0.02,
            y: height * 0.02
        }
        for (const line of lines.lineArray) line.offset = m[`${line.dataset.direction}Rel`] * sizeRatio - lines.getPosition(line);
        const closest = lines.lineArray.reduce((acc, curr) => Math.abs(curr.offset) < Math.abs(acc.offset) ? curr : acc, lines.lineArray[0]);
        if (Math.abs(closest.offset) < sizes[closest.dataset.direction]) selectedLine = closest;
    });

    lines.parent.addEventListener('pointermove', (e) => {
        if (selectedLine) lines.setPosition(selectedLine, getCoords(e)[`${selectedLine.dataset.direction}Rel`] * sizeRatio - selectedLine.offset);
    });

    multiEventListener(['pointerup', 'pointerleave', 'pointercancel'], lines.parent, (e) => {
        e.preventDefault();
        selectedLine = null;
    });
}

{ // Move canvas lines with buttons
    let holdInterval, line, snap = preferences.snapToLines();
    document.getElementById('snapToLines').addEventListener('change', () => snap = preferences.snapToLines());

    document.getElementById('buttonSection').addEventListener('pointerdown', (e) => {
        const t = e.target, p = t.parentNode;
        if (!holdInterval && p.classList.contains('moveButtons')) {
            e.preventDefault();
            line = lines.lines[p.dataset.for];
            if (!snap) {
                holdInterval = setInterval(() => {
                    lines.setPosition(line, lines.getPosition(line) + parseInt(t.dataset.direction) * sizeRatio);
                }, 10);
            } else worker.snapLine(lines.lines[p.dataset.for], parseInt(t.dataset.direction));
        }
    });

    multiEventListener(['pointerup', 'pointerleave', 'pointerout', 'pointercancel'], document.getElementById('buttonSection'), (e) => {
        e.preventDefault();
        clearInterval(holdInterval);
        holdInterval = null;
    });
}

window.addEventListener('resize', () => {
    updateSizeRatio();
    lines.updateLineWidth();
    glass.updateImage();
});

{ // Image click handling
    const callbacks = {
        path: worker.trace,
        point: worker.addPoint
    }
    image.addEventListener('click', (e) => {
        if (CURRENT_MODE != null) {
            const m = image.getMouseCoords(e);
            callbacks[CURRENT_MODE]?.(m.xRel * sizeRatio, m.yRel * sizeRatio);
        }
    });
    let holding = false;
    image.addEventListener('pointerdown', (e) => {
        if (CURRENT_MODE === 'erase') {
            e.preventDefault();
            holding = true;
            erasing.begin(image.getMouseCoords(e).xRel * sizeRatio);
            document.addEventListener('pointerup', eraseStop, {once: true});
        }
    });
    image.addEventListener('pointermove', (e) => {
        if (holding && CURRENT_MODE === 'erase') {
            e.preventDefault();
            erasing.move(image.getMouseCoords(e).xRel * sizeRatio);
        }
    });
    const eraseStop = (e) => {
        if (holding && CURRENT_MODE === 'erase') {
            e.preventDefault();
            holding = false;
            erasing.finish(image.getMouseCoords(e).xRel * sizeRatio);
        }
    }
}

// where everything starts
image.addEventListener('load', () => {
    document.getElementById('defaultMainText').classList.add('hidden');
    buttons.enableButtons();
    buttons.resetButtons();
    updateSizes();
    erasing.hide();
    graphs.updateSize();
    graphs.clearTracePath();
    glass.updateImage();

    const imageData = imageMap.get(image.src);
    if (imageData.initial) {
        waitingOverlay.createOverlay();
        console.time("Initialise image");
        worker.addImage(width, height); // implicitly sets as current
        lines.setPosition(lines.lines.xHigh, width);
        lines.setPosition(lines.lines.xLow, 0);
        lines.setPosition(lines.lines.yHigh, 0);
        lines.setPosition(lines.lines.yLow, height);
        lines.initialise();
        lines.showLines();
        worker.snapLine(lines.lines.xHigh, -1);
        worker.snapLine(lines.lines.xLow, 1);
        worker.snapLine(lines.lines.yHigh, 1);
        worker.snapLine(lines.lines.yLow, -1);
        worker.autoTrace();
        imageData.initial = false;
    } else {
        worker.setCurrent();
        image.loadLines();
        worker.getCurrentPath();
    }
    lines.updateLineWidth();
});

{ // keybindings
    const pointerDown = new PointerEvent('pointerdown', {bubbles: true}), pointerUp = new PointerEvent('pointerup', {bubbles: true});
    const keydownMap = {
        'escape': clearPopups,
        'z': (e) => e.ctrlKey && document.getElementById(e.shiftKey ? 'redo' : 'undo').click(),
        'a': () => document.getElementById('autoPath').click(),
        't': () => document.getElementById('selectPath').click(),
        'p': () => document.getElementById('selectPoint').click(),
        'h': () => document.getElementById('toggleImageQueue').click(),
        's': (e) => document.getElementById(e.ctrlKey ? 'export' : 'smoothTrace').click(),
        'e': () => document.getElementById('eraseRegion').click(),
        'enter': () => document.getElementById('fileInputButton').click(),
        'delete': () => document.getElementById('removeImage').click(),
        'backspace': () => document.getElementById('clearPath').click(),
        'arrowup': (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerDown),
        'arrowdown': (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerDown),
        'arrowleft': (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerDown),
        'arrowright': (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerDown),
    };
    const keyupMap = {
        'arrowup': (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerUp),
        'arrowdown': (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerUp),
        'arrowleft': (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerUp),
        'arrowright': (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerUp),
    };
    document.addEventListener('keydown', (e) => {
        const cb = keydownMap[e.key.toLowerCase()];
        if (!e.target.closest('input') && cb) {
            e.preventDefault();
            cb(e);
        }
    });
    document.addEventListener('keyup', (e) => {
        const cb = keyupMap[e.key.toLowerCase()];
        if (!e.target.closest('input') && cb) {
            e.preventDefault();
            cb(e);
        }
    });
}

// Helper Functions
function multiEventListener(events, target, callback) {
    if (typeof (events) !== "object") events = [events];
    events.forEach((ev) => target.addEventListener(ev, callback));
}

function initAll() {
    document.getElementById('defaultMainText').classList.remove('hidden');
    buttons.disableButtons();
    buttons.resetButtons();
    lines.hideLines();
    erasing.hide();
    graphs.clearTracePath();
    image.src = '';
}

function updateSizes() {
    width = image.naturalWidth;
    height = image.naturalHeight;
    lineWidth = Math.max(width, height) * 0.003;
    updateSizeRatio();
}

function updateSizeRatio() {
    sizeRatio = width / image.clientWidth;
}

{
    const minVal = (e) => {
        e = e.target;
        if (e.value < e.min) e.value = e.min;
    }

    for (const id of ['FRLower', 'colourTolerance', 'lowFRExport']) {
        document.getElementById(id).addEventListener('change', minVal);
    }
}