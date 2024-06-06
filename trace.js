'use strict';

// global constants
let svg = document.getElementById('trace');
const image = document.getElementById('uploadedImage'),

    pointButton = document.getElementById('selectPoint'),
    pathButton = document.getElementById('selectPath'),

    lineCanvas = document.getElementById('lineCanvas'),

    main = document.getElementById('main'),

    fileInput = document.getElementById('imageInput'),

    state = State(),

    defaults = {
        "colourTolerance": 50,
        "maxLineHeightOffset": 0,
        "maxJumpOffset": 0,

        "PPO": 48,
        "delimitation": "tab",
        "lowFRExport": 20,
        "highFRExport": 20000,
        "exportSPLPrecision": 3,
        "exportFRPrecision": 5,

        "moveSpeedOffset": 0,

        "SPLTop": "",
        "SPLBot": "",
        "FRTop": "",
        "FRBot": ""
    };

// create global variables
let worker, hLineMoveSpeed, vLineMoveSpeed, lines, sizeRatio, lineWidth, imageData;

// call initial functions
restoreDefault();
createWorker();

// functions
const drawLines = getDrawLines();

// assign event listeners
multiEventListener('dragstart', image, (e) => e.preventDefault());
multiEventListener('click', document.getElementById('imageInputDiv'), () => fileInput.click());
multiEventListener('click', document.getElementById("restoreDefault"), () => restoreDefault());
multiEventListener('click', pathButton, () => state.togglePath());
multiEventListener('click', pointButton, () => state.togglePoint());
multiEventListener('change', fileInput, () => state.loadNewImage());

{ // Drag and drop stuff
    multiEventListener('dragover', main, (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
        main.classList.add('lowOpacity');
    });
    multiEventListener(['dragleave', 'dragend'], main, (e) => {
        e.preventDefault();
        main.classList.remove('lowOpacity');
    });
    multiEventListener('drop', main, (e) => {
        e.preventDefault();
        main.style.opacity = "1";
        fileInput.files = e.dataTransfer.files;
        let event = new Event('change');
        fileInput.dispatchEvent(event);
    });
}

{ // magnifying glass stuff
    const glass = document.getElementById('glass');
    multiEventListener(['mousemove'], image, (e) => {
        e.preventDefault();
        const parentRect = image.parentElement.getBoundingClientRect(),
            m = getMouseCoords(e);
        glass.style.left = `${m.x - parentRect.left}px`;
        glass.style.top = `${m.y - parentRect.top}px`;
        const v = (Math.floor((m.yRel) * sizeRatio) * imageData.width * 4) + (Math.floor((m.xRel) * sizeRatio) * 4);
        glass.style.backgroundColor = `rgb(${imageData.data[v]}, ${imageData.data[v + 1]}, ${imageData.data[v + 2]})`;
        glass.classList.remove('hidden');
    });
    multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], image, () => glass.classList.add('hidden'));
}

multiEventListener('load', image, () => {
    document.querySelectorAll("[temp_thing='true']").forEach((e) => e.remove());
    document.querySelectorAll("button[class='disableme']").forEach((b) => b.disabled = false);

    lineCanvas.width = image.naturalWidth;
    lineCanvas.height = image.naturalHeight;
    svg.setAttribute("width", image.naturalWidth);
    svg.setAttribute("height", image.naturalHeight);
    svg.setAttribute("viewBox", `0 0 ${image.naturalWidth} ${image.naturalHeight}`);

    updateSizeRatio();
    updateLineWidth();
    updateLineMoveSpeed();
    setUpImageData();

    lines = [
        {pos: lineCanvas.width * 0.1, type: "Low", dir: "x"},
        {pos: lineCanvas.width * 0.9, type: "High", dir: "x"},
        {pos: lineCanvas.height * 0.1, type: "High", dir: "y"},
        {pos: lineCanvas.height * 0.9, type: "Low", dir: "y"}
    ]

    drawLines();
});

multiEventListener('resize', window, () => {
    updateSizeRatio();
    drawLines();
});

{ // Move canvas lines with mouse
    let selectedLine = null, offset = 0;

    multiEventListener('mousedown', lineCanvas, (e) => {
        const m = getMouseCoords(e);
        let t;

        for (const line of lines) {
            if (line.dir === "x") t = lineCanvas.width * 0.02;
            else t = lineCanvas.height * 0.02;
            offset = m[`${line.dir}Rel`] * sizeRatio - line.pos;
            if (Math.abs(offset) < t) {
                selectedLine = line;
                return;
            }
        }
    });

    multiEventListener('mousemove', lineCanvas, (e) => {
        if (selectedLine) {
            const m = getMouseCoords(e);
            selectedLine.pos = Math.floor(m[`${selectedLine.dir}Rel`] * sizeRatio - offset);
            drawLines();
        }
    });

    multiEventListener(['mouseup', 'mouseleave', 'mouseout'], lineCanvas, (e) => {
        e.preventDefault();
        selectedLine = null;
    });
}

{ // Move lines on canvas with buttons
    function moveLine(line, button) {
        if (line.dir === "x") line.pos += hLineMoveSpeed * button.getAttribute("dir");
        else line.pos += vLineMoveSpeed * button.getAttribute("dir");
        drawLines();
    }
    let holdInterval;
    document.querySelectorAll("button[move='true']").forEach((btn) => {
        multiEventListener(['mousedown', 'touchstart'], btn, (e) => {
            e.preventDefault();
            holdInterval = setInterval(() => {
                switch (e.target.getAttribute('btn-name')) {
                    case 'spltop': {
                        moveLine(lines[2], e.target);
                        break;
                    }
                    case 'splbot': {
                        moveLine(lines[3], e.target);
                        break;
                    }
                    case 'frtop': {
                        moveLine(lines[1], e.target);
                        break;
                    }
                    case 'frbot': {
                        moveLine(lines[0], e.target);
                        break;
                    }
                }
            }, 50);
        });

        multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], btn, (e) => {
            e.preventDefault();
            clearInterval(holdInterval);
        });
    });
}

multiEventListener('click', image, (e) => {
    const m = getMouseCoords(e),
        x = m.xRel * sizeRatio,
        y = m.yRel * sizeRatio;

    if (state.checkState(state.States.selectingPath)) {
        state.toggleTrace();
        worker.postMessage({
            type: 'trace',
            x: x,
            y: y,
            lineHeightOffset: document.getElementById("maxLineHeightOffset").value,
            colourTolerance: document.getElementById("colourTolerance").value,
            maxJumpOffset: document.getElementById("maxJumpOffset").value
        });
    } else {
        state.toggleTrace();
        worker.postMessage({
            type: 'point',
            x: x,
            y: y
        });
    }
});

// disable buttons with no image loaded
document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = true);

function State() {
    const overlay = document.getElementById('overlay');

    function startImageEditing() {
        document.querySelectorAll("button[move='true']").forEach((b) => b.disabled = true);
        image.classList.add("crosshair_hover");
        image.classList.remove("removePointerEvents");
        lineCanvas.classList.add("removePointerEvents");
        lineCanvas.classList.add("hidden");
    }

    function stopImageEditing() {
        document.querySelectorAll("button[move='true']").forEach((b) => b.disabled = false);
        image.classList.remove("crosshair_hover");
        image.classList.add("removePointerEvents");
        lineCanvas.classList.remove("removePointerEvents");
        lineCanvas.classList.remove("hidden");
    }

    function buttonsToDefault() {
        [pathButton, pointButton].forEach(btn => {
            btn.disabled = false;
            btn.innerText = btn.getAttribute("def");
        });
    }

    class State {
        States = {
            initial: 0,
            imageLoaded: 1,
            selectingPath: 2,
            selectingPoint: 3
        }
        state = this.States.initial;

        updateState(newState) {
            this.state = newState;
        }

        checkState(states) {
            if (typeof (states) !== "object") states = [states];
            for (let s of states) if (s === this.state) return true;
            return false;
        }

        loadNewImage() {
            buttonsToDefault();
            stopImageEditing();
            image.src = URL.createObjectURL(document.getElementById('imageInput').files[0]);
            this.updateState(this.States.imageLoaded);
            clearPath();
        }

        togglePath() {
            buttonsToDefault();
            if (this.checkState([this.States.imageLoaded, this.States.selectingPoint])) {
                startImageEditing();
                pathButton.innerText = pathButton.getAttribute("alt");
                this.updateState(this.States.selectingPath);
            } else if (this.checkState(this.States.selectingPath)) {
                stopImageEditing();
                this.updateState(this.States.imageLoaded);
            }
        }

        togglePoint() {
            buttonsToDefault();
            if (this.checkState([this.States.imageLoaded, this.States.selectingPath])) {
                startImageEditing();
                pointButton.innerText = pointButton.getAttribute("alt");
                this.updateState(this.States.selectingPoint);
            } else if (this.checkState(this.States.selectingPoint)) {
                stopImageEditing();
                this.updateState(this.States.imageLoaded);
            }
        }

        toggleTrace() {
            overlay.classList.toggle("hidden");
            main.classList.toggle("lowOpacity");
            main.classList.toggle("not_allowed");
            main.classList.toggle("removePointerEvents");
        }
    }

    return new State();
}

function clearPath(no) { // put in a random string to not post to worker
    const newSvg = svg.cloneNode(false);
    svg.parentElement.replaceChild(newSvg, svg);
    svg = newSvg;
    if (worker && !no) worker.postMessage({type: "clear"});
}

function exportTrace() {
    let SPLTop = document.getElementById("SPLTop").value;
    let SPLBot = document.getElementById("SPLBot").value;
    let FRTop = document.getElementById("FRTop").value;
    let FRBot = document.getElementById("FRBot").value;

    if (!SPLTop || !SPLBot || !FRTop || !FRBot) {
        let btn = document.getElementById("export");
        btn.innerText = "Please Fill in All Values Below (Export Trace)";
        setTimeout(() => btn.innerText = "Export Trace", 5000);
        return;
    }

    worker.postMessage({
        type: "export",
        SPL: {
            top: SPLTop,
            topPixel: lines[2].pos,
            bottom: SPLBot,
            bottomPixel: lines[3].pos
        },
        FR: {
            top: FRTop,
            topPixel: lines[1].pos,
            bottom: FRBot,
            bottomPixel: lines[0].pos,
        },
        lowFR: document.getElementById("lowFRExport").value,
        highFR: document.getElementById("highFRExport").value,
        FRPrecision: document.getElementById("exportFRPrecision").value,
        SPLPrecision: document.getElementById("exportSPLPrecision").value,
        PPO: document.getElementById("PPO").value,
        delim: document.getElementById("delimitation").value
    });
}

function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}

function undo() {
    if (worker) {
        state.toggleTrace();
        worker.postMessage({type: "undo"});
    }
}

function restoreDefault() {
    for (const val in defaults) {
        document.getElementById(val).value = defaults[val];
    }
}

function updateLineMoveSpeed() {
    hLineMoveSpeed = Math.max(1, parseInt(document.getElementById("moveSpeedOffset").value) + Math.floor(image.naturalWidth * 0.004));
    vLineMoveSpeed = Math.max(1, parseInt(document.getElementById("moveSpeedOffset").value) + Math.floor(image.naturalHeight * 0.004));
}

function updateSizeRatio() {
    sizeRatio = image.naturalWidth / image.clientWidth;
}

function updateLineWidth() {
    lineWidth = image.naturalHeight * 0.006;
}

function createWorker() {
    if (!worker) {
        clearPath();
        worker = new Worker("./worker.js");
        worker.onmessage = (e) => {
            if (e.data['type'] === "done") {
                clearPath("lmfao");
                const traceData = e.data['trace'];
                if (traceData.length > 1) {
                    for (let i = 0; i < traceData.length - 1; i++) {
                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', traceData[i][0]);
                        line.setAttribute('y1', traceData[i][1]);
                        line.setAttribute('x2', traceData[i + 1][0]);
                        line.setAttribute('y2', traceData[i + 1][1]);
                        line.setAttribute('stroke', e.data['colour']);
                        line.setAttribute('stroke-width', lineWidth);
                        svg.appendChild(line);
                    }
                }
                state.toggleTrace();
            } else {
                let a = document.createElement("a");
                let url = URL.createObjectURL(new Blob([e.data['export']], {type: "text/plain;charset=utf-8"}));
                a.href = url;
                a.download = "trace.txt";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 0);
            }
        }
    }
}

function multiEventListener(events, target, callback) {
    if (typeof (events) !== "object") events = [events];
    events.forEach((ev) => target.addEventListener(ev, callback));
}

function getDrawLines() {
    const lineCanvasCtx = lineCanvas.getContext("2d");
    let c, posCheck;

    function drawLines() {
        lineCanvasCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
        lineCanvasCtx.font = `${1.3 * sizeRatio}rem arial`
        lineCanvasCtx.lineWidth = sizeRatio;
        lineCanvasCtx.fillStyle = '#ff0000';

        lines.forEach((line) => {
            lineCanvasCtx.beginPath();
            if (line.dir === "x") {
                c = 'green';
                posCheck = lineCanvas.width;
                lineCanvasCtx.moveTo(line.pos, 0);
                lineCanvasCtx.lineTo(line.pos, lineCanvas.height);
                lineCanvasCtx.fillText(line.type, line.pos + 5, lineCanvas.height * 0.5);
            } else {
                c = 'blue';
                posCheck = lineCanvas.height;
                lineCanvasCtx.moveTo(0, line.pos);
                lineCanvasCtx.lineTo(lineCanvas.width, line.pos);
                lineCanvasCtx.fillText(line.type, lineCanvas.width * 0.5, line.pos - 5);
            }
            lineCanvasCtx.strokeStyle = c;
            line.pos = Math.floor(Math.max(posCheck * 0.02, Math.min(posCheck * 0.98, line.pos)));
            lineCanvasCtx.stroke();
        });
    }

    return drawLines;
}

function getMouseCoords(e) {
    const r = image.getBoundingClientRect(), x = e.clientX, y = e.clientY;
    return {
        x: x,
        y: y,
        xRel: x - r.left,
        yRel: y - r.top
    }
}

function setUpImageData() {
    const processing_canvas = document.createElement("canvas");
    const processing_context = processing_canvas.getContext('2d');
    processing_canvas.width = image.naturalWidth;
    processing_canvas.height = image.naturalHeight;

    const new_image = new Image;
    new_image.src = image.src;
    processing_context.drawImage(new_image, 0, 0);
    imageData = processing_context.getImageData(0, 0, new_image.naturalWidth, new_image.naturalHeight);
    worker.postMessage({
        type: 'setData',
        imageData: imageData
    });
}
